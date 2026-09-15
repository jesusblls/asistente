import { randomUUID } from 'node:crypto';
import { db } from '@asistente/database';
import { createLogger, incrementCounter, recordTiming, type Logger } from '@asistente/observability';

/**
 * Cola de trabajos durable respaldada por la tabla `Job` (SQLite/PostgreSQL).
 *
 * Motivo (hallazgo I3/I11 de la auditoría): los webhooks de Meta reintentan
 * cuando el handler tarda o falla, y el procesamiento del agente + envío a
 * WhatsApp puede tardar varios segundos. Procesarlo dentro del request provoca
 * respuestas duplicadas y citas duplicadas. Aquí:
 *
 *   1. El webhook valida la firma, persiste lo mínimo y **encola**.
 *   2. Responde 200 de inmediato (requisito de Meta).
 *   3. Un worker reclama el trabajo con compare-and-swap y lo ejecuta con
 *      reintentos y backoff exponencial.
 *   4. `dedupeKey` garantiza idempotencia (el mismo wamid no se procesa dos veces).
 *
 * El motor no sabe nada de Meta ni de WhatsApp: recibe un mapa de handlers
 * inyectable, lo que permite probarlo sin red.
 */

export type JobType = 'META_INBOUND_MESSAGE' | 'WHATSAPP_SEND' | 'VOICE_POST_CALL_FOLLOWUP';

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'DEAD';

export interface JobContext {
  jobId: string;
  tenantId?: string | null;
  attempt: number;
  maxAttempts: number;
  logger: Logger;
}

export type JobHandler<TPayload = unknown> = (
  payload: TPayload,
  context: JobContext
) => Promise<void>;

export type JobHandlerMap = Partial<Record<JobType, JobHandler<never>>>;

/**
 * Error que NO debe reintentarse: el payload ya no es válido (la entidad
 * referenciada se borró, un id no existe, un dato es imposible). Reintentarlo
 * solo genera ruido y quema los intentos disponibles.
 */
export class PermanentJobError extends Error {
  readonly permanent = true;

  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export interface EnqueueJobInput {
  type: JobType;
  payload: unknown;
  tenantId?: string | null;
  /** Si dos trabajos comparten dedupeKey, solo se ejecuta el primero. */
  dedupeKey?: string | null;
  maxAttempts?: number;
  /** Retrasa la primera ejecución (útil para backoff desde el emisor). */
  delayMs?: number;
}

export interface JobQueueOptions {
  handlers: JobHandlerMap;
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Intentos por defecto al encolar sin `maxAttempts` explícito. */
  maxAttemptsDefault?: number;
  /** Un job RUNNING más antiguo que esto se considera abandonado y se reencola. */
  staleLockMs?: number;
  logger?: Logger;
  now?: () => Date;
  random?: () => number;
  /**
   * Se invoca cuando un trabajo queda descartado definitivamente (DEAD), ya sea
   * por agotar reintentos o por un error permanente. Sirve para cerrar el estado
   * de negocio asociado (p. ej. marcar el mensaje de WhatsApp como FAILED).
   */
  onDeadLetter?: (job: DeadLetterInfo, reason: string) => Promise<void> | void;
}

interface ClaimedJob {
  id: string;
  tenantId: string | null;
  type: string;
  payload: string;
  attempts: number;
  maxAttempts: number;
}

export interface DeadLetterInfo {
  id: string;
  type: string;
  tenantId: string | null;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export class JobQueue {
  private readonly handlers: JobHandlerMap;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxAttemptsDefault: number;
  private readonly staleLockMs: number;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly onDeadLetter?: (job: DeadLetterInfo, reason: string) => Promise<void> | void;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<unknown> = Promise.resolve();
  private stopped = true;

  constructor(options: JobQueueOptions) {
    this.handlers = options.handlers;
    this.workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 5;
    this.baseBackoffMs = options.baseBackoffMs ?? 2000;
    this.maxBackoffMs = options.maxBackoffMs ?? 5 * 60 * 1000;
    this.maxAttemptsDefault = options.maxAttemptsDefault ?? 5;
    this.staleLockMs = options.staleLockMs ?? 2 * 60 * 1000;
    this.logger = options.logger ?? createLogger('api:queue');
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.onDeadLetter = options.onDeadLetter;
  }

  /**
   * Encola un trabajo. Devuelve el id creado o `null` si `dedupeKey` ya existía
   * (trabajo repetido: Meta reintentando el mismo mensaje, doble clic, etc.).
   */
  async enqueue(input: EnqueueJobInput): Promise<string | null> {
    const runAt = new Date(this.now().getTime() + (input.delayMs ?? 0));

    // Camino rápido de idempotencia: si ya existe un trabajo activo con la misma
    // clave, se evita incluso el INSERT (y el ruido de un P2002 en los logs).
    if (input.dedupeKey) {
      const existing = await db.job.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: { id: true, status: true },
      });
      if (existing && existing.status !== 'DEAD') {
        incrementCounter('queue_jobs_deduplicated_total', { type: input.type });
        return null;
      }
    }

