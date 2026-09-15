import {
  MEXICO_CITY_TIMEZONE,
  addDaysToDateKey,
  formatMexicanPhone,
  formatMexicoCityDate,
  formatMexicoCityDateShort,
  formatMexicoCityTime,
  formatMxn,
  toMexicoCityDateKey,
} from './format';

/**
 * Vocabulario de la bitácora de auditoría en el panel: convierte cada fila de
 * `GET /api/audit` en una frase que un director de clínica entiende sin
 * conocer el modelo de datos, y decide qué eventos merecen su atención.
 */

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'READ'
  | 'LIST'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT';
export type AuditActorType = 'USER' | 'AI_AGENT' | 'WEBHOOK' | 'SYSTEM' | 'ANONYMOUS';
export type AuditChanges = Record<string, { before: unknown; after: unknown }>;

export interface AuditPatientRef {
  id: string;
  fullName: string;
  phoneE164: string;
}

export interface AuditEvent {
  id: string;
  createdAt: string;
  actorType: AuditActorType;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  actorName: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  patientId: string | null;
  patient: AuditPatientRef | null;
  changes: AuditChanges | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export type AuditPeriod = 'today' | '7d' | '30d' | 'all';
export type AuditCategory = 'all' | 'access' | 'changes' | 'sessions';

export const PERIOD_OPTIONS: { value: AuditPeriod; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'all', label: 'Todo' },
];

export const CATEGORY_OPTIONS: { value: AuditCategory; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'access', label: 'Accesos' },
  { value: 'changes', label: 'Cambios' },
  { value: 'sessions', label: 'Sesiones' },
];

export const CATEGORY_ACTIONS: Record<Exclude<AuditCategory, 'all'>, AuditAction[]> = {
  access: ['READ', 'LIST', 'EXPORT'],
  changes: ['CREATE', 'UPDATE', 'DELETE'],
  sessions: ['LOGIN', 'LOGIN_FAILED'],
};

export const PERIOD_PHRASE: Record<AuditPeriod, string> = {
  today: 'hoy',
  '7d': 'en los últimos 7 días',
  '30d': 'en los últimos 30 días',
  all: 'desde que existe registro',
};

export function parsePeriod(value: string | null): AuditPeriod {
  return value === 'today' || value === '30d' || value === 'all' ? value : '7d';
}

export function parseCategory(value: string | null): AuditCategory {
  return value === 'access' || value === 'changes' || value === 'sessions' ? value : 'all';
}

/** CDMX no tiene horario de verano desde 2022: su offset es -06:00 todo el año. */
export function cdmxLocalToIso(dateKey: string, time: string): string {
  return new Date(`${dateKey}T${time}:00-06:00`).toISOString();
}

export function periodStartIso(period: AuditPeriod, now = new Date()): string | null {
  if (period === 'all') return null;
  const daysBack = period === 'today' ? 0 : period === '7d' ? 6 : 29;
  return cdmxLocalToIso(addDaysToDateKey(toMexicoCityDateKey(now), -daysBack), '00:00');
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Dirección',
  RECEPTIONIST: 'Recepción',
  DOCTOR: 'Médico',
  STAFF: 'Personal',
};

const CHANNEL_INLINE: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  PHONE_CALL: 'llamada',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEBCHAT: 'chat web',
};

const CHANNEL_TITLE: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  PHONE_CALL: 'Llamada telefónica',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEBCHAT: 'Chat web',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  RESCHEDULED: 'Reprogramada',
  COMPLETED: 'Completada',
  NO_SHOW: 'No asistió',
};

const PAYMENT_LABELS: Record<string, string> = {
  NONE: 'Sin anticipo',
  DEPOSIT_PENDING: 'Anticipo pendiente',
  DEPOSIT_PAID: 'Anticipo pagado',
  FULLY_PAID: 'Pagado completo',
  REFUNDED: 'Reembolsado',
};

