import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { appointmentSlotKey, db, diffChanges, recordAudit } from '@asistente/database';
import { actorFromRequest } from '../../lib/audit.js';
import {
  HttpError,
  optionalString,
  requireAuthUser,
  requireMexicanPhone,
  requireRole,
  requireString,
  resolveTenantId,
} from '../../lib/http.js';
import { requirePlatformAdmin } from './common.js';
import { createTenantSchema, updateTenantSchema } from './schemas.js';

export async function tenantRoutes(fastify: FastifyInstance) {
  /**
   * Clínica del usuario autenticado.
   */
  fastify.get('/api/tenants', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuthUser(request);
    const tenants = await db.tenant.findMany({
      where: { id: user.tenantId },
      include: { doctors: true, services: true },
    });
    return reply.send(tenants);
  });

  /**
   * Detalle de la clínica del usuario por slug o ID.
   */
  fastify.get('/api/tenants/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuthUser(request);
    const { slug } = request.params as { slug: string };

    const tenant = await db.tenant.findFirst({
      where: {
        id: user.tenantId,
        OR: [{ slug }, { id: slug }],
      },
      include: { doctors: true, services: true, faqItems: true },
    });

    if (!tenant) return reply.status(404).send({ error: 'Clínica no encontrada' });
    return reply.send(tenant);
  });

  /**
   * Onboarding de una nueva clínica (solo administrador de plataforma).
   */
  fastify.post(
    '/api/tenants',
    { schema: createTenantSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      requirePlatformAdmin(request);

      const body = (request.body ?? {}) as Record<string, unknown>;
      const name = requireString(body.name, 'Nombre de la clínica', 200);
      const phoneE164 = requireMexicanPhone(body.phoneE164, 'Teléfono de la clínica');
      const address = optionalString(body.address, 'Dirección', 300);
      const city = optionalString(body.city, 'Ciudad', 120);

      const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const slug = `${baseSlug || 'clinica'}-${Date.now().toString(36)}`;

      const tenant = await db.$transaction(async (tx) => {
        const created = await tx.tenant.create({
          data: {
            name,
            slug,
            phoneE164,
            address: address || `${city || 'Ciudad de México'}, México`,
            timezone: 'America/Mexico_City',
            emergencyInstructions:
              'Acudir a urgencias o llamar al 911 en caso de dolor incapacitante o traumatismo.',
            welcomeMessage: `¡Hola! Bienvenido a ${name}. ¿En qué podemos apoyarte hoy?`,
            doctors: {
              create: [
                {
                  name:
                    optionalString(body.doctorName, 'Nombre del doctor', 200) || 'Dra. María Fernández',
                  specialty:
                    optionalString(body.doctorSpecialty, 'Especialidad', 200) ||
                    'Odontología General y Estética',
                  phone: phoneE164,
                },
              ],
            },
            services: {
              create: [
                {
                  name: 'Valoración y Diagnóstico con Rx',
                  description: 'Revisión bucodental completa con radiografía periapical.',
                  durationMinutes: 30,
                  priceMxn: 450,
                  requiredDepositMxn: 0,
                  category: 'Diagnóstico',
                },
                {
                  name: 'Limpieza Dental con Ultrasonido',
                  description: 'Profilaxis con ultrasonido y pulido dental.',
                  durationMinutes: 45,
                  priceMxn: 900,
                  requiredDepositMxn: 200,
                  category: 'Prevención',
                },
              ],
            },
          },
          include: { doctors: true, services: true },
        });

        await recordAudit(
          {
            tenantId: created.id,
            actor: actorFromRequest(request),
            action: 'CREATE',
            entityType: 'TENANT',
            entityId: created.id,
            metadata: { name, slug },
          },
          tx
        );

        return created;
      });

      return reply.status(201).send(tenant);
    }
  );

  /**
   * Genera datos de prueba idempotentes para la clínica activa.
   */
  fastify.post('/api/tenants/:id/seed', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const tenantId = resolveTenantId(request, id);
    const actor = actorFromRequest(request);

    const tenant = await db.tenant.findFirst({
      where: { id: tenantId },
      include: { doctors: true, services: true },
    });
    if (!tenant) return reply.status(404).send({ error: 'Clínica no encontrada' });

    const doctor1 = tenant.doctors[0];
    const doctor2 = tenant.doctors[1] || doctor1;
    const service1 = tenant.services[0];
    const service2 = tenant.services[1] || service1;
    const service3 = tenant.services[2] || service1;

    if (!doctor1 || !service1) {
      throw new HttpError(
        400,
        'La clínica necesita al menos un doctor y un servicio antes de generar datos de prueba'
      );
    }

    const samplePatients = [
      {
        name: 'Alejandra Morales',
        phone: '+525544332211',
        timeOffsetHours: 2,
        doctor: doctor1,
        service: service1,
        symptoms: 'Revisión semestral',
      },
      {
        name: 'Javier Rincón',
        phone: '+525588771122',
        timeOffsetHours: 4,
        doctor: doctor2,
        service: service2,
        symptoms: 'Limpieza con ultrasonido',
      },
      {
        name: 'Valeria Cárdenas',
        phone: '+528122334455',
        timeOffsetHours: 25,
        doctor: doctor1,
        service: service3,
        symptoms: 'Blanqueamiento dental para evento',
      },
      {
        name: 'Mauricio Garza',
        phone: '+528199887766',
        timeOffsetHours: 28,
        doctor: doctor2,
        service: service2,
        symptoms: 'Agendado por WhatsApp',
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const sample of samplePatients) {
      const existingConversation = await db.conversation.findUnique({
        where: {
          tenantId_channel_externalChannelId: {
            tenantId,
            channel: 'WHATSAPP',
            externalChannelId: sample.phone,
          },
        },
      });

      if (existingConversation) {
        skipped += 1;
        continue;
      }

      const startTime = new Date(Date.now() + sample.timeOffsetHours * 3600 * 1000);
      const endTime = new Date(startTime.getTime() + sample.service.durationMinutes * 60 * 1000);

      await db.$transaction(async (tx) => {
        const patient = await tx.patient.upsert({
          where: { tenantId_phoneE164: { tenantId, phoneE164: sample.phone } },
          update: { fullName: sample.name },
          create: { tenantId, fullName: sample.name, phoneE164: sample.phone },
        });

        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            patientId: patient.id,
            doctorId: sample.doctor.id,
            serviceId: sample.service.id,
            startTime,
            endTime,
            status: 'CONFIRMED',
            slotKey: appointmentSlotKey({
              doctorId: sample.doctor.id,
              startTime,
              status: 'CONFIRMED',
            }),
            paymentStatus: sample.service.requiredDepositMxn > 0 ? 'DEPOSIT_PAID' : 'NONE',
            depositAmountMxn: sample.service.requiredDepositMxn,
            channelOrigin: 'WHATSAPP',
            symptoms: sample.symptoms,
          },
        });

        await tx.conversation.create({
          data: {
            tenantId,
            patientId: patient.id,
            channel: 'WHATSAPP',
            externalChannelId: sample.phone,
            lastMessageAt: startTime,
            isHandedOverToHuman: false,
            messages: {
              create: [
                {
                  tenantId,
                  senderRole: 'PATIENT',
                  direction: 'INBOUND',
                  channel: 'WHATSAPP',
                  content: `Hola, me gustaría agendar para ${sample.service.name}. ${sample.symptoms}`,
                },
                {
                  tenantId,
                  senderRole: 'AI_AGENT',
                  direction: 'OUTBOUND',
                  channel: 'WHATSAPP',
                  content: `¡Hola ${sample.name}! Claro que sí, tu cita para ${sample.service.name} quedó confirmada con ${sample.doctor.name}. ¡Te esperamos!`,
                },
              ],
            },
          },
        });

        await recordAudit(
          {
            tenantId,
            actor,
            action: 'CREATE',
            entityType: 'APPOINTMENT',
            entityId: appointment.id,
            patientId: patient.id,
            metadata: { source: 'DEMO_SEED' },
          },
          tx
        );
      });

      created += 1;
    }

    return reply.send({
      success: true,
      created,
      skipped,
      message:
        created > 0
          ? `Datos de prueba generados (${created} nuevos, ${skipped} existentes)`
          : 'Los datos de prueba ya existían; no se generaron duplicados',
    });
  });

  /**
   * Limpia citas, mensajes y conversaciones de la clínica activa.
   */
  fastify.delete('/api/tenants/:id/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    // Borra el historial clínico completo de la clínica: mismo nivel de
    // privilegio que eliminar un doctor o un servicio.
    requireRole(request, ['ADMIN']);
    const tenantId = resolveTenantId(request, id);

    // El borrado queda registrado con sus conteos. La bitácora de auditoría
    // no se toca: es justo el rastro de que este borrado ocurrió.
    await db.$transaction(async (tx) => {
      const messages = await tx.message.deleteMany({ where: { tenantId } });
      const conversations = await tx.conversation.deleteMany({ where: { tenantId } });
      const appointments = await tx.appointment.deleteMany({ where: { tenantId } });

      await recordAudit(
        {
          tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'TENANT',
          entityId: tenantId,
          metadata: {
            scope: 'CLINICAL_HISTORY',
            deleted: {
              messages: messages.count,
              conversations: conversations.count,
              appointments: appointments.count,
            },
          },
        },
        tx
      );
    });

    return reply.send({ success: true, message: 'Datos de prueba eliminados con éxito' });
  });

  /**
   * Actualiza la configuración de la clínica activa.
   */
  fastify.patch(
    '/api/tenants/:id',
    { schema: updateTenantSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      requireRole(request, ['ADMIN']);
      const tenantId = resolveTenantId(request, id);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const data = {
        ...(body.name !== undefined && { name: requireString(body.name, 'Nombre', 200) }),
        ...(body.phoneE164 !== undefined && {
          phoneE164: requireMexicanPhone(body.phoneE164, 'Teléfono de la clínica'),
        }),
        ...(body.address !== undefined && { address: optionalString(body.address, 'Dirección', 300) }),
        ...(body.welcomeMessage !== undefined && {
          welcomeMessage: optionalString(body.welcomeMessage, 'Mensaje de bienvenida', 1000),
        }),
        ...(body.emergencyInstructions !== undefined && {
          emergencyInstructions: optionalString(
            body.emergencyInstructions,
            'Instrucciones de emergencia',
            1000
          ),
        }),
      };

      const updated = await db.$transaction(async (tx) => {
        const before = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const row = await tx.tenant.update({
          where: { id: tenantId },
          data,
          include: { doctors: true, services: true },
        });

        await recordAudit(
          {
            tenantId,
            actor: actorFromRequest(request),
            action: 'UPDATE',
            entityType: 'TENANT',
            entityId: tenantId,
            changes: diffChanges(before, data),
          },
          tx
        );

        return row;
      });

      return reply.send(updated);
    }
  );
}
