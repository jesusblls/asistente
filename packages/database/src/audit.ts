import type { Prisma } from '@prisma/client';
import { Redis } from 'ioredis';
import { createLogger } from '@asistente/observability';
import { db } from './client.js';

const logger = createLogger('audit');

/**
 * Bitácora de auditoría de accesos y cambios a datos clínicos.
 *
 * Responde "quién vio o modificó qué expediente, cuándo y desde dónde", que es
 * lo que exigen la LFPDPPP y la NOM-024-SSA3 para sistemas de información en
 * salud. La tabla es de solo inserción: triggers de base de datos impiden
 * modificar filas y borrar las que tengan menos de 5 años.
 */

export const AUDIT_ACTOR_TYPES = ['USER', 'AI_AGENT', 'WEBHOOK', 'SYSTEM', 'ANONYMOUS'] as const;
export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'READ',
  'LIST',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXPORT',
] as const;
export const AUDIT_ENTITY_TYPES = [
  'SESSION',
  'TENANT',
  'DOCTOR',
  'SERVICE',
  'PATIENT',
  'APPOINTMENT',
  'CONVERSATION',
  'MESSAGE',
  'AUDIT_LOG',
  'FAQ_ITEM',
] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type AuditChanges = Record<string, { before: unknown; after: unknown }>;

export interface AuditActor {
  type: AuditActorType;
  id?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditEntry {
  /** `null` solo cuando no se puede atribuir a una clínica (login con correo inexistente). */
  tenantId: string | null;
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  /** Paciente cuyo expediente se tocó: permite responder "quién vio a este paciente". */
  patientId?: string | null;
  changes?: AuditChanges | null;
  metadata?: Record<string, unknown> | null;
}

/** Acepta el cliente global o el de una transacción, para auditar de forma atómica. */
type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

const MAX_USER_AGENT = 300;
const MAX_TRACKED_READS = 10_000;
const INTERNAL_FIELDS = new Set(['slotKey', 'updatedAt']);

/**
 * El panel consulta mensajes cada 2 s y citas cada 3.5 s. Registrar cada
 * refresco llenaría la tabla de ruido (~1800 filas por hora por chat abierto)
 * sin aportar nada: basta una fila por usuario y expediente dentro de la
 * ventana para saber quién accedió y cuándo. Solo aplica a READ y LIST; los
 * cambios se registran siempre.
 *
 * Con `REDIS_URL` configurada, la ventana se comparte entre todas las
 * instancias de la API vía `SET key val PX <ttl> NX` (atómico: dos instancias
 * nunca deciden "no está" para la misma clave a la vez). Sin `REDIS_URL` —
 * el caso por defecto en desarrollo y en una sola instancia — cae a este Map
 * en memoria del proceso, idéntico al comportamiento anterior.
 */
const recentReads = new Map<string, number>();
const REDIS_KEY_PREFIX = 'audit:read-throttle:';

function readThrottleMs(): number {
  const raw = process.env.AUDIT_READ_THROTTLE_MS;
  return raw ? Number(raw) : 10 * 60 * 1000;
}

function readThrottleKey(entry: AuditEntry): string | null {
  if (entry.action !== 'READ' && entry.action !== 'LIST') return null;
  if (!(readThrottleMs() > 0)) return null;
  return [
    entry.tenantId,
    entry.actor.type,
    entry.actor.id,
    entry.action,
    entry.entityType,
    entry.entityId,
  ].join('|');
}

// `undefined` = todavía no se intentó conectar; `null` = REDIS_URL no está
// configurada (o falló de forma irrecuperable), así que se usa el Map local.
let redisClient: Redis | null | undefined;
let redisIdleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Cuánto espera sin uso antes de cerrar la conexión a Redis. Un servidor de
 * API vivo la vuelve a abrir en la siguiente lectura (costo despreciable);
 * lo que importa es que un script de una sola corrida (una suite de pruebas,
 * un comando manual) que sí llegó a usar Redis no se quede colgado para
 * siempre con el socket abierto esperando que alguien lo cierre.
 */
const REDIS_IDLE_DISCONNECT_MS = 3_000;

function touchRedisIdleTimer(client: Redis): void {
  if (redisIdleTimer) clearTimeout(redisIdleTimer);
  redisIdleTimer = setTimeout(() => {
    redisIdleTimer = null;
    redisClient = undefined;
    client.quit().catch(() => client.disconnect());
  }, REDIS_IDLE_DISCONNECT_MS);
  redisIdleTimer.unref?.();
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }

  // `lazyConnect` evita abrir el socket hasta el primer uso real: los
  // scripts de una sola corrida (seed, create-admin, rotate-credentials) que
  // nunca llaman recordAudit() no se quedan colgados esperando una conexión
  // que no necesitan.
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  client.on('error', (error) => {
    logger.warn('Redis no disponible para el throttle de lecturas de auditoría', {
      error: error instanceof Error ? error.message : error,
    });
  });
  redisClient = client;
  return client;
}

function isThrottledInMemory(key: string, now: number): boolean {
  const last = recentReads.get(key);
  return last !== undefined && now - last < readThrottleMs();
}

function markReadInMemory(key: string, now: number): void {
  if (recentReads.size >= MAX_TRACKED_READS) {
    const windowMs = readThrottleMs();
    for (const [trackedKey, seenAt] of recentReads) {
      if (now - seenAt >= windowMs) recentReads.delete(trackedKey);
    }
    if (recentReads.size >= MAX_TRACKED_READS) recentReads.clear();
  }
  recentReads.set(key, now);
}

/**
 * `true` si la lectura debe registrarse (no hay una fila reciente para la
 * misma clave); `false` si debe omitirse. Si Redis está configurada pero
 * falla en el momento (red, servicio caído), se trata como "sí registrar":
 * es preferible una fila de más que un acceso real sin rastro.
 */
async function shouldRecordRead(key: string): Promise<boolean> {
  const client = getRedisClient();
  const now = Date.now();

  if (!client) {
    if (isThrottledInMemory(key, now)) return false;
    markReadInMemory(key, now);
    return true;
  }

  try {
    const result = await client.set(REDIS_KEY_PREFIX + key, '1', 'PX', readThrottleMs(), 'NX');
    return result === 'OK';
  } catch (error) {
    logger.warn('Fallo el throttle de auditoría vía Redis; se registra sin omitir', {
      error: error instanceof Error ? error.message : error,
    });
    return true;
  } finally {
    touchRedisIdleTimer(client);
  }
}

/**
 * Revierte la marca de "ya se registró" cuando la inserción que la motivó
 * falló: sin esto, un solo error transitorio de base de datos podría dejar
 * hasta `AUDIT_READ_THROTTLE_MS` sin auditar un acceso real. Es un mejor
 * esfuerzo (no se espera ni se propaga su error) porque la prioridad es que
 * el error original de la inserción llegue a quien llamó.
 */
function clearThrottle(key: string): void {
  const client = redisClient;
  if (client) {
    client.del(REDIS_KEY_PREFIX + key).catch(() => {});
    touchRedisIdleTimer(client);
  } else {
    recentReads.delete(key);
  }
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value === undefined ? null : value;
}

/**
 * Diferencia campo a campo entre el estado anterior y el nuevo. Solo se
 * consideran los campos presentes en `after`, que es lo que la operación
 * pretendía cambiar; los que quedaron igual no se registran.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): AuditChanges | null {
  const changes: AuditChanges = {};

  for (const [field, next] of Object.entries(after)) {
    if (next === undefined || INTERNAL_FIELDS.has(field)) continue;
    const previous = serialize(before[field]);
    const current = serialize(next);
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
      changes[field] = { before: previous, after: current };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Inserta una fila de auditoría. Pasa `tx` cuando el cambio auditado corre en
 * una transacción: así la fila y el cambio se confirman o se descartan juntos,
 * y nunca queda una modificación sin rastro.
 *
 * Si la inserción falla, el error se propaga a propósito (fail-closed): es
 * preferible rechazar la operación que dejar un acceso a datos clínicos sin
 * registrar.
 */
export async function recordAudit(entry: AuditEntry, writer: AuditWriter = db): Promise<void> {
  const throttleKey = readThrottleKey(entry);
  if (throttleKey && !(await shouldRecordRead(throttleKey))) return;

  try {
    await writer.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorType: entry.actor.type,
        actorId: entry.actor.id ?? null,
        actorEmail: entry.actor.email ?? null,
        actorRole: entry.actor.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        patientId: entry.patientId ?? null,
        changes: entry.changes ? JSON.stringify(entry.changes) : null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ipAddress: entry.actor.ipAddress ?? null,
        userAgent: entry.actor.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
        requestId: entry.actor.requestId ?? null,
      },
    });
  } catch (error) {
    if (throttleKey) clearThrottle(throttleKey);
    throw error;
  }
}
