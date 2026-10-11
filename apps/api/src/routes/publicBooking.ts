import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, PlanLimitError, resolveTenantPlan } from '@asistente/database';
import { SchedulerService, normalizeMexicanPhone } from '@asistente/ai-agent';
import { createLogger } from '@asistente/observability';
import { actorFromRequest } from '../lib/audit.js';
import { HttpError } from '../lib/http.js';
import { enqueueAppointmentConfirmation } from '../services/queue/handlers.js';

const logger = createLogger('api:public-booking');

/**
 * Portal público de citas: el paciente agenda solo en `/agenda/<slug>`.
 *
 * Son las únicas rutas de `/api` sin sesión, así que exponen lo mínimo:
 *  - Solo clínicas activas, no suspendidas, con onboarding terminado y el
 *    portal encendido (`Tenant.publicBookingEnabled`). Cualquier otro caso
 *    responde 404, igual que un slug inexistente: no se revela que existe.
 *  - Catálogo público (nombre, dirección, servicios con precio y anticipo,
 *    doctores). Nada de pacientes ni de la agenda ajena: los horarios libres
 *    salen sin decir quién ocupa los demás.
 *  - Agendar reutiliza `SchedulerService.bookAppointment`, con todas sus
 *    reglas (horario del doctor, choques, cupo del plan, auditoría), con
 *    actor ANONYMOUS y sin renombrar a un paciente existente.
 *  - Contra abuso: límite por IP, campo trampa para bots, tope de citas
 *    futuras por teléfono, y la confirmación llega por WhatsApp al número
 *    capturado (quien agenda con un teléfono ajeno no ve nada de vuelta).
 */

const MAX_DAYS_AHEAD = 60;
/** Citas futuras agendadas por el portal que puede tener un mismo teléfono. */
const MAX_PORTAL_APPOINTMENTS_PER_PHONE = 2;
const NOT_HAPPENING = ['CANCELLED', 'NO_SHOW'];