const FIELD_LABELS: Record<string, string> = {
  status: 'Estatus',
  paymentStatus: 'Pago',
  notes: 'Notas',
  startTime: 'Inicio',
  endTime: 'Fin',
  depositAmountMxn: 'Anticipo',
  depositPaymentUrl: 'Link de pago',
  paymentReferenceId: 'Referencia de pago',
  isHandedOverToHuman: 'Quién responde',
  name: 'Nombre',
  phoneE164: 'Teléfono',
  address: 'Dirección',
  welcomeMessage: 'Mensaje de bienvenida',
  emergencyInstructions: 'Instrucciones de emergencia',
};

const LOGIN_FAILURE_LABELS: Record<string, string> = {
  BAD_PASSWORD: 'contraseña incorrecta',
  NO_MATCHING_USER: 'correo no registrado',
  AMBIGUOUS_TENANT: 'correo registrado en varias clínicas',
};

const TOOL_LABELS: Record<string, string> = {
  agendar_cita: 'Agendar cita',
  confirmar_asistencia_cita: 'Confirmar asistencia',
  confirmar_asistencia: 'Confirmar asistencia',
  consultar_citas_paciente: 'Consultar cita',
  cancelar_cita_paciente: 'Cancelar cita',
  cancelar_cita: 'Cancelar cita',
};

function metaString(event: AuditEvent, key: string): string | null {
  const value = event.metadata?.[key];
  return typeof value === 'string' ? value : null;
}

function metaNumber(event: AuditEvent, key: string): number | null {
  const value = event.metadata?.[key];
  return typeof value === 'number' ? value : null;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString('es-MX')} ${count === 1 ? singular : pluralForm}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Complemento de persona con el artículo que pide el español: "al Dr. X", "a la Dra. Y". */
function toPerson(name: string): string {
  if (/^dra\.?\s/i.test(name)) return `a la ${name}`;
  if (/^dr\.?\s/i.test(name)) return `al ${name}`;
  return `a ${name}`;
}

function cdmxHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: MEXICO_CITY_TIMEZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date(iso))
  );
}

function appointmentMoment(iso: string): string {
  return `${formatMexicoCityDateShort(iso)}, ${formatMexicoCityTime(iso)}`;
}

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export type ActorKind = 'person' | 'ai' | 'payment' | 'system' | 'unknown';

export interface ActorInfo {
  /** Valor para filtrar por `actorId`; `null` si no se puede (login anónimo). */
  pivotId: string | null;
  name: string;
  detail: string | null;
  kind: ActorKind;
  initials: string;
}

