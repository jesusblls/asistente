import { db, appointmentSlotKey, recordAudit, type AuditActor } from '@asistente/database';
import { addMinutes } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { normalizeMexicanPhone } from '../utils/phone.js';
import { roundMxn } from '../utils/money.js';

export interface AvailableSlot {
  doctorId: string;
  doctorName: string;
  specialty: string;
  startTimeIso: string; // ISO 8601 UTC
  endTimeIso: string;
  displayTime: string; // "04:00 PM"
  displayDate: string; // "martes 10 de septiembre"
}

interface ShiftRule {
  start: string;
  end: string;
  lunchStart?: string;
  lunchEnd?: string;
}

interface AvailabilityRules {
  days: Record<number, ShiftRule[]>;
  slotDurationMinutes?: number;
  bufferBetweenAppointmentsMinutes?: number;
}

function defaultRules(durationMinutes: number): AvailabilityRules {
  return {
    days: {
      1: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }],
      2: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }],
      3: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }],
      4: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }],
      5: [{ start: '09:00', end: '17:00' }],
      6: [{ start: '10:00', end: '14:00' }],
    },
    slotDurationMinutes: durationMinutes,
    bufferBetweenAppointmentsMinutes: 10,
  };
}

function resolveRules(rawRules: string | null | undefined, durationMinutes: number): AvailabilityRules {
  if (!rawRules) return defaultRules(durationMinutes);

  try {
    const parsed = JSON.parse(rawRules) as AvailabilityRules;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.days !== 'object' || parsed.days === null) {
      throw new Error('estructura de disponibilidad inválida');
    }
    return parsed;
  } catch (error) {
    console.warn(
      '[Scheduler] availabilityRules inválidas; se usará el horario por defecto:',
      error instanceof Error ? error.message : error
    );
    return defaultRules(durationMinutes);
  }
}

function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function isWithinBusinessHours(
  rules: AvailabilityRules,
  localStart: Date,
  durationMinutes: number
): boolean {
  const shifts = rules.days?.[localStart.getDay()];
  if (!Array.isArray(shifts) || shifts.length === 0) return false;

  const startMinutes = localStart.getHours() * 60 + localStart.getMinutes();
  const endMinutes = startMinutes + durationMinutes;

  return shifts.some((shift) => {
    if (!shift?.start || !shift?.end) return false;

    const shiftStart = parseTimeToMinutes(shift.start);
    const shiftEnd = parseTimeToMinutes(shift.end);
    if (startMinutes < shiftStart || endMinutes > shiftEnd) return false;

    if (shift.lunchStart && shift.lunchEnd) {
      const lunchStart = parseTimeToMinutes(shift.lunchStart);
      const lunchEnd = parseTimeToMinutes(shift.lunchEnd);
      if (startMinutes < lunchEnd && endMinutes > lunchStart) return false;
    }

    return true;
  });
}