    try {
      const job = await db.job.create({
        data: {
          type: input.type,
          payload: JSON.stringify(input.payload ?? {}),
          tenantId: input.tenantId ?? null,
          dedupeKey: input.dedupeKey ?? null,
          maxAttempts: input.maxAttempts ?? this.maxAttemptsDefault,
          runAt,
        },
        select: { id: true },
      });

      incrementCounter('queue_jobs_enqueued_total', { type: input.type });
      this.logger.debug('Trabajo encolado', { jobId: job.id, type: input.type });
      return job.id;
    } catch (error) {
      // P2002 = violación de índice único => ya existe un job con esa clave.
      if ((error as { code?: string }).code === 'P2002') {
        incrementCounter('queue_jobs_deduplicated_total', { type: input.type });
        this.logger.debug('Trabajo duplicado descartado por dedupeKey', {
          type: input.type,
          dedupeKey: input.dedupeKey,
        });
        return null;
      }
      throw error;
    }
  }

  /**
   * Reclama atómicamente hasta `batchSize` trabajos listos para ejecutar.
   * El `updateMany` condicionado por `status` + `lockedAt` actúa como
   * compare-and-swap: si otro worker ganó la carrera, `count` es 0 y se ignora.
   */
  private async claim(): Promise<ClaimedJob[]> {
    const now = this.now();

    const candidates = await db.job.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        runAt: { lte: now },
      },
      orderBy: { runAt: 'asc' },
      take: this.batchSize,
      select: { id: true, status: true },
    });

    const claimed: ClaimedJob[] = [];

    for (const candidate of candidates) {
      const result = await db.job.updateMany({
        where: { id: candidate.id, status: candidate.status, lockedAt: null },
        data: {
          status: 'RUNNING',
          lockedAt: now,
          lockedBy: this.workerId,
          attempts: { increment: 1 },
        },
      });

      if (result.count !== 1) continue;

      const job = await db.job.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          tenantId: true,
          type: true,
          payload: true,
          attempts: true,
          maxAttempts: true,
        },
      });

      if (job) claimed.push(job);
    }

    return claimed;
  }

  /** Procesa un lote de trabajos. Devuelve cuántos se ejecutaron (con éxito o no). */
  async runOnce(): Promise<number> {
    const jobs = await this.claim();
    if (jobs.length === 0) return 0;

    for (const job of jobs) {
      await this.executeJob(job);
    }

    return jobs.length;
  }

  private async executeJob(job: ClaimedJob): Promise<void> {
    const handler = this.handlers[job.type as JobType];
    const context: JobContext = {
      jobId: job.id,
      tenantId: job.tenantId,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      logger: this.logger.child({ component: job.type, jobId: job.id }),
    };

    if (!handler) {
      await this.markDead(job, `Sin handler registrado para el tipo ${job.type}`);
      incrementCounter('queue_jobs_failed_total', { type: job.type, reason: 'no_handler' });
      return;
    }

    const startedAt = process.hrtime.bigint();

    try {
      await (handler as JobHandler<unknown>)(parsePayload(job.payload), context);
      await db.job.update({
        where: { id: job.id },
        data: {
          status: 'DONE',
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      incrementCounter('queue_jobs_processed_total', { type: job.type, outcome: 'done' });
      context.logger.debug('Trabajo completado', { attempt: job.attempts });
    } catch (error) {
      await this.scheduleRetry(job, error);
    } finally {
      recordTiming(
        'queue_job_duration_ms',
        Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        { type: job.type }
      );
    }
  }

  private async scheduleRetry(job: ClaimedJob, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof PermanentJobError) {
      await this.markDead(job, message);
      incrementCounter('queue_jobs_failed_total', { type: job.type, reason: 'permanent' });
      this.logger.warn('Trabajo descartado por error permanente (no reintentable)', {
        jobId: job.id,
        type: job.type,
        reason: message.slice(0, 200),
      });
      return;
    }

    if (job.attempts >= job.maxAttempts) {
      await this.markDead(job, message);
      incrementCounter('queue_jobs_failed_total', { type: job.type, reason: 'max_attempts' });
      this.logger.error('Trabajo agotó sus reintentos', error, {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
      });
      return;
    }

    // Backoff exponencial con jitter para evitar tormentas de reintentos.
    const exponential = this.baseBackoffMs * 2 ** (job.attempts - 1);
    const jitter = 0.5 + this.random() * 0.5;
    const delay = Math.min(exponential * jitter, this.maxBackoffMs);

    await db.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        runAt: new Date(this.now().getTime() + delay),
        lockedAt: null,
        lockedBy: null,
        lastError: message.slice(0, 1000),
      },
    });

    incrementCounter('queue_jobs_retried_total', { type: job.type });
    this.logger.warn('Trabajo falló; se reintentará', {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      retryInMs: Math.round(delay),
      reason: message.slice(0, 200),
    });
  }

  private async markDead(job: ClaimedJob, reason: string): Promise<void> {
    await db.job.update({
      where: { id: job.id },
      data: {
        status: 'DEAD',
        lockedAt: null,
        lockedBy: null,
        lastError: reason.slice(0, 1000),
      },
    });

    if (!this.onDeadLetter) return;

    try {
      await this.onDeadLetter(
        {
          id: job.id,
          type: job.type,
          tenantId: job.tenantId,
          payload: parsePayload(job.payload),
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
        },
        reason
      );
    } catch (error) {
      // Un fallo del gancho no debe ocultar el descarte original.
      this.logger.error('El gancho de descarte (dead letter) falló', error, {
        jobId: job.id,
        type: job.type,
      });
    }
  }

  /**
   * Libera trabajos que quedaron en RUNNING porque el proceso murió a mitad de
   * la ejecución (deploy, OOM, kill -9). Sin esto quedarían atorados para siempre.
   */
  async recoverStaleJobs(): Promise<number> {
    const threshold = new Date(this.now().getTime() - this.staleLockMs);
    const result = await db.job.updateMany({
      where: { status: 'RUNNING', lockedAt: { lt: threshold } },
      data: {
        status: 'FAILED',
        lockedAt: null,
        lockedBy: null,
        lastError: 'Trabajo abandonado: el worker anterior no terminó (recuperado al arrancar)',
      },
    });

    if (result.count > 0) {
      incrementCounter('queue_jobs_recovered_total', {}, result.count);
      this.logger.warn('Se recuperaron trabajos abandonados', { count: result.count });
    }

    return result.count;
  }

  /** Arranca el bucle de polling. Idempotente: llamarlo dos veces no duplica timers. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;

    void this.recoverStaleJobs().catch((error) => {
      this.logger.error('No se pudieron recuperar trabajos abandonados', error);
    });

    this.timer = setInterval(() => {
      if (this.running) return; // evita solapamiento si un lote tarda más que el intervalo
      this.running = true;
      this.inFlight = this.runOnce()
        .catch((error) => {
          this.logger.error('Error inesperado en el bucle de la cola', error);
        })
        .finally(() => {
          this.running = false;
        });
    }, this.pollIntervalMs);

    // No mantiene vivo el proceso solo por el timer.
    this.timer.unref?.();
    this.logger.info('Worker de cola iniciado', {
      workerId: this.workerId,
      pollIntervalMs: this.pollIntervalMs,
    });
  }

  /** Detiene el worker y espera a que termine el lote en curso. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inFlight;
    this.logger.info('Worker de cola detenido', { workerId: this.workerId });
  }

  /**
   * Procesa toda la cola pendiente. Se usa en pruebas y en apagados ordenados.
   * `maxIterations` evita un bucle infinito si un handler reencola sin parar.
   */
  async drain(maxIterations = 100): Promise<number> {
    let processed = 0;
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const batch = await this.runOnce();
      if (batch === 0) break;
      processed += batch;
    }
    return processed;
  }

  async stats(): Promise<Record<string, number>> {
    const rows = await db.job.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const result: Record<string, number> = {};
    for (const status of ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD'] as JobStatus[]) {
      result[status] = 0;
    }
    for (const row of rows) {
      result[row.status] = row._count._all;
    }
    return result;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  get id(): string {
    return this.workerId;
  }
}
