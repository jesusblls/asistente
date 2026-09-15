import { addDaysToDateKey, toMexicoCityDateKey } from '../../../lib/format';
import {
  CATEGORY_ACTIONS,
  cdmxLocalToIso,
  periodStartIso,
  type AuditAction,
  type AuditCategory,
  type AuditChanges,
  type AuditEvent,
  type AuditPeriod,
} from '../../../lib/audit';

/**
 * Bitácora ficticia del Modo Demo (Clínica Dental Sonrisas Polanco).
 *
 * Todo es sintético: personal, pacientes, IPs y solicitudes. Los pacientes y
 * horarios coinciden con la agenda demo del resumen (Mariana hoy 4:00 PM,
 * Roberto hoy 5:30 PM, Laura mañana 11:00 AM, Fernando mañana 1:00 PM) para
 * que la presentación cuente una sola historia. Las horas son fijas en CDMX
 * para que el acceso fuera de horario y los logins fallidos de madrugada se
 * vean igual a cualquier hora en que se haga la demostración.
 */

const STAFF = {
  direccion: {
    id: 'demo-u-direccion',
    name: 'Dr. Ramón Ibarra',
    email: 'direccion@sonrisaspolanco.mx',
    role: 'ADMIN',
  },
  recepcion: {
    id: 'demo-u-recepcion',
    name: 'Lucía Ortega',
    email: 'recepcion@sonrisaspolanco.mx',
    role: 'RECEPTIONIST',
  },
  silva: {
    id: 'demo-u-silva',
    name: 'Dra. Sofía Silva',
    email: 'sofia.silva@sonrisaspolanco.mx',
    role: 'DOCTOR',
  },
  morales: {
    id: 'demo-u-morales',
    name: 'Dr. Alejandro Morales',
    email: 'alejandro.morales@sonrisaspolanco.mx',
    role: 'DOCTOR',
  },
} as const;

const PATIENTS = {
  mariana: { id: 'demo-p-mariana', fullName: 'Mariana Hernández', phoneE164: '+525512349988' },
  roberto: { id: 'demo-p-roberto', fullName: 'Roberto Domínguez', phoneE164: '+525599887711' },
  laura: { id: 'demo-p-laura', fullName: 'Laura Patricia Vega', phoneE164: '+525544332211' },
  fernando: { id: 'demo-p-fernando', fullName: 'Fernando Rivas', phoneE164: '+525577665544' },
} as const;

// Rangos reservados para documentación (RFC 5737): no apuntan a nadie real,
// ni siquiera la que hace el papel de atacante.
const OFFICE_IP = '203.0.113.24';
const HOME_IP = '198.51.100.73';
const ATTACKER_IP = '192.0.2.201';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const SCRIPT_UA = 'python-requests/2.32.3';

type Person = (typeof STAFF)[keyof typeof STAFF];
type Patient = (typeof PATIENTS)[keyof typeof PATIENTS];
type DemoActor = Person | 'ai' | 'mercadopago' | { attemptedEmail: string };