function formatLongDate(year: number, month: number, day: number): string {
  const reference = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const formatted = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(reference);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export class SchedulerService {
  /**
   * Consulta los horarios disponibles para una clínica y fecha dada en timezone de México.
   * Todas las consultas están estrictamente acotadas por tenantId.
   */
  static async getAvailableSlots(params: {
    tenantId: string;
    targetDateStr: string; // "YYYY-MM-DD"
    doctorId?: string;
    serviceId?: string;
    timePreference?: 'morning' | 'afternoon' | 'any';
  }): Promise<AvailableSlot[]> {
    const { tenantId, targetDateStr, doctorId, serviceId, timePreference = 'any' } = params;

    const tenant = await db.tenant.findFirst({
      where: { id: tenantId, isActive: true },
    });
    if (!tenant) return [];
    const timezone = tenant.timezone || 'America/Mexico_City';

    let durationMinutes = 45;
    if (serviceId) {
      const service = await db.service.findFirst({
        where: { id: serviceId, tenantId, isActive: true },
      });
      if (!service) {
        throw new Error('Servicio no encontrado para esta clínica');
      }
      durationMinutes = service.durationMinutes;
    }

    const doctorWhere: Record<string, unknown> = { tenantId, isActive: true };
    if (doctorId) doctorWhere.id = doctorId;
    const doctors = await db.doctor.findMany({ where: doctorWhere });
    if (doctors.length === 0) return [];

    const [year, month, day] = targetDateStr.split('-').map(Number);
    if (!year || !month || !day) {
      throw new Error('Fecha inválida: se espera el formato YYYY-MM-DD');
    }

    const dateRef = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayOfWeek = dateRef.getUTCDay();
    const displayDate = formatLongDate(year, month, day);

    const results: AvailableSlot[] = [];
    const dayStartUtc = fromZonedTime(new Date(year, month - 1, day, 0, 0, 0), timezone);
    const dayEndUtc = fromZonedTime(new Date(year, month - 1, day, 23, 59, 59), timezone);

    // Una sola consulta por doctor (evita N+1 adicional al reutilizarla por rango).
    const existingAppointments = await db.appointment.findMany({
      where: {
        tenantId,
        doctorId: { in: doctors.map((doctor) => doctor.id) },
        status: { in: ['CONFIRMED', 'PENDING'] },
        startTime: { gte: dayStartUtc, lte: dayEndUtc },
      },
      select: { doctorId: true, startTime: true, endTime: true },
    });

    for (const doctor of doctors) {
      const rules = resolveRules(doctor.availabilityRules, durationMinutes);
      const dayConfig = rules.days?.[dayOfWeek];
      if (!Array.isArray(dayConfig) || dayConfig.length === 0) continue;

      const doctorAppointments = existingAppointments.filter(
        (appointment) => appointment.doctorId === doctor.id
      );

      for (const shift of dayConfig) {
        const [shiftStartH, shiftStartM] = shift.start.split(':').map(Number);
        const [shiftEndH, shiftEndM] = shift.end.split(':').map(Number);

        let currentLocalSlot = new Date(year, month - 1, day, shiftStartH, shiftStartM, 0);
        const shiftEndLocal = new Date(year, month - 1, day, shiftEndH, shiftEndM, 0);

        while (addMinutes(currentLocalSlot, durationMinutes) <= shiftEndLocal) {
          const slotEndLocal = addMinutes(currentLocalSlot, durationMinutes);

          let isInLunch = false;
          if (shift.lunchStart && shift.lunchEnd) {
            const [lStartH, lStartM] = shift.lunchStart.split(':').map(Number);
            const [lEndH, lEndM] = shift.lunchEnd.split(':').map(Number);
            const lunchStartLocal = new Date(year, month - 1, day, lStartH, lStartM, 0);
            const lunchEndLocal = new Date(year, month - 1, day, lEndH, lEndM, 0);

            if (currentLocalSlot < lunchEndLocal && slotEndLocal > lunchStartLocal) {
              isInLunch = true;
            }
          }

          const hour = currentLocalSlot.getHours();
          const matchesPreference =
            timePreference === 'any' ||
            (timePreference === 'morning' && hour < 13) ||
            (timePreference === 'afternoon' && hour >= 13);

          const slotStartUtc = fromZonedTime(currentLocalSlot, timezone);
          const slotEndUtc = fromZonedTime(slotEndLocal, timezone);
          const isFuture = slotStartUtc.getTime() > Date.now();

          const hasConflict = doctorAppointments.some(
            (appointment) =>
              slotStartUtc.getTime() < appointment.endTime.getTime() &&
              slotEndUtc.getTime() > appointment.startTime.getTime()
          );

          if (!isInLunch && matchesPreference && isFuture && !hasConflict) {
            const hours12 = hour % 12 || 12;
            const minutesPadded = currentLocalSlot.getMinutes().toString().padStart(2, '0');
            const ampm = hour >= 12 ? 'PM' : 'AM';

            results.push({
              doctorId: doctor.id,
              doctorName: doctor.name,
              specialty: doctor.specialty,
              startTimeIso: slotStartUtc.toISOString(),
              endTimeIso: slotEndUtc.toISOString(),
              displayTime: `${hours12}:${minutesPadded} ${ampm}`,
              displayDate,
            });
          }

          currentLocalSlot = addMinutes(
            currentLocalSlot,
            durationMinutes + (rules.bufferBetweenAppointmentsMinutes || 0)
          );
        }
      }
    }

    return results;
  }

  /**
   * Valida que un horario esté dentro del horario de atención del doctor sin
   * crear ni modificar datos. Se usa al reprogramar citas existentes.
   */
  static async assertWithinBusinessHours(params: {
    tenantId: string;
    doctorId: string;
    startTimeIso: string;
    durationMinutes: number;
  }): Promise<void> {
    const tenant = await db.tenant.findFirst({ where: { id: params.tenantId, isActive: true } });
    if (!tenant) throw new Error('Clínica no encontrada o inactiva');

    const doctor = await db.doctor.findFirst({
      where: { id: params.doctorId, tenantId: params.tenantId, isActive: true },
    });
    if (!doctor) throw new Error('Doctor no encontrado para esta clínica');

    const startTime = new Date(params.startTimeIso);
    if (Number.isNaN(startTime.getTime())) throw new Error('Fecha y hora inválidas');

    const rules = resolveRules(doctor.availabilityRules, params.durationMinutes);
    const localStart = toZonedTime(startTime, tenant.timezone || 'America/Mexico_City');
    if (!isWithinBusinessHours(rules, localStart, params.durationMinutes)) {
      throw new Error('El horario solicitado está fuera del horario de atención del especialista');
    }
  }

  /**
   * Agenda una cita validando tenant, servicio, doctor, horario y colisiones
   * dentro de una transacción para evitar dobles reservas concurrentes.
   */
  static async bookAppointment(params: {
    tenantId: string;
    patientFullName: string;
    patientPhone: string;
    doctorId: string;
    serviceId: string;
    startTimeIso: string;
    symptoms?: string;
    channelOrigin?: string;
    /** Quién agenda. Obligatorio: ningún camino de agendado puede omitir la auditoría. */
    auditActor: AuditActor;
    /** Contexto adicional para la fila de auditoría (herramienta del agente, conversación). */
    auditMetadata?: Record<string, unknown>;
  }) {
    const {
      tenantId,
      patientFullName,
      patientPhone,
      doctorId,
      serviceId,
      startTimeIso,
      symptoms,
      channelOrigin = 'WHATSAPP',
      auditActor,
      auditMetadata,
    } = params;

    const patientPhoneE164 = normalizeMexicanPhone(patientPhone);
    if (!/^\+52\d{10}$/.test(patientPhoneE164)) {
      throw new Error('El teléfono del paciente debe ser un número mexicano E.164 válido (+52XXXXXXXXXX)');
    }

    return db.$transaction(async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId, isActive: true } });
      if (!tenant) throw new Error('Clínica no encontrada o inactiva');

      const service = await tx.service.findFirst({
        where: { id: serviceId, tenantId, isActive: true },
      });
      if (!service) throw new Error('Servicio no encontrado para esta clínica');

      const doctor = await tx.doctor.findFirst({
        where: { id: doctorId, tenantId, isActive: true },
      });
      if (!doctor) throw new Error('Doctor no encontrado para esta clínica');

      const startTime = new Date(startTimeIso);
      if (Number.isNaN(startTime.getTime())) throw new Error('Fecha y hora de inicio inválidas');
      if (startTime.getTime() <= Date.now()) {
        throw new Error('No se puede agendar una cita en el pasado');
      }

      const endTime = addMinutes(startTime, service.durationMinutes);
      const timezone = tenant.timezone || 'America/Mexico_City';
      const rules = resolveRules(doctor.availabilityRules, service.durationMinutes);
      const localStart = toZonedTime(startTime, timezone);

      if (!isWithinBusinessHours(rules, localStart, service.durationMinutes)) {
        throw new Error('El horario solicitado está fuera del horario de atención del especialista');
      }

      const conflict = await tx.appointment.findFirst({
        where: {
          tenantId,
          doctorId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (conflict) {
        throw new Error(
          'Lo sentimos, ese horario acaba de ser reservado. Por favor selecciona otro horario.'
        );
      }

      const patient = await tx.patient.upsert({
        where: {
          tenantId_phoneE164: {
            tenantId,
            phoneE164: patientPhoneE164,
          },
        },
        update: {
          fullName: patientFullName,
        },
        create: {
          tenantId,
          fullName: patientFullName,
          phoneE164: patientPhoneE164,
        },
      });

      try {
        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            patientId: patient.id,
            doctorId,
            serviceId,
            startTime,
            endTime,
            status: 'CONFIRMED',
            slotKey: appointmentSlotKey({ doctorId, startTime, status: 'CONFIRMED' }),
            paymentStatus: service.requiredDepositMxn > 0 ? 'DEPOSIT_PENDING' : 'NONE',
            depositAmountMxn: roundMxn(service.requiredDepositMxn),
            channelOrigin,
            symptoms,
          },
          include: {
            doctor: true,
            service: true,
            patient: true,
            tenant: true,
          },
        });

        // Dentro de la transacción: si la auditoría falla, la cita no se crea.
        await recordAudit(
          {
            tenantId,
            actor: auditActor,
            action: 'CREATE',
            entityType: 'APPOINTMENT',
            entityId: appointment.id,
            patientId: patient.id,
            metadata: {
              ...auditMetadata,
              channelOrigin,
              doctorId,
              serviceId,
              startTime: startTime.toISOString(),
            },
          },
          tx
        );

        return appointment;
      } catch (error) {
        // P2002 sobre slotKey: otra reserva ganó la carrera entre el SELECT de
        // colisiones y este INSERT.
        if ((error as { code?: string }).code === 'P2002') {
          throw new Error(
            'Lo sentimos, ese horario acaba de ser reservado. Por favor selecciona otro horario.'
          );
        }
        throw error;
      }
    });
  }
}
