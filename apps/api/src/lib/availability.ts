/**
 * Validación de los horarios de consulta de un especialista.
 *
 * El horario no es un dato decorativo: `SchedulerService` rechaza cualquier
 * cita fuera de él ("El horario solicitado está fuera del horario de atención
 * del especialista"), así que un horario mal capturado se traduce en citas
 * reales perdidas. Por eso se valida aquí, al entrar, y no se confía en que
 * el panel mande algo bien formado.
 */
import { HttpError } from './http.js';

export interface ShiftRule {
  start: string;
  end: string;
  lunchStart?: string;
  lunchEnd?: string;
}

export interface AvailabilityRules {
  days: Record<number, ShiftRule[]>;
  slotDurationMinutes: number;
  bufferBetweenAppointmentsMinutes: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

function toMinutes(value: unknown, field: string): number {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new HttpError(400, `${field} debe tener formato de 24 horas HH:MM (ej. 09:00 o 18:30)`);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Valida la estructura de horarios que llega del panel y la devuelve
 * normalizada. Lanza `HttpError` 400 con un mensaje que el personal de la
 * clínica pueda entender, no un error de esquema.
 */
export function parseAvailabilityRules(value: unknown): AvailabilityRules {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'El horario del especialista debe ser un objeto de disponibilidad');
  }

  const raw = value as Record<string, unknown>;

  if (typeof raw.days !== 'object' || raw.days === null || Array.isArray(raw.days)) {
    throw new HttpError(400, 'El horario debe incluir los días de atención');
  }

  const days: Record<number, ShiftRule[]> = {};
  let totalShifts = 0;

  for (const [key, shifts] of Object.entries(raw.days as Record<string, unknown>)) {
    const dayNumber = Number(key);
    if (!Number.isInteger(dayNumber) || dayNumber < 0 || dayNumber > 6) {
      throw new HttpError(400, `Día inválido en el horario: "${key}" (se esperaba de 0 a 6)`);
    }
    if (!Array.isArray(shifts)) {
      throw new HttpError(400, `Los turnos del ${DAY_NAMES[dayNumber]} deben ser una lista`);
    }
    // Un día sin turnos es válido: significa que no se atiende ese día.
    if (shifts.length === 0) continue;

    const dayName = DAY_NAMES[dayNumber];
    const parsed: ShiftRule[] = [];

    for (const shift of shifts) {
      if (typeof shift !== 'object' || shift === null) {
        throw new HttpError(400, `Turno inválido el ${dayName}`);
      }
      const entry = shift as Record<string, unknown>;
      const start = toMinutes(entry.start, `La hora de inicio del ${dayName}`);
      const end = toMinutes(entry.end, `La hora de cierre del ${dayName}`);

      if (end <= start) {
        throw new HttpError(
          400,
          `El ${dayName} la hora de cierre debe ser posterior a la de apertura`
        );
      }

      const rule: ShiftRule = { start: entry.start as string, end: entry.end as string };

      const hasLunchStart = entry.lunchStart !== undefined && entry.lunchStart !== null && entry.lunchStart !== '';
      const hasLunchEnd = entry.lunchEnd !== undefined && entry.lunchEnd !== null && entry.lunchEnd !== '';

      if (hasLunchStart !== hasLunchEnd) {
        throw new HttpError(
          400,
          `El ${dayName} el horario de comida necesita hora de inicio y de fin`
        );
      }

      if (hasLunchStart && hasLunchEnd) {
        const lunchStart = toMinutes(entry.lunchStart, `El inicio de la comida del ${dayName}`);
        const lunchEnd = toMinutes(entry.lunchEnd, `El fin de la comida del ${dayName}`);

        if (lunchEnd <= lunchStart) {
          throw new HttpError(400, `El ${dayName} la comida debe terminar después de empezar`);
        }
        if (lunchStart < start || lunchEnd > end) {
          throw new HttpError(
            400,
            `El ${dayName} el horario de comida debe caer dentro del horario de consulta`
          );
        }
        rule.lunchStart = entry.lunchStart as string;
        rule.lunchEnd = entry.lunchEnd as string;
      }

      parsed.push(rule);
    }

    // Dos turnos traslapados el mismo día generarían slots duplicados.
    const ordered = [...parsed].sort(
      (a, b) => toMinutes(a.start, 'inicio') - toMinutes(b.start, 'inicio')
    );
    for (let i = 1; i < ordered.length; i += 1) {
      if (toMinutes(ordered[i].start, 'inicio') < toMinutes(ordered[i - 1].end, 'cierre')) {
        throw new HttpError(400, `Los turnos del ${dayName} se traslapan entre sí`);
      }
    }

    days[dayNumber] = ordered;
    totalShifts += ordered.length;
  }

  if (totalShifts === 0) {
    throw new HttpError(400, 'El especialista debe atender al menos un día de la semana');
  }

  const slotDurationMinutes =
    raw.slotDurationMinutes === undefined ? 45 : Number(raw.slotDurationMinutes);
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes < 5 || slotDurationMinutes > 480) {
    throw new HttpError(400, 'La duración base de la cita debe estar entre 5 y 480 minutos');
  }

  const bufferBetweenAppointmentsMinutes =
    raw.bufferBetweenAppointmentsMinutes === undefined
      ? 10
      : Number(raw.bufferBetweenAppointmentsMinutes);
  if (
    !Number.isInteger(bufferBetweenAppointmentsMinutes) ||
    bufferBetweenAppointmentsMinutes < 0 ||
    bufferBetweenAppointmentsMinutes > 120
  ) {
    throw new HttpError(400, 'El margen entre citas debe estar entre 0 y 120 minutos');
  }

  return { days, slotDurationMinutes, bufferBetweenAppointmentsMinutes };
}

/** Serializa las reglas para la columna `availabilityRules` (texto JSON). */
export function serializeAvailabilityRules(rules: AvailabilityRules): string {
  return JSON.stringify(rules);
}