interface DraftEvent {
  at: [daysAgo: number, time: string];
  actor: DemoActor;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  patient?: Patient;
  changes?: AuditChanges;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

function toEvent(draft: DraftEvent, index: number, at: (daysAgo: number, time: string) => string): AuditEvent {
  const base = {
    id: `demo-audit-${index + 1}`,
    createdAt: at(...draft.at),
    action: draft.action,
    entityType: draft.entityType,
    entityId: draft.entityId ?? draft.patient?.id ?? null,
    patientId: draft.patient?.id ?? null,
    patient: draft.patient ? { ...draft.patient } : null,
    changes: draft.changes ?? null,
    metadata: draft.metadata ?? null,
    requestId: `demo-req-${(index + 1).toString(16).padStart(4, '0')}`,
  };

  if (draft.actor === 'ai') {
    return {
      ...base,
      actorType: 'AI_AGENT',
      actorId: 'omnichannel-agent',
      actorEmail: null,
      actorRole: null,
      actorName: null,
      ipAddress: null,
      userAgent: null,
    };
  }
  if (draft.actor === 'mercadopago') {
    return {
      ...base,
      actorType: 'WEBHOOK',
      actorId: 'mercadopago',
      actorEmail: null,
      actorRole: null,
      actorName: null,
      ipAddress: null,
      userAgent: null,
    };
  }
  if ('attemptedEmail' in draft.actor) {
    return {
      ...base,
      actorType: 'ANONYMOUS',
      actorId: null,
      actorEmail: draft.actor.attemptedEmail,
      actorRole: null,
      actorName: null,
      ipAddress: draft.ip ?? null,
      userAgent: draft.userAgent ?? null,
    };
  }
  return {
    ...base,
    actorType: 'USER',
    actorId: draft.actor.id,
    actorEmail: draft.actor.email,
    actorRole: draft.actor.role,
    actorName: draft.actor.name,
    ipAddress: draft.ip ?? OFFICE_IP,
    userAgent: draft.userAgent ?? CHROME_MAC,
  };
}

function getTodayTimes(now: Date): string[] {
  const canonical = [
    '13:42',
    '13:15',
    '12:58',
    '12:33',
    '12:31',
    '11:47',
    '11:20',
    '10:52',
    '10:05',
    '09:12',
    '09:03',
  ];

  // CDMX offset es -06:00 constante (sin horario de verano)
  const cdmxMs = now.getTime() - 6 * 60 * 60 * 1000;
  const cdmxDate = new Date(cdmxMs);
  const nowMinutes = cdmxDate.getUTCHours() * 60 + cdmxDate.getUTCMinutes();

  // Si ya pasaron las 13:45 en CDMX, usamos las horas canónicas completas.
  if (nowMinutes >= 13 * 60 + 45) {
    return canonical;
  }

  // Si es temprano en CDMX, anclamos los eventos hacia atrás antes de "now"
  // para que el grupo "Hoy" nunca quede vacío y conserve el orden cronológico.
  const latestMinute = Math.max(nowMinutes - 3, 2);
  const span = Math.min(latestMinute - 1, 240);
  return canonical.map((_, i) => {
    const minuteOfDay = Math.max(1, Math.round(latestMinute - (i / (canonical.length - 1)) * span));
    const h = Math.floor(minuteOfDay / 60);
    const m = minuteOfDay % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

export function buildDemoAuditEvents(now = new Date()): AuditEvent[] {
  const today = toMexicoCityDateKey(now);
  const todayTimes = getTodayTimes(now);
  const at = (daysAgo: number, time: string) => cdmxLocalToIso(addDaysToDateKey(today, -daysAgo), time);
  const { direccion, recepcion, silva, morales } = STAFF;
  const { mariana, roberto, laura, fernando } = PATIENTS;
  const failedLogin = (time: string): DraftEvent => ({
    at: [2, time],
    actor: { attemptedEmail: 'recepcion@sonrisaspolanco.mx' },
    action: 'LOGIN_FAILED',
    entityType: 'SESSION',
    metadata: { reason: 'BAD_PASSWORD' },
    ip: ATTACKER_IP,
    userAgent: SCRIPT_UA,
  });

  const drafts: DraftEvent[] = [
    // Hoy
    { at: [0, todayTimes[0]], actor: silva, action: 'READ', entityType: 'CONVERSATION', entityId: 'demo-conv-mariana', patient: mariana },
    {
      at: [0, todayTimes[1]],
      actor: 'ai',
      action: 'UPDATE',
      entityType: 'APPOINTMENT',
      patient: mariana,
      changes: { status: { before: 'PENDING', after: 'CONFIRMED' } },
      metadata: { tool: 'confirmar_asistencia_cita', channel: 'WHATSAPP', conversationId: 'demo-conv-mariana' },
    },
    {
      at: [0, todayTimes[2]],
      actor: 'ai',
      action: 'READ',
      entityType: 'APPOINTMENT',
      patient: fernando,
      metadata: { tool: 'consultar_citas_paciente', channel: 'PHONE_CALL', conversationId: 'demo-call-fernando' },
    },
    {
      at: [0, todayTimes[3]],
      actor: recepcion,
      action: 'CREATE',
      entityType: 'MESSAGE',
      entityId: 'demo-msg-roberto',
      patient: roberto,
      metadata: { conversationId: 'demo-conv-roberto', channel: 'WHATSAPP' },
    },
    {
      at: [0, todayTimes[4]],
      actor: recepcion,
      action: 'UPDATE',
      entityType: 'CONVERSATION',
      entityId: 'demo-conv-roberto',
      patient: roberto,
      changes: { isHandedOverToHuman: { before: false, after: true } },
    },
    {
      at: [0, todayTimes[5]],
      actor: recepcion,
      action: 'UPDATE',
      entityType: 'APPOINTMENT',
      patient: laura,
      changes: {
        paymentStatus: { before: 'DEPOSIT_PENDING', after: 'DEPOSIT_PAID' },
        notes: { before: null, after: 'Pagó el anticipo en efectivo en recepción' },
      },
    },
    {
      at: [0, todayTimes[6]],
      actor: 'mercadopago',
      action: 'UPDATE',
      entityType: 'APPOINTMENT',
      patient: roberto,
      changes: { paymentStatus: { before: 'DEPOSIT_PENDING', after: 'DEPOSIT_PAID' } },
    },
    {
      at: [0, todayTimes[7]],
      actor: 'ai',
      action: 'CREATE',
      entityType: 'APPOINTMENT',
      patient: roberto,
      metadata: {
        tool: 'agendar_cita',
        channel: 'PHONE_CALL',
        channelOrigin: 'PHONE_CALL',
        startTime: at(0, '17:30'),
        conversationId: 'demo-call-roberto',
      },
    },
    { at: [0, todayTimes[8]], actor: morales, action: 'READ', entityType: 'CONVERSATION', entityId: 'demo-conv-fernando', patient: fernando },
    { at: [0, todayTimes[9]], actor: recepcion, action: 'LIST', entityType: 'APPOINTMENT', metadata: { count: 8 } },
    { at: [0, todayTimes[10]], actor: recepcion, action: 'LOGIN', entityType: 'SESSION' },

    // Ayer
    {
      at: [1, '23:47'],
      actor: morales,
      action: 'READ',
      entityType: 'CONVERSATION',
      entityId: 'demo-conv-laura',
      patient: laura,
      ip: HOME_IP,
      userAgent: SAFARI_IPHONE,
    },
    { at: [1, '19:10'], actor: direccion, action: 'EXPORT', entityType: 'AUDIT_LOG', metadata: { count: 214 } },
    { at: [1, '18:36'], actor: direccion, action: 'LIST', entityType: 'AUDIT_LOG', patient: mariana, metadata: { count: 12 } },
    {
      at: [1, '16:20'],
      actor: recepcion,
      action: 'UPDATE',
      entityType: 'APPOINTMENT',
      patient: fernando,
      changes: {
        startTime: { before: at(-1, '11:00'), after: at(-1, '13:00') },
        endTime: { before: at(-1, '11:45'), after: at(-1, '13:45') },
      },
    },
    {
      at: [1, '15:02'],
      actor: 'ai',
      action: 'CREATE',
      entityType: 'APPOINTMENT',
      patient: laura,
      metadata: {
        tool: 'agendar_cita',
        channel: 'WHATSAPP',
        channelOrigin: 'WHATSAPP',
        startTime: at(-1, '11:00'),
        conversationId: 'demo-conv-laura',
      },
    },
    {
      at: [1, '10:40'],
      actor: direccion,
      action: 'UPDATE',
      entityType: 'TENANT',
      entityId: 'demo-tenant',
      changes: {
        welcomeMessage: {
          before: '¡Hola! Bienvenido a Sonrisas Polanco.',
          after: '¡Hola! Gracias por escribir a Clínica Dental Sonrisas Polanco. ¿En qué podemos ayudarte hoy?',
        },
      },
    },

    // Hace dos días
    {
      at: [2, '17:55'],
      actor: direccion,
      action: 'DELETE',
      entityType: 'DOCTOR',
      entityId: 'demo-doctor-paredes',
      metadata: { name: 'Dr. Iván Paredes', appointmentsDeleted: 2 },
    },
    {
      at: [2, '09:30'],
      actor: direccion,
      action: 'CREATE',
      entityType: 'SERVICE',
      entityId: 'demo-service-blanqueamiento',
      metadata: { name: 'Blanqueamiento Dental LED', priceMxn: 3500, requiredDepositMxn: 500 },
    },
    failedLogin('02:14'),
    failedLogin('02:13'),
    failedLogin('02:11'),

    // Hace tres días
    { at: [3, '12:10'], actor: silva, action: 'READ', entityType: 'CONVERSATION', entityId: 'demo-conv-mariana', patient: mariana },
    {
      at: [3, '09:45'],
      actor: 'ai',
      action: 'CREATE',
      entityType: 'APPOINTMENT',
      patient: mariana,
      metadata: {
        tool: 'agendar_cita',
        channel: 'WHATSAPP',
        channelOrigin: 'WHATSAPP',
        startTime: at(0, '16:00'),
        conversationId: 'demo-conv-mariana',
      },
    },
  ];

  const nowMs = now.getTime();
  return drafts
    .map((draft, index) => toEvent(draft, index, at))
    .filter((event) => new Date(event.createdAt).getTime() <= nowMs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Aplica en el navegador los mismos filtros que `GET /api/audit` aplica en vivo. */
export function filterDemoEvents(
  events: AuditEvent[],
  filters: { period: AuditPeriod; category: AuditCategory; patientId: string | null; actorId: string | null }
): AuditEvent[] {
  const from = periodStartIso(filters.period);
  const actions = filters.category === 'all' ? null : CATEGORY_ACTIONS[filters.category];
  return events.filter(
    (event) =>
      (!from || event.createdAt >= from) &&
      (!actions || actions.includes(event.action)) &&
      (!filters.patientId || event.patientId === filters.patientId) &&
      (!filters.actorId || event.actorId === filters.actorId)
  );
}
