import { db, diffChanges, recordAudit, type Appointment, type Prisma } from '@asistente/database';
import { createLogger } from '@asistente/observability';
import { jobQueue, type WhatsAppSendPayload } from '../queue/handlers.js';
import { DEPOSITS_SYSTEM_ACTOR } from './depositLink.js';
import { depositReminderDueAt } from './depositPolicy.js';
import type { DepositNoticeKind } from './depositMessages.js';

const logger = createLogger('api:deposits');

interface DepositNoticeParams {
  notice: DepositNoticeKind;
  appointmentId: string;
  tenantId: string;
}

function noticeJob(params: DepositNoticeParams) {
  return {
    type: 'WHATSAPP_SEND' as const,
    tenantId: params.tenantId,
    dedupeKey: `wa-deposit-${params.notice.toLowerCase()}:${params.appointmentId}`,
    payload: {
      kind: 'DEPOSIT_NOTICE',
      notice: params.notice,
      appointmentId: params.appointmentId,
      tenantId: params.tenantId,
    } satisfies WhatsAppSendPayload,
  };
}

/**
 * Encola un aviso de anticipo al paciente por la cola durable.
 *
 * La `dedupeKey` por cita y tipo de aviso hace que cada aviso salga una sola
 * vez aunque se encole varias veces (notificaciones duplicadas de Mercado
 * Pago, reintentos del webhook).
 */
export async function enqueueDepositNotice(params: DepositNoticeParams): Promise<string | null> {
  return jobQueue.enqueue(noticeJob(params));
}

/**
 * Inserta el aviso en la tabla de la cola dentro de la misma transacción que
 * el cambio de la cita (patrón outbox). Si se encolara después del COMMIT y
 * eso fallara, el aviso se perdería: la cita ya cancelada o ya recordada no
 * vuelve a entrar al barrido. `upsert` sobre la dedupeKey evita que un aviso
 * previo haga fallar la transacción.
 */
async function enqueueDepositNoticeTx(tx: Prisma.TransactionClient, params: DepositNoticeParams) {
  const job = noticeJob(params);
  await tx.job.upsert({
    where: { dedupeKey: job.dedupeKey },
    create: {
      type: job.type,
      tenantId: job.tenantId,
      dedupeKey: job.dedupeKey,
      payload: JSON.stringify(job.payload),
    },
    update: {},
  });
}

export interface DepositSweepResult {
  reminded: number;
  released: number;
}

const PAGE_SIZE = 100;

/** Estados en los que la cita ya no ocupa el horario. */
const INACTIVE_STATUSES = ['CANCELLED', 'COMPLETED', 'NO_SHOW'];

/**
 * Recorre por páginas (cursor por id) todas las citas que cumplen `where`.
 * Paginar en vez de tomar "las primeras N" evita que filas que fallan o que
 * aún no tocan bloqueen para siempre a las que vienen detrás.
 */
async function* paginate(where: Prisma.AppointmentWhereInput): AsyncGenerator<Appointment> {
  let cursor: string | undefined;
  for (;;) {
    const page = await db.appointment.findMany({
      where,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    yield* page;
    if (page.length < PAGE_SIZE) return;
    cursor = page[page.length - 1].id;
  }
}

/** Libera (cancela) una cita con anticipo vencido. Devuelve si esta llamada la liberó. */
async function releaseExpired(appointment: Appointment, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    // Condicional: si el pago se acreditó o recepción tocó la cita entre la
    // consulta y este UPDATE, no se cancela.
    const update = await tx.appointment.updateMany({
      where: {
        id: appointment.id,
        tenantId: appointment.tenantId,
        paymentStatus: 'DEPOSIT_PENDING',
        status: { notIn: INACTIVE_STATUSES },
        depositDeadlineAt: { lte: now },
      },
      data: {
        status: 'CANCELLED',
        // Igual que la cancelación manual: sin slotKey el horario queda libre.
        slotKey: null,
        notes: (
          (appointment.notes || '') +
          ' | Horario liberado automáticamente: el anticipo no se pagó a tiempo (No-Show Shield)'
        ).trim(),
      },
    });
    if (update.count === 0) return false;

    await recordAudit(
      {
        tenantId: appointment.tenantId,
        actor: DEPOSITS_SYSTEM_ACTOR,
        action: 'UPDATE',
        entityType: 'APPOINTMENT',
        entityId: appointment.id,
        patientId: appointment.patientId,
        changes: diffChanges(appointment, { status: 'CANCELLED' }),
        metadata: {
          event: 'DEPOSIT_EXPIRED',
          depositDeadlineAt: appointment.depositDeadlineAt?.toISOString() ?? null,
        },
      },
      tx
    );
    await enqueueDepositNoticeTx(tx, {
      notice: 'EXPIRED',
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
    });
    return true;
  });
}

