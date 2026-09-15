import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { appointmentSlotKey, db, diffChanges, recordAudit } from '@asistente/database';
import { SchedulerService, MercadoPagoService, roundMxn } from '@asistente/ai-agent';
import { actorFromRequest } from '../../lib/audit.js';
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
} from '../../lib/http.js';
import { parseDate } from './common.js';
import {
  APPOINTMENT_STATUSES,
  PAYMENT_STATUSES,
  availabilitySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from './schemas.js';

export async function appointmentRoutes(fastify: FastifyInstance) {
  /**
   * Disponibilidad de horarios de la clínica activa.
   */
  fastify.get(
    '/api/availability',
    { schema: availabilitySchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    }
  );

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
  fastify.post(
    '/api/appointments',
    { schema: createAppointmentSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    }
  );

  /**
   * Actualiza estado, notas o reprograma una cita validando colisiones.
   */
  fastify.patch(
    '/api/appointments/:id',
    { schema: updateAppointmentSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
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

      const rawStartTime = body.startTime ?? body.startTimeIso;
      if (rawStartTime !== undefined || body.endTime !== undefined) {
        const startTime = rawStartTime
          ? parseDate(rawStartTime, 'Fecha de inicio')
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
    }
  );

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
}