function initialsOf(name: string): string {
  const words = name
    .replace(/^(dra?|lic|ing|mtr[oa])\.?\s+/i, '')
    .split(/[\s@._-]+/)
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

export function actorInfo(event: AuditEvent): ActorInfo {
  switch (event.actorType) {
    case 'USER': {
      const name = event.actorName ?? event.actorEmail ?? 'Usuario eliminado';
      return {
        pivotId: event.actorId,
        name,
        detail: event.actorRole ? ROLE_LABELS[event.actorRole] ?? event.actorRole : null,
        kind: 'person',
        initials: initialsOf(name),
      };
    }
    case 'AI_AGENT': {
      const channel = metaString(event, 'channel') ?? metaString(event, 'channelOrigin');
      return {
        pivotId: event.actorId,
        name: 'Asistente IA',
        detail: channel ? `vía ${CHANNEL_INLINE[channel] ?? channel}` : null,
        kind: 'ai',
        initials: 'IA',
      };
    }
    case 'WEBHOOK':
      return {
        pivotId: event.actorId,
        name: event.actorId === 'mercadopago' ? 'Mercado Pago' : `Webhook ${event.actorId ?? ''}`.trim(),
        detail: 'Notificación de pago',
        kind: 'payment',
        initials: 'MP',
      };
    case 'SYSTEM':
      return { pivotId: event.actorId, name: 'Sistema', detail: null, kind: 'system', initials: 'S' };
    default: {
      const name = event.actorEmail ?? 'Desconocido';
      return {
        pivotId: null,
        name,
        detail: 'Sin sesión iniciada',
        kind: 'unknown',
        initials: initialsOf(name),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Frase del evento
// ---------------------------------------------------------------------------

export interface EventSentence {
  /** Verbo y complemento que siguen al nombre del actor. */
  lead: string;
  /** Si el nombre del paciente va justo después de `lead`. */
  showPatient: boolean;
  trail: string | null;
}

function sentence(lead: string, showPatient = false, trail: string | null = null): EventSentence {
  return { lead, showPatient, trail };
}

function describeAppointmentUpdate(event: AuditEvent): EventSentence {
  const changes = event.changes ?? {};
  if (metaString(event, 'event') === 'DEPOSIT_LINK_CREATED') {
    return sentence('envió el link de anticipo a', true);
  }
  if (changes.paymentStatus) {
    if (event.actorType === 'WEBHOOK') return sentence('acreditó el anticipo de', true);
    return sentence('cambió a mano el estado de pago de', true);
  }
  if (changes.status?.after === 'CANCELLED') return sentence('canceló la cita de', true);
  if (changes.status?.after === 'CONFIRMED') return sentence('confirmó la cita de', true);
  if (changes.startTime) {
    const next = changes.startTime.after;
    return sentence(
      'reprogramó la cita de',
      true,
      typeof next === 'string' ? `al ${appointmentMoment(next)}` : null
    );
  }
  return sentence('modificó la cita de', true);
}

export function describeEvent(event: AuditEvent): EventSentence {
  const name = metaString(event, 'name');

  switch (event.action) {
    case 'LOGIN':
      return sentence('inició sesión');

    case 'LOGIN_FAILED': {
      const reason = metaString(event, 'reason');
      return sentence(
        'intentó iniciar sesión sin éxito',
        false,
        reason ? LOGIN_FAILURE_LABELS[reason] ?? null : null
      );
    }

    case 'EXPORT': {
      const count = metaNumber(event, 'count');
      const trail = count !== null ? plural(count, 'evento', 'eventos') : null;
      return event.patientId
        ? sentence('exportó los accesos al expediente de', true, trail)
        : sentence('exportó la bitácora', false, trail);
    }

    case 'LIST': {
      const count = metaNumber(event, 'count');
      if (event.entityType === 'APPOINTMENT') {
        return sentence('consultó la agenda', false, count !== null ? plural(count, 'cita', 'citas') : null);
      }
      if (event.entityType === 'CONVERSATION') {
        return sentence(
          'revisó la bandeja de chats',
          false,
          count !== null ? plural(count, 'chat', 'chats') : null
        );
      }
      if (event.entityType === 'AUDIT_LOG') {
        return event.patientId
          ? sentence('revisó quién accedió al expediente de', true)
          : sentence('consultó esta bitácora');
      }
      return sentence('consultó un listado');
    }

    case 'READ':
      if (event.entityType === 'CONVERSATION') return sentence('abrió el chat de', true);
      if (event.entityType === 'APPOINTMENT' && event.actorType === 'AI_AGENT') {
        return sentence('le informó su próxima cita a', true);
      }
      return sentence('consultó el expediente de', Boolean(event.patientId));

    case 'CREATE': {
      if (event.entityType === 'APPOINTMENT') {
        const startTime = metaString(event, 'startTime');
        const trail = startTime ? `para el ${appointmentMoment(startTime)}` : null;
        return metaString(event, 'source') === 'DEMO_SEED'
          ? sentence('generó una cita de prueba para', true, trail)
          : sentence('agendó una cita para', true, trail);
      }
      if (event.entityType === 'MESSAGE') {
        const channel = metaString(event, 'channel');
        return sentence('respondió a', true, channel ? `por ${CHANNEL_INLINE[channel] ?? channel}` : null);
      }
      if (event.entityType === 'DOCTOR') {
        return sentence(`dio de alta ${name ? toPerson(name) : 'a un especialista'}`);
      }
      if (event.entityType === 'SERVICE') return sentence(`agregó el servicio ${name ?? 'nuevo'}`);
      if (event.entityType === 'TENANT') return sentence('dio de alta la clínica', false, name);
      return sentence('creó un registro');
    }

    case 'UPDATE': {
      if (event.entityType === 'APPOINTMENT') return describeAppointmentUpdate(event);
      if (event.entityType === 'CONVERSATION') {
        const handedOver = event.changes?.isHandedOverToHuman?.after;
        return handedOver === false
          ? sentence('devolvió a la IA el chat de', true)
          : sentence('tomó el control del chat de', true);
      }
      if (event.entityType === 'TENANT') {
        const fields = Object.keys(event.changes ?? {}).map((field) =>
          (FIELD_LABELS[field] ?? field).toLowerCase()
        );
        return sentence('cambió la configuración de la clínica', false, fields.join(', ') || null);
      }
      return sentence('modificó un registro');
    }

    case 'DELETE': {
      const deleted = event.metadata?.deleted as Record<string, number> | undefined;
      if (event.entityType === 'TENANT' && deleted) {
        return sentence(
          'borró el historial clínico',
          false,
          `${plural(deleted.appointments ?? 0, 'cita', 'citas')}, ${plural(
            deleted.conversations ?? 0,
            'chat',
            'chats'
          )} y ${plural(deleted.messages ?? 0, 'mensaje', 'mensajes')}`
        );
      }
      const cascaded = metaNumber(event, 'appointmentsDeleted') ?? 0;
      const withAppointments =
        cascaded === 0 ? '' : cascaded === 1 ? ' y su cita' : ` y sus ${plural(cascaded, 'cita', 'citas')}`;
      if (event.entityType === 'DOCTOR') {
        return sentence(`eliminó ${name ? toPerson(name) : 'a un especialista'}${withAppointments}`);
      }
      if (event.entityType === 'SERVICE') {
        return sentence(`eliminó el servicio${name ? ` ${name}` : ''}${withAppointments}`);
      }
      return sentence('eliminó un registro');
    }

    default:
      return sentence('realizó una acción');
  }
}

// ---------------------------------------------------------------------------
// Sensibilidad
// ---------------------------------------------------------------------------

export interface Sensitivity {
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

/** Horario en que un acceso del personal se considera normal por defecto (hora de CDMX). */
const OFFICE_OPENS_HOUR = 7;
const OFFICE_CLOSES_HOUR = 21;

interface CdmxMoment {
  dayOfWeek: number;
  hour: number;
  minutesOfDay: number;
}

function cdmxMoment(iso: string): CdmxMoment {
  const date = new Date(iso);
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
  iso: string,
  context?: AuditScheduleContext,
  targetDoctorId?: string | null
): boolean {
  const moment = cdmxMoment(iso);
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
            (shift) => moment.minutesOfDay >= shift.start - tolerance && moment.minutesOfDay <= shift.end + tolerance
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
          (shift) => moment.minutesOfDay >= shift.start - tolerance && moment.minutesOfDay <= shift.end + tolerance
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

export function sensitivityOf(event: AuditEvent, context?: AuditScheduleContext): Sensitivity | null {
  if (event.action === 'LOGIN_FAILED') return { level: 'critical', label: 'Inicio de sesión fallido' };
  if (event.action === 'DELETE') {
    return { level: 'critical', label: event.entityType === 'TENANT' ? 'Historial borrado' : 'Borrado' };
  }
  if (event.action === 'EXPORT') return { level: 'warning', label: 'Datos exportados' };
  if (event.action === 'UPDATE' && event.actorType === 'USER' && event.changes?.paymentStatus) {
    return { level: 'warning', label: 'Pago marcado a mano' };
  }
  // Revisar la bitácora es justo el trabajo del auditor: marcarlo fuera de
  // horario solo haría que la dirección se alarmara con sus propias visitas.
  const reviewingAudit = event.action === 'LIST' && event.entityType === 'AUDIT_LOG';
  if (event.actorType === 'USER' && !reviewingAudit) {
    const doctorId =
      (event.metadata?.doctorId as string | undefined) ||
      (event.actorRole === 'DOCTOR' ? (event.actorId ?? undefined) : undefined);

    if (isOutsideBusinessHours(event.createdAt, context, doctorId)) {
      return { level: 'warning', label: 'Fuera de horario' };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Detalle: diff y rastro técnico
// ---------------------------------------------------------------------------

export function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'status' && typeof value === 'string') return STATUS_LABELS[value] ?? value;
  if (field === 'paymentStatus' && typeof value === 'string') return PAYMENT_LABELS[value] ?? value;
  if ((field === 'startTime' || field === 'endTime') && typeof value === 'string') {
    return appointmentMoment(value);
  }
  if (/Mxn$/.test(field)) return formatMxn(Number(value));
  if (field === 'phoneE164' && typeof value === 'string') return formatMexicanPhone(value);
  if (field === 'isHandedOverToHuman') return value ? 'Recepción (IA en pausa)' : 'Asistente IA';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export interface ChangeRow {
  field: string;
  label: string;
  before: string;
  after: string;
}

export function changeRows(event: AuditEvent): ChangeRow[] {
  return Object.entries(event.changes ?? {}).map(([field, change]) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
    before: formatAuditValue(field, change.before),
    after: formatAuditValue(field, change.after),
  }));
}

export function describeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  // iOS antes que macOS: su user-agent dice "like Mac OS X".
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} en ${os}`;
  return userAgent.length > 60 ? `${userAgent.slice(0, 57)}…` : userAgent;
}

export interface TraceItem {
  label: string;
  value: string;
  mono?: boolean;
}

export function traceItems(event: AuditEvent): TraceItem[] {
  const items: TraceItem[] = [];
  const tool = metaString(event, 'tool');
  if (tool) {
    const isFallback = tool.startsWith('fallback:');
    const base = tool.replace(/^fallback:/, '');
    items.push({
      label: 'Acción del asistente',
      value: `${TOOL_LABELS[base] ?? base}${isFallback ? ' (motor de respaldo)' : ''}`,
    });
  }
  const channel = metaString(event, 'channel') ?? metaString(event, 'channelOrigin');
  if (channel) items.push({ label: 'Canal', value: CHANNEL_TITLE[channel] ?? channel });
  const conversationId = metaString(event, 'conversationId');
  if (conversationId) items.push({ label: 'Conversación', value: conversationId, mono: true });
  if (event.ipAddress) items.push({ label: 'IP', value: event.ipAddress, mono: true });
  const device = describeUserAgent(event.userAgent);
  if (device) items.push({ label: 'Dispositivo', value: device });
  if (event.requestId) items.push({ label: 'ID de solicitud', value: event.requestId, mono: true });
  return items;
}

// ---------------------------------------------------------------------------
// Agrupación por día
// ---------------------------------------------------------------------------

export interface AuditDayGroup {
  key: string;
  label: string;
  events: AuditEvent[];
}

/** Agrupa eventos ya ordenados del más reciente al más antiguo, por día de CDMX. */
export function groupByDay(events: AuditEvent[], now = new Date()): AuditDayGroup[] {
  const today = toMexicoCityDateKey(now);
  const yesterday = addDaysToDateKey(today, -1);
  const groups: AuditDayGroup[] = [];

  for (const event of events) {
    const key = toMexicoCityDateKey(new Date(event.createdAt));
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label:
          key === today ? 'Hoy' : key === yesterday ? 'Ayer' : capitalize(formatMexicoCityDate(event.createdAt)),
        events: [],
      };
      groups.push(group);
    }
    group.events.push(event);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// CSV del modo Demo (en vivo lo genera y audita el servidor)
// ---------------------------------------------------------------------------

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
  timeZone: MEXICO_CITY_TIMEZONE,
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
  // Misma defensa que el servidor contra fórmulas al abrir el CSV en Excel.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function auditEventsToCsv(events: AuditEvent[]): string {
  const lines = [
    CSV_COLUMNS.join(','),
    ...events.map((event) =>
      [
        cdmxTimestamp.format(new Date(event.createdAt)),
        event.actorType,
        event.actorName,
        event.actorEmail,
        event.actorRole,
        event.action,
        event.entityType,
        event.entityId,
        event.patient?.fullName,
        event.patientId,
        event.changes,
        event.metadata,
        event.ipAddress,
        event.userAgent,
        event.requestId,
      ]
        .map(csvCell)
        .join(',')
    ),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}
