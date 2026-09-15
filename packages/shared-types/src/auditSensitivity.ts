/**
 * Reglas de sensibilidad de la bitácora de auditoría clínica.
 *
 * Única fuente de verdad para "qué evento merece la atención del director":
 * la usan tanto el filtro `onlySensitive` de `GET /api/audit` (backend) como
 * los badges de sensibilidad del panel (`apps/web/src/lib/audit.ts`). Antes
 * de este módulo cada lado tenía su propia copia y con el tiempo se habrían
 * desalineado sin que nada lo hiciera evidente.
 */

export interface AuditSensitivity {
  level: 'critical' | 'warning';
  label: string;
}

export interface DoctorScheduleContext {
  id?: string;
  name?: string;
  availabilityRules?: string | null | Record<string, unknown>;
  isActive?: boolean;
}

export interface AuditScheduleContext {
  doctors?: DoctorScheduleContext[] | null;
  toleranceMinutes?: number;
}

/** Subconjunto mínimo de una fila de auditoría necesario para clasificarla. */
export interface AuditSensitivityRow {
  action: string;
  entityType: string;
  actorType: string;
  actorRole?: string | null;
  actorId?: string | null;
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
}

/** Horario en que un acceso del personal se considera normal por defecto (hora de CDMX). */
const OFFICE_OPENS_HOUR = 7;
const OFFICE_CLOSES_HOUR = 21;
const MEXICO_CITY_TIMEZONE = 'America/Mexico_City';

interface CdmxMoment {
  dayOfWeek: number;
  hour: number;
  minutesOfDay: number;
}

function cdmxMoment(value: Date | string): CdmxMoment {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEXICO_CITY_TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  let weekday = 'Sun';
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = Number(part.value);
    if (part.type === 'minute') minute = Number(part.value);
  }

  const daysMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dayOfWeek: daysMap[weekday] ?? 0,
    hour,
    minutesOfDay: hour * 60 + minute,
  };
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

interface ParsedShift {
  start: number;
  end: number;
}

function parseDoctorRules(rules: unknown): Record<number, ParsedShift[]> | null {
  if (!rules) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof rules === 'string') {
    try {
      obj = JSON.parse(rules) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof rules === 'object' && rules !== null) {
    obj = rules as Record<string, unknown>;
  }
  if (!obj || typeof obj !== 'object' || !obj.days || typeof obj.days !== 'object') {
    return null;
  }
  const result: Record<number, ParsedShift[]> = {};
  for (const [dayKey, shifts] of Object.entries(obj.days as Record<string, unknown>)) {
    const dayNum = Number(dayKey);
    if (Number.isNaN(dayNum) || !Array.isArray(shifts)) continue;
    const parsedShifts: ParsedShift[] = [];
    for (const shift of shifts) {
      if (
        shift &&
        typeof shift === 'object' &&
        typeof (shift as Record<string, unknown>).start === 'string' &&
        typeof (shift as Record<string, unknown>).end === 'string'
      ) {
        const start = parseTimeToMinutes((shift as Record<string, string>).start);
        const end = parseTimeToMinutes((shift as Record<string, string>).end);
        if (start !== null && end !== null && end > start) {
          parsedShifts.push({ start, end });
        }
      }
    }
    if (parsedShifts.length > 0) {
      result[dayNum] = parsedShifts;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function isOutsideBusinessHours(
  createdAt: Date | string,
  context?: AuditScheduleContext,
  targetDoctorId?: string | null
): boolean {
  const moment = cdmxMoment(createdAt);
  const tolerance = context?.toleranceMinutes ?? 30;

  const doctors = context?.doctors;
  if (doctors && doctors.length > 0) {
    if (targetDoctorId) {
      const doc = doctors.find((d) => d.id === targetDoctorId);
      if (doc) {
        const rules = parseDoctorRules(doc.availabilityRules);
        if (rules) {
          const shifts = rules[moment.dayOfWeek];
          if (!shifts || shifts.length === 0) return true;
          const inAnyShift = shifts.some(
            (shift) =>
              moment.minutesOfDay >= shift.start - tolerance && moment.minutesOfDay <= shift.end + tolerance
          );
          return !inAnyShift;
        }
      }
    }

    let hadAnyValidRules = false;
    let anyDoctorWorking = false;

    for (const doc of doctors) {
      if (doc.isActive === false) continue;
      const rules = parseDoctorRules(doc.availabilityRules);
      if (!rules) continue;
      hadAnyValidRules = true;
      const shifts = rules[moment.dayOfWeek];
      if (
        shifts &&
        shifts.some(
          (shift) =>
            moment.minutesOfDay >= shift.start - tolerance && moment.minutesOfDay <= shift.end + tolerance
        )
      ) {
        anyDoctorWorking = true;
        break;
      }
    }

    if (hadAnyValidRules) {
      return !anyDoctorWorking;
    }
  }

  return moment.hour < OFFICE_OPENS_HOUR || moment.hour >= OFFICE_CLOSES_HOUR;
}

export function auditSensitivityOf(
  row: AuditSensitivityRow,
  context?: AuditScheduleContext
): AuditSensitivity | null {
  if (row.action === 'LOGIN_FAILED') return { level: 'critical', label: 'Inicio de sesión fallido' };
  if (row.action === 'DELETE') {
    return { level: 'critical', label: row.entityType === 'TENANT' ? 'Historial borrado' : 'Borrado' };
  }
  if (row.action === 'EXPORT') return { level: 'warning', label: 'Datos exportados' };
  if (row.action === 'UPDATE' && row.actorType === 'USER' && row.changes && 'paymentStatus' in row.changes) {
    return { level: 'warning', label: 'Pago marcado a mano' };
  }
  // Revisar la bitácora es justo el trabajo del auditor: marcarlo fuera de
  // horario solo haría que la dirección se alarmara con sus propias visitas.
  const reviewingAudit = row.action === 'LIST' && row.entityType === 'AUDIT_LOG';
  if (row.actorType === 'USER' && !reviewingAudit) {
    const doctorId =
      (row.metadata?.doctorId as string | undefined) ||
      (row.actorRole === 'DOCTOR' ? (row.actorId ?? undefined) : undefined);

    if (isOutsideBusinessHours(row.createdAt, context, doctorId)) {
      return { level: 'warning', label: 'Fuera de horario' };
    }
  }
  return null;
}
