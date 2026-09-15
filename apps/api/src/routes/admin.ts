import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  appointmentSlotKey,
  db,
  diffChanges,
  recordAudit,
} from '@asistente/database';
import { SchedulerService, MercadoPagoService, roundMxn } from '@asistente/ai-agent';
import { WhatsAppService } from '../services/whatsappService.js';
import { actorFromRequest } from '../lib/audit.js';
import {
  HttpError,
  optionalString,
  parseLimit,
  requireAuthUser,
  requireEnum,
  requireMexicanPhone,
  requireNumber,
  requireRole,
  requireString,
  resolveTenantId,
} from '../lib/http.js';

const APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'RESCHEDULED',
  'COMPLETED',
  'NO_SHOW',
] as const;

const PAYMENT_STATUSES = [
  'NONE',
  'DEPOSIT_PENDING',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'REFUNDED',
] as const;

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} es obligatorio`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field} no es una fecha válida`);
  }
  return date;
}

function parseJsonField(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function requirePlatformAdmin(request: FastifyRequest): void {
  const user = requireRole(request, ['ADMIN']);
  const allowList = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new HttpError(403, 'La creación de clínicas requiere configurar PLATFORM_ADMIN_EMAILS');
    }
    return;
  }

  if (!allowList.includes(user.email.toLowerCase())) {
    throw new HttpError(403, 'Solo un administrador de plataforma puede crear clínicas');
  }
}