async function findPublicClinic(slug: string) {
  const tenant = await db.tenant.findFirst({
    where: { slug: slug.toLowerCase(), isActive: true, publicBookingEnabled: true, onboardingCompletedAt: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      phoneE164: true,
      timezone: true,
      isActive: true,
      planSlug: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });
  if (!tenant || resolveTenantPlan(tenant).isSuspended) {
    throw new HttpError(404, 'Esta clínica no tiene agenda en línea disponible');
  }
  return tenant;
}

const bookSchema = {
  body: {
    type: 'object',
    required: ['serviceId', 'doctorId', 'startTime', 'fullName', 'phone', 'acceptPrivacy'],
    properties: {
      serviceId: { type: 'string', minLength: 1, maxLength: 60 },
      doctorId: { type: 'string', minLength: 1, maxLength: 60 },
      startTime: { type: 'string', minLength: 10, maxLength: 40 },
      fullName: { type: 'string', minLength: 1, maxLength: 120 },
      phone: { type: 'string', minLength: 8, maxLength: 30 },
      notes: { type: 'string', maxLength: 300 },
      acceptPrivacy: { type: 'boolean' },
      // Campo trampa: invisible para personas, los bots lo llenan.
      website: { type: 'string', maxLength: 200 },
    },
    additionalProperties: false,
  },
};

export async function publicBookingRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/public/clinics/:slug',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { slug } = request.params as { slug: string };
      const tenant = await findPublicClinic(slug);
      const [services, doctors] = await Promise.all([
        db.service.findMany({
          where: { tenantId: tenant.id, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, description: true, durationMinutes: true, priceMxn: true, requiredDepositMxn: true, category: true },
        }),
        db.doctor.findMany({
          where: { tenantId: tenant.id, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, specialty: true },
        }),
      ]);
      return reply.send({
        clinic: { name: tenant.name, slug: tenant.slug, address: tenant.address, phoneE164: tenant.phoneE164, timezone: tenant.timezone },
        services,
        doctors,
        maxDaysAhead: MAX_DAYS_AHEAD,
      });
    }
  );

  fastify.get(
    '/api/public/clinics/:slug/slots',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { slug } = request.params as { slug: string };
      const query = request.query as Record<string, string | undefined>;
      const tenant = await findPublicClinic(slug);

      const date = query.date ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Fecha inválida (usa AAAA-MM-DD)');
      const requested = new Date(`${date}T12:00:00Z`);
      const daysAhead = (requested.getTime() - Date.now()) / 86_400_000;
      if (Number.isNaN(requested.getTime()) || daysAhead < -1 || daysAhead > MAX_DAYS_AHEAD) {
        throw new HttpError(400, `Solo se puede agendar dentro de los próximos ${MAX_DAYS_AHEAD} días`);
      }
      if (!query.serviceId) throw new HttpError(400, 'Elige un tratamiento');

      let slots;
      try {
        slots = await SchedulerService.getAvailableSlots({
          tenantId: tenant.id,
          targetDateStr: date,
          serviceId: query.serviceId,
          doctorId: query.doctorId || undefined,
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'No se pudieron consultar los horarios');
      }
      return reply.send({
        date,
        slots: slots.map((slot) => ({
          doctorId: slot.doctorId,
          doctorName: slot.doctorName,
          startTime: slot.startTimeIso,
          displayTime: slot.displayTime,
        })),
      });
    }
  );

  fastify.post(
    '/api/public/clinics/:slug/appointments',
    { schema: bookSchema, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as {
        serviceId: string;
        doctorId: string;
        startTime: string;
        fullName: string;
        phone: string;
        notes?: string;
        acceptPrivacy: boolean;
        website?: string;
      };
      const tenant = await findPublicClinic(slug);

      // Bot: se responde como si nada para no enseñarle qué lo delató.
      if (body.website?.trim()) {
        logger.warn('Portal de citas: envío descartado por el campo trampa', { tenantId: tenant.id });
        return reply.status(201).send({ ok: true });
      }
      if (body.acceptPrivacy !== true) {
        throw new HttpError(400, 'Para agendar debes aceptar el aviso de privacidad');
      }

      const fullName = body.fullName.trim().replace(/\s+/g, ' ');
      if (fullName.length < 3 || !/[a-záéíóúñü]/i.test(fullName)) {
        throw new HttpError(400, 'Escribe tu nombre completo');
      }
      const phoneE164 = normalizeMexicanPhone(body.phone);
      if (!/^\+52\d{10}$/.test(phoneE164)) {
        throw new HttpError(400, 'Escribe un celular de México a 10 dígitos');
      }

      const pendingForPhone = await db.appointment.count({
        where: {
          tenantId: tenant.id,
          channelOrigin: 'WEB_PORTAL',
          startTime: { gte: new Date() },
          status: { notIn: NOT_HAPPENING },
          patient: { phoneE164 },
        },
      });
      if (pendingForPhone >= MAX_PORTAL_APPOINTMENTS_PER_PHONE) {
        throw new HttpError(
          409,
          'Ya tienes citas próximas agendadas en línea. Para agendar otra, escríbenos por WhatsApp o llámanos.'
        );
      }

      const actor = { ...actorFromRequest(request), type: 'ANONYMOUS' as const, id: null, email: null, role: null };
      let appointment;
      try {
        appointment = await SchedulerService.bookAppointment({
          tenantId: tenant.id,
          patientFullName: fullName,
          patientPhone: phoneE164,
          doctorId: body.doctorId,
          serviceId: body.serviceId,
          startTimeIso: body.startTime,
          symptoms: body.notes?.trim() || undefined,
          channelOrigin: 'WEB_PORTAL',
          auditActor: actor,
          auditMetadata: { source: 'PUBLIC_PORTAL' },
          keepExistingPatientName: true,
        });
      } catch (error) {
        if (error instanceof PlanLimitError) {
          throw new HttpError(409, 'La clínica no puede recibir más citas en línea por ahora. Llámanos o escríbenos por WhatsApp.');
        }
        throw new HttpError(409, error instanceof Error ? error.message : 'No se pudo agendar la cita');
      }

      // La confirmación (con el link de anticipo si aplica) llega por WhatsApp.
      try {
        await enqueueAppointmentConfirmation(tenant.id, appointment.id);
      } catch (error) {
        logger.error('Portal de citas: no se pudo encolar la confirmación', error, { appointmentId: appointment.id });
      }

      return reply.status(201).send({
        ok: true,
        appointment: {
          id: appointment.id,
          startTime: appointment.startTime.toISOString(),
          doctorName: appointment.doctor.name,
          serviceName: appointment.service.name,
          depositRequired: appointment.paymentStatus === 'DEPOSIT_PENDING',
          depositAmountMxn: appointment.depositAmountMxn ?? null,
        },
      });
    }
  );
}
