import { db, decryptCredentials, recordAudit, resolveTenantPlan } from '@asistente/database';
import { createLogger, incrementCounter } from '@asistente/observability';
import type { WhatsAppSendPayload } from '../queue/handlers.js';

/**
 * Recordatorios de cita por WhatsApp (24 h y 2 h antes).
 *
 * La landing promete ambos recordatorios y el esquema ya tenía las banderas
 * `reminderSent24h` / `reminderSent2h`, pero nada las leía. Este barrido
 * periódico las usa como candado de envío:
 *
 *   1. Busca citas vigentes cuyo inicio cae dentro de la ventana.
 *   2. Reclama cada cita con un `updateMany ... where reminderSentX = false`.
 *      Si dos instancias de la API barren a la vez, solo una obtiene `count = 1`
 *      y las demás la saltan: el paciente nunca recibe el recordatorio doble.
 *   3. En la MISMA transacción inserta el trabajo `WHATSAPP_SEND` de la cola
 *      durable. Se escribe la fila `Job` directamente con el cliente de la
 *      transacción (en vez de `jobQueue.enqueue`, que usa el cliente global)
 *      para que bandera y envío se confirmen o se pierdan juntos: si el proceso
 *      muere entre ambos pasos no queda una cita "recordada" sin mensaje.
 *
 * El envío real, los reintentos y el modo simulación (sin token de Meta) son
 * responsabilidad del handler `WHATSAPP_SEND` existente; aquí no se toca la red.
 */

const logger = createLogger('api:reminders');

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TIMEZONE = 'America/Mexico_City';
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Citas por consulta del barrido. */
const BATCH_LIMIT = 200;

/** Estados en los que ya no tiene sentido recordar la cita. */
const NON_REMINDABLE_STATUSES = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];

export type ReminderKind = '24h' | '2h';

export interface ReminderSweepResult {
  sent24h: number;
  sent2h: number;
  skipped: number;
}

interface ReminderAppointment {
  id: string;
  tenantId: string;
  patientId: string;
  startTime: Date;
  createdAt: Date;
  paymentStatus: string;
  depositPaymentUrl: string | null;
  patient: { fullName: string; phoneE164: string };
  doctor: { name: string; specialty: string };
  service: { name: string };
  tenant: {
    name: string;
    address: string | null;
    timezone: string;
    isActive: boolean;
    planSlug: string;
    subscriptionStatus: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  };
}