export async function adminRoutes(fastify: FastifyInstance) {
  // Todo el panel administrativo exige sesión válida.
  fastify.addHook('onRequest', fastify.authenticate);

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
  fastify.post('/api/tenants', async (request: FastifyRequest, reply: FastifyReply) => {
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
  });

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
  fastify.patch('/api/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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
  });

  /**
   * Agrega un doctor a la clínica activa.
   */
  fastify.post('/api/tenants/:id/doctors', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const tenantId = resolveTenantId(request, id);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const name = requireString(body.name, 'Nombre', 200);
    const specialty = requireString(body.specialty, 'Especialidad', 200);
    const phone =
      body.phone !== undefined && body.phone !== null && body.phone !== ''
        ? requireMexicanPhone(body.phone, 'Teléfono del doctor')
        : null;
    const email = optionalString(body.email, 'Email', 200) || null;

    const doctor = await db.$transaction(async (tx) => {
      const created = await tx.doctor.create({
        data: { tenantId, name, specialty, phone, email },
      });

      await recordAudit(
        {
          tenantId,
          actor: actorFromRequest(request),
          action: 'CREATE',
          entityType: 'DOCTOR',
          entityId: created.id,
          metadata: { name, specialty },
        },
        tx
      );

      return created;
    });

    return reply.status(201).send(doctor);
  });

  /**
   * Elimina un doctor de la clínica activa y sus citas asociadas.
   */
  fastify.delete('/api/doctors/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const user = requireAuthUser(request);

    const doctor = await db.doctor.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doctor) return reply.status(404).send({ error: 'Doctor no encontrado' });

    await db.$transaction(async (tx) => {
      const appointments = await tx.appointment.deleteMany({
        where: { doctorId: id, tenantId: user.tenantId },
      });
      await tx.doctor.delete({ where: { id } });

      await recordAudit(
        {
          tenantId: user.tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'DOCTOR',
          entityId: id,
          metadata: { name: doctor.name, appointmentsDeleted: appointments.count },
        },
        tx
      );
    });

    return reply.send({ success: true });
  });

  /**
   * Agrega un servicio a la clínica activa.
   */
  fastify.post('/api/tenants/:id/services', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const tenantId = resolveTenantId(request, id);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const name = requireString(body.name, 'Nombre', 200);
    const durationMinutes = requireNumber(body.durationMinutes ?? 30, 'Duración', {
      min: 5,
      max: 600,
    });
    const priceMxn = roundMxn(requireNumber(body.priceMxn, 'Precio MXN', { min: 0, max: 10_000_000 }));
    const requiredDepositMxn = roundMxn(
      requireNumber(body.requiredDepositMxn ?? 0, 'Anticipo MXN', { min: 0, max: priceMxn })
    );

    const service = await db.$transaction(async (tx) => {
      const created = await tx.service.create({
        data: {
          tenantId,
          name,
          description: optionalString(body.description, 'Descripción', 1000) || null,
          durationMinutes,
          priceMxn,
          requiredDepositMxn,
          category: optionalString(body.category, 'Categoría', 120) || 'General',
        },
      });

      await recordAudit(
        {
          tenantId,
          actor: actorFromRequest(request),
          action: 'CREATE',
          entityType: 'SERVICE',
          entityId: created.id,
          metadata: { name, priceMxn, requiredDepositMxn },
        },
        tx
      );

      return created;
    });

    return reply.status(201).send(service);
  });

  /**
   * Elimina un servicio de la clínica activa.
   */
  fastify.delete('/api/services/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const user = requireAuthUser(request);

    const service = await db.service.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!service) return reply.status(404).send({ error: 'Servicio no encontrado' });

    await db.$transaction(async (tx) => {
      const appointments = await tx.appointment.deleteMany({
        where: { serviceId: id, tenantId: user.tenantId },
      });
      await tx.service.delete({ where: { id } });

      await recordAudit(
        {
          tenantId: user.tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'SERVICE',
          entityId: id,
          metadata: { name: service.name, appointmentsDeleted: appointments.count },
        },
        tx
      );
    });

    return reply.send({ success: true });
  });

  /**
   * Disponibilidad de horarios de la clínica activa.
   */
  fastify.get('/api/availability', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const tenantId = resolveTenantId(request, query.tenantId);
    const date = requireString(query.date, 'Fecha', 20);

    const slots = await SchedulerService.getAvailableSlots({
      tenantId,
      targetDateStr: date,
      doctorId: query.doctorId,
      serviceId: query.serviceId,
      timePreference: 'any',
    });

    return reply.send(slots);
  });

  /**
   * Lista citas de la clínica activa.
   */
  fastify.get('/api/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const tenantId = resolveTenantId(request, query.tenantId);

    const where: Record<string, unknown> = { tenantId };
    if (query.status) {
      where.status = requireEnum(query.status, APPOINTMENT_STATUSES, 'Estatus');
    }
    if (query.from || query.to) {
      where.startTime = {
        ...(query.from && { gte: parseDate(query.from, 'Fecha inicial') }),
        ...(query.to && { lte: parseDate(query.to, 'Fecha final') }),
      };
    }

    const appointments = await db.appointment.findMany({
      where,
      include: { patient: true, doctor: true, service: true },
      orderBy: { startTime: 'asc' },
      take: parseLimit(query.limit, 200, 1000),
    });

    await recordAudit({
      tenantId,
      actor: actorFromRequest(request),
      action: 'LIST',
      entityType: 'APPOINTMENT',
      metadata: {
        count: appointments.length,
        filters: { status: query.status ?? null, from: query.from ?? null, to: query.to ?? null },
      },
    });

    return reply.send(appointments);
  });

  /**
   * Agenda manual desde recepción.
   */
  fastify.post('/api/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const tenantId = resolveTenantId(request, body.tenantId as string | undefined);

    try {
      const appointment = await SchedulerService.bookAppointment({
        tenantId,
        patientFullName: requireString(body.patientName, 'Nombre del paciente', 200),
        patientPhone: requireMexicanPhone(body.patientPhone, 'Teléfono del paciente'),
        doctorId: requireString(body.doctorId, 'Doctor', 100),
        serviceId: requireString(body.serviceId, 'Servicio', 100),
        startTimeIso: parseDate(body.startTimeIso, 'Fecha de inicio').toISOString(),
        symptoms: optionalString(body.symptoms, 'Síntomas', 1000),
        channelOrigin: body.channelOrigin
          ? requireEnum(
              body.channelOrigin,
              ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'PHONE_CALL', 'WEBCHAT'] as const,
              'Canal'
            )
          : 'WEBCHAT',
        auditActor: actorFromRequest(request),
      });

      return reply.status(201).send(appointment);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'No se pudo agendar la cita');
    }
  });

  /**
   * Actualiza estado, notas o reprograma una cita validando colisiones.
   */
  fastify.patch('/api/appointments/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = requireAuthUser(request);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const existing = await db.appointment.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return reply.status(404).send({ error: `Cita con ID ${id} no encontrada` });

    const data: Record<string, unknown> = {};

    if (body.status !== undefined) {
      data.status = requireEnum(body.status, APPOINTMENT_STATUSES, 'Estatus');
    }
    // Tocar el estado de cobro equivale a dar por pagado un anticipo sin que
    // Mercado Pago lo confirme: queda restringido a quien cobra en el mostrador.
    const touchesPayment =
      body.paymentStatus !== undefined ||
      body.depositAmountMxn !== undefined ||
      body.depositPaymentUrl !== undefined ||
      body.paymentReferenceId !== undefined;
    if (touchesPayment) {
      requireRole(request, ['ADMIN', 'RECEPTIONIST']);
    }

    if (body.paymentStatus !== undefined) {
      data.paymentStatus = requireEnum(body.paymentStatus, PAYMENT_STATUSES, 'Estatus de pago');
    }
    if (body.notes !== undefined) {
      data.notes = optionalString(body.notes, 'Notas', 2000);
    }
    if (body.depositAmountMxn !== undefined) {
      data.depositAmountMxn = roundMxn(
        requireNumber(body.depositAmountMxn, 'Anticipo MXN', { min: 0 })
      );
    }
    if (body.depositPaymentUrl !== undefined) {
      data.depositPaymentUrl = optionalString(body.depositPaymentUrl, 'URL de pago', 1000);
    }
    if (body.paymentReferenceId !== undefined) {
      data.paymentReferenceId = optionalString(body.paymentReferenceId, 'Referencia de pago', 200);
    }

    if (body.startTime !== undefined || body.endTime !== undefined) {
      const startTime = body.startTime
        ? parseDate(body.startTime, 'Fecha de inicio')
        : existing.startTime;
      const endTime = body.endTime
        ? parseDate(body.endTime, 'Fecha de fin')
        : new Date(startTime.getTime() + (existing.endTime.getTime() - existing.startTime.getTime()));

      if (endTime.getTime() <= startTime.getTime()) {
        throw new HttpError(400, 'La fecha de fin debe ser posterior a la de inicio');
      }

      const conflict = await db.appointment.findFirst({
        where: {
          tenantId: user.tenantId,
          doctorId: existing.doctorId,
          id: { not: id },
          status: { in: ['CONFIRMED', 'PENDING'] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      if (conflict) {
        throw new HttpError(409, 'El nuevo horario se solapa con otra cita del especialista');
      }

      try {
        await SchedulerService.assertWithinBusinessHours({
          tenantId: user.tenantId,
          doctorId: existing.doctorId,
          startTimeIso: startTime.toISOString(),
          durationMinutes: Math.round((endTime.getTime() - startTime.getTime()) / 60_000),
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Horario inválido');
      }

      data.startTime = startTime;
      data.endTime = endTime;
    }

    // El candado de doble reserva sigue al horario y al estado: se recalcula
    // cuando cambia cualquiera de los dos.
    if (data.startTime !== undefined || data.status !== undefined) {
      data.slotKey = appointmentSlotKey({
        doctorId: existing.doctorId,
        startTime: (data.startTime as Date | undefined) ?? existing.startTime,
        status: (data.status as string | undefined) ?? existing.status,
      });
    }

    try {
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.appointment.update({
          where: { id },
          data,
          include: { patient: true, doctor: true, service: true },
        });

        await recordAudit(
          {
            tenantId: user.tenantId,
            actor: actorFromRequest(request),
            action: 'UPDATE',
            entityType: 'APPOINTMENT',
            entityId: id,
            patientId: existing.patientId,
            changes: diffChanges(existing, data),
          },
          tx
        );

        return row;
      });

      return reply.send(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new HttpError(409, 'El nuevo horario se solapa con otra cita del especialista');
      }
      throw error;
    }
  });

  /**
   * Genera la preferencia de anticipo usando el monto oficial del servicio.
   */
  fastify.post(
    '/api/appointments/:id/deposit-preference',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = requireAuthUser(request);

      const appointment = await db.appointment.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { service: true, patient: true },
      });
      if (!appointment) return reply.status(404).send({ error: 'Cita no encontrada' });

      const amountMxn =
        appointment.depositAmountMxn && appointment.depositAmountMxn > 0
          ? appointment.depositAmountMxn
          : appointment.service.requiredDepositMxn;

      if (!amountMxn || amountMxn <= 0) {
        throw new HttpError(400, 'Esta cita no tiene un anticipo configurado');
      }

      const preference = await MercadoPagoService.createDepositPreference({
        appointmentId: id,
        tenantId: user.tenantId,
        amountMxn,
        serviceName: appointment.service.name,
        patientName: appointment.patient.fullName,
        auditActor: actorFromRequest(request),
      });

      return reply.send(preference);
    }
  );

  /**
   * Cancela una cita de la clínica activa.
   */
  fastify.delete('/api/appointments/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = requireAuthUser(request);

    const appointment = await db.appointment.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!appointment) return reply.status(404).send({ error: 'Cita no encontrada' });

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED', slotKey: null },
      });

      await recordAudit(
        {
          tenantId: user.tenantId,
          actor: actorFromRequest(request),
          action: 'UPDATE',
          entityType: 'APPOINTMENT',
          entityId: id,
          patientId: appointment.patientId,
          changes: diffChanges(appointment, { status: 'CANCELLED' }),
        },
        tx
      );

      return row;
    });

    return reply.send({ success: true, appointment: updated });
  });

  /**
   * Conversaciones omnicanal de la clínica activa.
   */
  fastify.get('/api/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const tenantId = resolveTenantId(request, query.tenantId);

    const conversations = await db.conversation.findMany({
      where: { tenantId },
      select: {
        id: true,
        channel: true,
        externalChannelId: true,
        lastMessageAt: true,
        createdAt: true,
        isHandedOverToHuman: true,
        patient: {
          select: {
            id: true,
            fullName: true,
            phoneE164: true,
            appointments: {
              select: {
                id: true,
                startTime: true,
                status: true,
                paymentStatus: true,
                depositAmountMxn: true,
                symptoms: true,
                doctor: { select: { name: true, specialty: true } },
                service: { select: { name: true } },
              },
              orderBy: { startTime: 'desc' },
              take: 1,
            },
          },
        },
        messages: {
          select: { id: true, content: true, createdAt: true, senderRole: true, direction: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: parseLimit(query.limit, 100, 500),
    });

    await recordAudit({
      tenantId,
      actor: actorFromRequest(request),
      action: 'LIST',
      entityType: 'CONVERSATION',
      metadata: { count: conversations.length },
    });

    return reply.send(conversations);
  });

  /**
   * Historial de mensajes de una conversación de la clínica activa.
   */
  fastify.get(
    '/api/conversations/:id/messages',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string | undefined>;
      const user = requireAuthUser(request);

      const conversation = await db.conversation.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true, patientId: true },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversación no encontrada' });

      // Se traen los más recientes y se devuelven en orden cronológico, que es
      // como los pinta la bandeja.
      const messages = await db.message.findMany({
        where: { conversationId: id, tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        take: parseLimit(query.limit, 200, 500),
      });

      // Abrir un chat es leer el expediente de ese paciente. La bandeja
      // refresca cada 2 s; `recordAudit` deja una sola fila por ventana.
      await recordAudit({
        tenantId: user.tenantId,
        actor: actorFromRequest(request),
        action: 'READ',
        entityType: 'CONVERSATION',
        entityId: id,
        patientId: conversation.patientId,
      });

      return reply.send(messages.reverse());
    }
  );

  /**
   * Activa o desactiva el modo copiloto humano.
   */
  fastify.post(
    '/api/conversations/:id/takeover',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = requireAuthUser(request);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const isHandedOver = body.isHandedOver === true;

      const conversation = await db.conversation.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversación no encontrada' });

      const updated = await db.$transaction(async (tx) => {
        const row = await tx.conversation.update({
          where: { id },
          data: { isHandedOverToHuman: isHandedOver },
        });

        await recordAudit(
          {
            tenantId: user.tenantId,
            actor: actorFromRequest(request),
            action: 'UPDATE',
            entityType: 'CONVERSATION',
            entityId: id,
            patientId: conversation.patientId,
            changes: diffChanges(conversation, { isHandedOverToHuman: isHandedOver }),
          },
          tx
        );

        return row;
      });

      return reply.send({ success: true, isHandedOverToHuman: updated.isHandedOverToHuman });
    }
  );

  /**
   * Respuesta manual del recepcionista.
   */
  fastify.post('/api/conversations/:id/reply', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = requireAuthUser(request);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const text = requireString(body.text, 'Mensaje', 4000);
    const staffName = optionalString(body.staffName, 'Nombre del personal', 200);

    const conversation = await db.conversation.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { patient: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversación no encontrada' });

    // El contenido no se copia a la auditoría: ya vive en el propio mensaje, y
    // duplicarlo solo multiplica los lugares donde hay datos clínicos.
    const savedMessage = await db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: id,
          tenantId: user.tenantId,
          direction: 'OUTBOUND',
          senderRole: 'HUMAN_STAFF',
          content: staffName ? `[${staffName}]: ${text}` : text,
          channel: conversation.channel,
          deliveryStatus: conversation.channel === 'WHATSAPP' ? 'PENDING' : null,
        },
      });

      await recordAudit(
        {
          tenantId: user.tenantId,
          actor: actorFromRequest(request),
          action: 'CREATE',
          entityType: 'MESSAGE',
          entityId: message.id,
          patientId: conversation.patientId,
          metadata: { conversationId: id, channel: conversation.channel },
        },
        tx
      );

      return message;
    });

    let delivered: boolean | null = null;
    if (conversation.channel === 'WHATSAPP') {
      delivered = await WhatsAppService.sendMessage({
        toPhoneE164: conversation.patient.phoneE164,
        text,
      });
    }

    if (delivered !== null) {
      return reply.send(
        await db.message.update({
          where: { id: savedMessage.id },
          data: { deliveryStatus: delivered ? 'SENT' : 'FAILED' },
        })
      );
    }

    return reply.send(savedMessage);
  });

  type AuditRow = Awaited<ReturnType<typeof db.auditLog.findMany>>[number];

  /** Filtros de la bitácora, compartidos por la consulta y la exportación. */
  function auditWhere(tenantId: string, query: Record<string, string | undefined>) {
    const where: Record<string, unknown> = { tenantId };
    if (query.patientId) where.patientId = requireString(query.patientId, 'patientId', 100);
    if (query.entityId) where.entityId = requireString(query.entityId, 'entityId', 100);
    if (query.actorId) where.actorId = requireString(query.actorId, 'actorId', 100);
    if (query.entityType) {
      where.entityType = requireEnum(query.entityType, AUDIT_ENTITY_TYPES, 'entityType');
    }
    if (query.action) {
      // Acepta varias separadas por coma: el panel agrupa por categorías
      // (accesos, cambios, sesiones) y la exportación debe coincidir con eso.
      const actions = query.action.split(',').map((action) => requireEnum(action.trim(), AUDIT_ACTIONS, 'action'));
      where.action = actions.length === 1 ? actions[0] : { in: actions };
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: parseDate(query.from, 'Fecha inicial') }),
        ...(query.to && { lte: parseDate(query.to, 'Fecha final') }),
      };
    }
    return where;
  }

  function auditFilters(query: Record<string, string | undefined>) {
    const { patientId, entityType, entityId, actorId, action, from, to } = query;
    return { patientId, entityType, entityId, actorId, action, from, to };
  }

  /**
   * Nombres del paciente y del empleado de cada fila. AuditLog no tiene
   * relaciones a propósito (sobrevive a los borrados), así que se resuelven
   * aparte y en lote; un paciente o usuario ya borrado sale con `null`.
   */
  async function withNames(tenantId: string, rows: AuditRow[]) {
    const patientIds = [...new Set(rows.map((row) => row.patientId).filter((id): id is string => !!id))];
    const actorIds = [
      ...new Set(
        rows
          .filter((row) => row.actorType === 'USER')
          .map((row) => row.actorId)
          .filter((id): id is string => !!id)
      ),
    ];

    const [patients, users] = await Promise.all([
      patientIds.length > 0
        ? db.patient.findMany({
            where: { tenantId, id: { in: patientIds } },
            select: { id: true, fullName: true, phoneE164: true },
          })
        : [],
      actorIds.length > 0
        ? db.user.findMany({
            where: { tenantId, id: { in: actorIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const patientById = new Map(patients.map((patient) => [patient.id, patient]));
    const userNameById = new Map(users.map((user) => [user.id, user.name]));

    return rows.map((row) => ({
      ...row,
      changes: parseJsonField(row.changes),
      metadata: parseJsonField(row.metadata),
      patient: row.patientId ? patientById.get(row.patientId) ?? null : null,
      actorName: row.actorId ? userNameById.get(row.actorId) ?? null : null,
    }));
  }

  /**
   * Bitácora de auditoría de la clínica (solo ADMIN).
   *
   * Responde "quién vio o modificó el expediente de este paciente": filtra por
   * `patientId`, entidad, actor, acción o rango de fechas. Consultarla también
   * queda registrado, porque la propia bitácora contiene datos sensibles.
   */
  fastify.get('/api/audit', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireRole(request, ['ADMIN']);
    const query = request.query as Record<string, string | undefined>;

    const rows = await db.auditLog.findMany({
      where: auditWhere(user.tenantId, query),
      orderBy: { createdAt: 'desc' },
      take: parseLimit(query.limit, 100, 500),
    });

    await recordAudit({
      tenantId: user.tenantId,
      actor: actorFromRequest(request),
      action: 'LIST',
      entityType: 'AUDIT_LOG',
      patientId: query.patientId ?? null,
      metadata: { count: rows.length },
    });

    return reply.send(await withNames(user.tenantId, rows));
  });

  const CSV_COLUMNS = [
    'fecha_hora_cdmx',
    'actor_tipo',
    'actor',
    'actor_correo',
    'actor_rol',
    'accion',
    'entidad',
    'entidad_id',
    'paciente',
    'paciente_id',
    'cambios',
    'detalle',
    'ip',
    'navegador',
    'request_id',
  ];

  const cdmxTimestamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text = typeof value === 'string' ? value : JSON.stringify(value);
    // Una celda que empieza con = + - @ se ejecuta como fórmula al abrirla en
    // Excel. El nombre de WhatsApp de un paciente o el correo de un login
    // fallido los escribe un tercero: sin esto, exportar la bitácora le daría
    // a un atacante una fórmula en la computadora del director.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  /**
   * Exporta en CSV exactamente lo filtrado (solo ADMIN). Se genera en el
   * servidor para que la exportación quede auditada: sacar la bitácora del
   * sistema es un acceso tan sensible como consultarla, y nunca se agrupa.
   */
  fastify.get('/api/audit/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireRole(request, ['ADMIN']);
    const query = request.query as Record<string, string | undefined>;

    const rows = await db.auditLog.findMany({
      where: auditWhere(user.tenantId, query),
      orderBy: { createdAt: 'desc' },
      take: parseLimit(query.limit, 5000, 5000),
    });
    const named = await withNames(user.tenantId, rows);

    await recordAudit({
      tenantId: user.tenantId,
      actor: actorFromRequest(request),
      action: 'EXPORT',
      entityType: 'AUDIT_LOG',
      patientId: query.patientId ?? null,
      metadata: { count: rows.length, filters: auditFilters(query) },
    });

    const lines = [
      CSV_COLUMNS.join(','),
      ...named.map((row) =>
        [
          cdmxTimestamp.format(row.createdAt),
          row.actorType,
          row.actorName,
          row.actorEmail,
          row.actorRole,
          row.action,
          row.entityType,
          row.entityId,
          row.patient?.fullName,
          row.patientId,
          row.changes,
          row.metadata,
          row.ipAddress,
          row.userAgent,
          row.requestId,
        ]
          .map(csvCell)
          .join(',')
      ),
    ];

    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
      new Date()
    );

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="bitacora-${dateKey}.csv"`);
    // El BOM hace que Excel abra el archivo como UTF-8 y respete los acentos.
    return reply.send(`﻿${lines.join('\r\n')}\r\n`);
  });
}