/** Marca y encola el único recordatorio. Devuelve si esta llamada lo marcó. */
async function remind(appointment: Appointment, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const update = await tx.appointment.updateMany({
      where: {
        id: appointment.id,
        tenantId: appointment.tenantId,
        paymentStatus: 'DEPOSIT_PENDING',
        status: { notIn: INACTIVE_STATUSES },
        depositReminderSentAt: null,
        depositDeadlineAt: { gt: now },
      },
      data: { depositReminderSentAt: now },
    });
    if (update.count === 0) return false;

    await recordAudit(
      {
        tenantId: appointment.tenantId,
        actor: DEPOSITS_SYSTEM_ACTOR,
        action: 'UPDATE',
        entityType: 'APPOINTMENT',
        entityId: appointment.id,
        patientId: appointment.patientId,
        changes: { depositReminderSentAt: { before: null, after: now.toISOString() } },
        metadata: { event: 'DEPOSIT_REMINDER_SENT' },
      },
      tx
    );
    await enqueueDepositNoticeTx(tx, {
      notice: 'REMINDER',
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
    });
    return true;
  });
}

/** Una pasada del barrido para una sola clínica. */
async function sweepTenant(tenantId: string, now: Date, result: DepositSweepResult): Promise<void> {
  const base: Prisma.AppointmentWhereInput = {
    tenantId,
    paymentStatus: 'DEPOSIT_PENDING',
    status: { notIn: INACTIVE_STATUSES },
    startTime: { gt: now },
  };

  for await (const appointment of paginate({ ...base, depositDeadlineAt: { lte: now } })) {
    try {
      if (await releaseExpired(appointment, now)) result.released += 1;
    } catch (error) {
      logger.error('No se pudo liberar una cita con anticipo vencido', error, {
        appointmentId: appointment.id,
        tenantId,
      });
    }
  }

  for await (const appointment of paginate({
    ...base,
    depositDeadlineAt: { gt: now },
    depositReminderSentAt: null,
    depositPaymentUrl: { not: null },
  })) {
    if (!appointment.depositDeadlineAt) continue;
    if (depositReminderDueAt(appointment.createdAt, appointment.depositDeadlineAt) > now) continue;

    try {
      if (await remind(appointment, now)) result.reminded += 1;
    } catch (error) {
      logger.error('No se pudo recordar un anticipo pendiente', error, {
        appointmentId: appointment.id,
        tenantId,
      });
    }
  }
}

/**
 * Una pasada del barrido de anticipos:
 *   1. Libera (cancela) las citas cuyo límite de pago ya venció.
 *   2. Manda un único recordatorio a las que van a la mitad del plazo.
 *
 * Solo toca citas con `depositDeadlineAt`, es decir, las que recibieron el
 * link automáticamente. Las que agendó recepción a mano no tienen límite y
 * nunca se cancelan solas. Tampoco se tocan citas cuyo horario ya pasó: ahí
 * cancelar no libera nada útil y borraría el registro de lo que ocurrió.
 *
 * Se recorre clínica por clínica (toda consulta de citas filtra por
 * `tenantId`). Es seguro correrlo en varias instancias a la vez: cada cambio
 * es un UPDATE condicional, así que solo una instancia gana cada cita, y los
 * avisos van deduplicados en la cola.
 */
export async function sweepDeposits(
  options: { now?: Date; /** Solo para pruebas: limita la pasada a una clínica. */ tenantId?: string } = {}
): Promise<DepositSweepResult> {
  const now = options.now ?? new Date();
  const result: DepositSweepResult = { reminded: 0, released: 0 };

  const tenants = options.tenantId
    ? [{ id: options.tenantId }]
    : await db.tenant.findMany({ where: { isActive: true }, select: { id: true } });

  for (const tenant of tenants) {
    try {
      await sweepTenant(tenant.id, now, result);
    } catch (error) {
      logger.error('Falló el barrido de anticipos de una clínica', error, { tenantId: tenant.id });
    }
  }

  if (result.released > 0 || result.reminded > 0) {
    logger.info('Barrido de anticipos completado', { ...result });
  }
  return result;
}

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<unknown> = Promise.resolve();

/** Arranca el barrido periódico (`DEPOSIT_SWEEP_INTERVAL_MS`, por defecto 5 min). */
export function startDepositSweeper(): void {
  if (timer) return;
  const parsed = Number(process.env.DEPOSIT_SWEEP_INTERVAL_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000;

  let running = false;
  const tick = () => {
    if (running) return; // una pasada lenta no se encima con la siguiente
    running = true;
    inFlight = sweepDeposits()
      .catch((error) => logger.error('Falló el barrido de anticipos', error))
      .finally(() => {
        running = false;
      });
  };

  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
}

/** Detiene el barrido y espera a que termine la pasada en curso. */
export async function stopDepositSweeper(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  await inFlight;
}