function formatAppointmentDate(startTime: Date, timeZone: string): string {
  return startTime.toLocaleString('es-MX', {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/** Texto del recordatorio. Exportado para que las pruebas verifiquen el contenido. */
export function buildReminderText(appointment: ReminderAppointment, kind: ReminderKind): string {
  const { tenant, patient, doctor, service } = appointment;
  const when = formatAppointmentDate(appointment.startTime, tenant.timezone);
  const header =
    kind === '24h'
      ? `⏰ *Recordatorio de tu cita en ${tenant.name}*`
      : `⏰ *Tu cita en ${tenant.name} es en menos de 2 horas*`;

  const lines = [
    header,
    '',
    `Hola *${patient.fullName}*, te recordamos tu cita:`,
    '',
    `👨‍⚕️ *Especialista:* ${doctor.name} (${doctor.specialty})`,
    `📋 *Tratamiento:* ${service.name}`,
    `🗓 *Fecha y Hora:* ${when}`,
  ];
  if (tenant.address) lines.push(`📍 *Dirección:* ${tenant.address}`);
  if (appointment.paymentStatus === 'DEPOSIT_PENDING' && appointment.depositPaymentUrl) {
    lines.push(`💳 *Anticipo pendiente:* ${appointment.depositPaymentUrl}`);
  }
  lines.push(
    '',
    'Por favor responde *Confirmo* para confirmar tu asistencia o *Reagendar* si necesitas cambiar el horario.'
  );
  return lines.join('\n');
}

/**
 * Número de WhatsApp desde el que se envía el recordatorio de una clínica.
 *
 * - Con canal propio configurado: su `phoneNumberId`.
 * - Sin canal propio: `undefined`, y el handler usa `META_PHONE_NUMBER_ID`.
 *   Es el mismo número por el que esa clínica recibe y contesta hoy (el
 *   webhook la resuelve por `displayPhoneNumber`), así que no hay cruce.
 * - Con canal propio pero credenciales ilegibles: `null` = no enviar. Caer al
 *   número global mandaría el recordatorio desde el WhatsApp de otra clínica.
 */
async function resolveTenantSender(tenantId: string): Promise<string | undefined | null> {
  const config = await db.channelConfig.findFirst({
    where: { tenantId, channelType: 'WHATSAPP', isActive: true },
    select: { credentials: true },
  });
  if (!config) return undefined;
  try {
    const credentials = JSON.parse(decryptCredentials(config.credentials)) as { phoneNumberId?: string };
    if (credentials.phoneNumberId) return credentials.phoneNumberId;
  } catch {
    // Se reporta abajo.
  }
  logger.error('Canal de WhatsApp de la clínica sin phoneNumberId legible: no se envían recordatorios', undefined, {
    tenantId,
  });
  return null;
}

/** Máximo de citas revisadas por ventana y barrido (protege ante un apagón largo). */
const MAX_PER_SWEEP = 2000;

async function findDueAppointments(
  kind: ReminderKind,
  now: Date,
  cursor?: { startTime: Date; id: string }
): Promise<ReminderAppointment[]> {
  // Ventanas: 24 h = (ahora + 2 h, ahora + 24 h]; 2 h = (ahora, ahora + 2 h].
  // Una cita que ya está dentro de las 2 h nunca recibe el de 24 h: llegaría
  // casi junto con el de 2 h y el paciente vería dos avisos seguidos.
  const lowerBound = kind === '24h' ? new Date(now.getTime() + 2 * HOUR_MS) : now;
  const upperBound = new Date(now.getTime() + (kind === '24h' ? 24 : 2) * HOUR_MS);

  return db.appointment.findMany({
    where: {
      startTime: { gt: lowerBound, lte: upperBound },
      status: { notIn: NON_REMINDABLE_STATUSES },
      ...(kind === '24h' ? { reminderSent24h: false } : { reminderSent2h: false }),
      // Sin teléfono no hay a quién escribir; se filtra aquí para que esas
      // citas no ocupen lugar en cada lote.
      patient: { phoneE164: { startsWith: '+' } },
      tenant: { isActive: true },
      // Paginación por cursor (startTime, id): las citas que se saltan (clínica
      // suspendida, chat en modo humano) no tapan a las siguientes.
      ...(cursor
        ? {
            OR: [
              { startTime: { gt: cursor.startTime } },
              { startTime: cursor.startTime, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    take: BATCH_LIMIT,
    select: {
      id: true,
      tenantId: true,
      patientId: true,
      startTime: true,
      createdAt: true,
      paymentStatus: true,
      depositPaymentUrl: true,
      patient: { select: { fullName: true, phoneE164: true } },
      doctor: { select: { name: true, specialty: true } },
      service: { select: { name: true } },
      tenant: {
        select: {
          name: true,
          address: true,
          timezone: true,
          isActive: true,
          planSlug: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
        },
      },
    },
  });
}

type ClaimOutcome = 'ENQUEUED' | 'ALREADY_CLAIMED' | 'HUMAN_TAKEOVER';

function maxAttempts(): number {
  const parsed = Number(process.env.JOBS_MAX_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

/**
 * Reclama la cita y encola el recordatorio de forma atómica.
 * Si otra instancia (o un barrido anterior) ya la reclamó, no hace nada.
 */
async function claimAndEnqueue(
  appointment: ReminderAppointment,
  kind: ReminderKind,
  phoneNumberId: string | undefined,
  now: Date
): Promise<ClaimOutcome> {
  const flag = kind === '24h' ? 'reminderSent24h' : 'reminderSent2h';
  const text = buildReminderText(appointment, kind);
  const dedupeKey = `reminder-${kind}:${appointment.id}:${appointment.startTime.toISOString()}`;

  return db.$transaction(async (tx) => {
    // Si el paciente ya tiene chat de WhatsApp, el recordatorio queda en la
    // bandeja: recepción ve qué se le envió y el agente tiene el contexto
    // cuando el paciente conteste "confirmo" o "reagendar".
    const conversation = await tx.conversation.findFirst({
      where: { tenantId: appointment.tenantId, patientId: appointment.patientId, channel: 'WHATSAPP' },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, isHandedOverToHuman: true },
    });

    // Con takeover activo el personal lleva la conversación y nada automático
    // debe escribirle al paciente (CLAUDE.md § 1.5). No se marca la bandera:
    // si recepción devuelve el chat a la IA a tiempo, el recordatorio aún sale.
    if (conversation?.isHandedOverToHuman) return 'HUMAN_TAKEOVER';

    const claim = await tx.appointment.updateMany({
      where: {
        id: appointment.id,
        tenantId: appointment.tenantId,
        [flag]: false,
        // Se revalida dentro del candado: la cita pudo cancelarse o moverse
        // entre la consulta del barrido y este punto.
        status: { notIn: NON_REMINDABLE_STATUSES },
        startTime: appointment.startTime,
      },
      data: { [flag]: true },
    });
    if (claim.count === 0) return 'ALREADY_CLAIMED';

    // Un trabajo previo con la misma clave solo existe si alguien reinició la
    // bandera sin mover la cita. Si sigue vivo, ya se encargará de enviar; si
    // quedó DEAD, se reemplaza (mismo criterio que `JobQueue.enqueue`) para no
    // abortar la transacción con un P2002 en cada barrido.
    const previous = await tx.job.findUnique({ where: { dedupeKey }, select: { id: true, status: true } });
    if (previous && previous.status !== 'DEAD') return 'ENQUEUED';
    if (previous) await tx.job.delete({ where: { id: previous.id } });

    let messageId: string | undefined;
    if (conversation) {
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          tenantId: appointment.tenantId,
          direction: 'OUTBOUND',
          senderRole: 'SYSTEM',
          content: text,
          channel: 'WHATSAPP',
          deliveryStatus: 'PENDING',
        },
        select: { id: true },
      });
      messageId = message.id;
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now },
      });
    }

    const payload: WhatsAppSendPayload = {
      kind: 'TEXT',
      toPhoneE164: appointment.patient.phoneE164,
      text,
      phoneNumberId,
      messageId,
      // Mismos ids que la confirmación de cita: el webhook y el agente ya
      // saben interpretar estas respuestas de botón.
      interactiveButtons: [
        { id: `confirm_${appointment.id}`, title: 'Confirmar Asistencia' },
        { id: `reschedule_${appointment.id}`, title: 'Reagendar Cita' },
      ],
    };

    await tx.job.create({
      data: {
        type: 'WHATSAPP_SEND',
        tenantId: appointment.tenantId,
        // El horario forma parte de la clave: al reagendar, el PATCH de citas
        // reinicia las banderas y el nuevo recordatorio no choca con el anterior.
        dedupeKey,
        payload: JSON.stringify(payload),
        maxAttempts: maxAttempts(),
        runAt: now,
      },
    });

    await recordAudit(
      {
        tenantId: appointment.tenantId,
        actor: { type: 'SYSTEM', id: 'reminder-sweeper' },
        action: 'UPDATE',
        entityType: 'APPOINTMENT',
        entityId: appointment.id,
        patientId: appointment.patientId,
        changes: { [flag]: { before: false, after: true } },
        metadata: { reason: `Recordatorio de ${kind} encolado por WhatsApp`, messageId: messageId ?? null },
      },
      tx
    );

    return 'ENQUEUED';
  });
}

/**
 * Una cita agendada cuando ya estaba dentro de la ventana no recibe ese
 * recordatorio: la confirmación de la reserva acaba de salir con los mismos
 * datos y botones, y un "recordatorio" minutos después sería ruido.
 */
function bookedBeforeWindow(appointment: ReminderAppointment, kind: ReminderKind): boolean {
  const windowMs = (kind === '24h' ? 24 : 2) * HOUR_MS;
  return appointment.createdAt.getTime() <= appointment.startTime.getTime() - windowMs;
}

/**
 * Un barrido completo. Exportado para pruebas y para dispararlo a mano; recibe
 * `now` para que las pruebas no dependan del reloj.
 */
export async function runReminderSweep(now: Date = new Date()): Promise<ReminderSweepResult> {
  const result: ReminderSweepResult = { sent24h: 0, sent2h: 0, skipped: 0 };
  const senderCache = new Map<string, string | undefined | null>();
  const suspendedCache = new Map<string, boolean>();

  const processAppointment = async (appointment: ReminderAppointment, kind: ReminderKind) => {
    if (!bookedBeforeWindow(appointment, kind)) {
      result.skipped++;
      return;
    }

    if (!suspendedCache.has(appointment.tenantId)) {
      suspendedCache.set(appointment.tenantId, resolveTenantPlan(appointment.tenant, now).isSuspended);
    }
    // Clínica con prueba vencida o suscripción caída: el servicio está en
    // solo lectura y no debe seguir enviando mensajes en su nombre.
    if (suspendedCache.get(appointment.tenantId)) {
      result.skipped++;
      return;
    }

    if (!senderCache.has(appointment.tenantId)) {
      senderCache.set(appointment.tenantId, await resolveTenantSender(appointment.tenantId));
    }
    const sender = senderCache.get(appointment.tenantId);
    if (sender === null) {
      result.skipped++;
      return;
    }

    const outcome = await claimAndEnqueue(appointment, kind, sender, now);
    if (outcome !== 'ENQUEUED') {
      result.skipped++;
      return;
    }
    if (kind === '24h') result.sent24h++;
    else result.sent2h++;
    incrementCounter('appointment_reminders_enqueued_total', { kind });
  };

  // Primero el de 2 h: es el más urgente si el barrido llega al tope.
  for (const kind of ['2h', '24h'] as const) {
    let cursor: { startTime: Date; id: string } | undefined;
    let reviewed = 0;

    while (reviewed < MAX_PER_SWEEP) {
      const due = await findDueAppointments(kind, now, cursor);
      if (due.length === 0) break;

      for (const appointment of due) {
        try {
          await processAppointment(appointment, kind);
        } catch (error) {
          // Una cita (o una clínica) problemática no debe frenar el resto del
          // barrido; la transacción se revirtió y se reintenta en el siguiente.
          logger.error('No se pudo encolar el recordatorio de cita', error, {
            appointmentId: appointment.id,
            tenantId: appointment.tenantId,
            kind,
          });
        }
      }

      reviewed += due.length;
      const last = due[due.length - 1];
      cursor = { startTime: last.startTime, id: last.id };
      if (due.length < BATCH_LIMIT) break;
    }
  }

  if (result.sent24h + result.sent2h > 0) {
    logger.info('Recordatorios de cita encolados', { ...result });
  }
  return result;
}

let sweepTimer: NodeJS.Timeout | null = null;
let inFlight: Promise<unknown> = Promise.resolve();
let stopped = true;

function sweepIntervalMs(): number {
  const parsed = Number(process.env.REMINDER_SWEEP_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SWEEP_INTERVAL_MS;
}

/** True salvo `REMINDERS_ENABLED=false` o durante pruebas (`NODE_ENV=test`). */
export function remindersEnabled(): boolean {
  if (process.env.REMINDERS_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

/**
 * Arranca el barrido periódico. Se encadena con `setTimeout` (no
 * `setInterval`) para que un barrido lento nunca se traslape con el siguiente.
 */
export function startReminderSweeper(): void {
  if (!stopped) return;
  stopped = false;
  const intervalMs = sweepIntervalMs();

  const tick = () => {
    if (stopped) return;
    inFlight = runReminderSweep()
      .catch((error) => logger.error('Falló el barrido de recordatorios', error))
      .finally(() => {
        if (!stopped) sweepTimer = setTimeout(tick, intervalMs);
      });
  };

  tick();
  logger.info('Barrido de recordatorios de cita activo', { intervalMs });
}

/** Detiene el barrido y espera a que termine el que esté en curso. */
export async function stopReminderSweeper(): Promise<void> {
  stopped = true;
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  await inFlight;
}
