import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, recordAudit } from '@asistente/database';
import { maskPhone } from '@asistente/observability';
import { actorFromRequest } from '../../lib/audit.js';
import { HttpError, parseLimit, requireEnum, requireString } from '../../lib/http.js';
import { requirePlatformAdmin } from './common.js';
import { maskJobText, requeueDeadJob, type JobType } from '../../services/queue/queue.js';

/**
 * Visibilidad y reintento manual de trabajos muertos (DEAD) de la cola.
 *
 * Un trabajo agota sus reintentos en silencio: un META_INBOUND_MESSAGE muerto
 * es un paciente que escribió y nunca recibió respuesta. Estas rutas permiten
 * verlos y devolverlos a la cola tras corregir la causa (credenciales de Meta,
 * proveedor caído, etc.).
 *
 * Son transversales a todas las clínicas, así que solo las usa un
 * administrador de plataforma, y en modo estricto: la lista
 * PLATFORM_ADMIN_EMAILS es obligatoria en todo entorno; sin ella, el ADMIN de
 * una clínica vería trabajos de las demás.
 */

const JOB_TYPES: readonly JobType[] = ['META_INBOUND_MESSAGE', 'WHATSAPP_SEND', 'VOICE_POST_CALL_FOLLOWUP'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Llaves del payload que son identificadores internos (no PII) y ayudan a
 * ubicar el caso en el panel. Todo lo demás (texto del paciente, teléfonos,
 * botones) se omite: el payload crudo nunca sale al cliente.
 */
const SAFE_PAYLOAD_KEYS = [
  'kind',
  'channel',
  'conversationId',
  'patientId',
  'inboundMessageId',
  'messageId',
  'appointmentId',
  'callSid',
] as const;

function requireQueueAdmin(request: FastifyRequest): void {
  requirePlatformAdmin(request, {
    strict: true,
    deniedMessage: 'Solo un administrador de plataforma puede gestionar la cola de trabajos',
  });
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Resumen del payload apto para el panel: identificadores y teléfono enmascarado. */
export function summarizeJobPayload(raw: string): Record<string, string> {
  const payload = parsePayload(raw);
  const refs: Record<string, string> = {};
  for (const key of SAFE_PAYLOAD_KEYS) {
    const value = payload[key];
    if (typeof value === 'string' && value) refs[key] = value.slice(0, 100);
  }
  if (typeof payload.toPhoneE164 === 'string' && payload.toPhoneE164) {
    refs.toPhoneMasked = maskPhone(payload.toPhoneE164);
  }
  return refs;
}

export async function queueRoutes(fastify: FastifyInstance) {
  /**
   * Lista trabajos DEAD, del más reciente al más antiguo (por creación), con
   * paginación por cursor (`nextCursor`). Filtros opcionales: `type` y
   * `tenantId`. Se ordena por `createdAt` y no por `updatedAt` porque este
   * cambia al reintentar: el cursor saltaría al inicio y repetiría páginas.
   */
  fastify.get('/api/admin/queue/dead', async (request: FastifyRequest, reply: FastifyReply) => {
    requireQueueAdmin(request);

    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const limit = parseLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const where: Record<string, unknown> = { status: 'DEAD' };
    if (query.type) where.type = requireEnum(query.type, JOB_TYPES, 'type');
    if (query.tenantId) where.tenantId = requireString(query.tenantId, 'tenantId', 100);
    const cursor = query.cursor ? requireString(query.cursor, 'cursor', 100) : undefined;

    const [rows, total] = await Promise.all([
      db.job.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          type: true,
          tenantId: true,
          payload: true,
          attempts: true,
          maxAttempts: true,
          lastError: true,
          runAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.job.count({ where }),
    ]);

    const page = rows.slice(0, limit);
    const tenantIds = [...new Set(page.map((row) => row.tenantId).filter((id): id is string => Boolean(id)))];
    const tenants = tenantIds.length
      ? await db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
      : [];
    const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

    return reply.send({
      items: page.map((row) => ({
        id: row.id,
        type: row.type,
        tenantId: row.tenantId,
        tenantName: row.tenantId ? (tenantNames.get(row.tenantId) ?? null) : null,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        lastError: maskJobText(row.lastError, 300),
        refs: summarizeJobPayload(row.payload),
        runAt: row.runAt,
        createdAt: row.createdAt,
        deadAt: row.updatedAt,
      })),
      total,
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    });
  });

  /**
   * Devuelve un trabajo DEAD a la cola (PENDING, intentos en cero, ya).
   * Auditado en la clínica dueña del trabajo: un humano decidió volver a
   * procesar datos de uno de sus pacientes.
   */
  fastify.post('/api/admin/queue/:id/retry', async (request: FastifyRequest, reply: FastifyReply) => {
    requireQueueAdmin(request);
    const { id } = request.params as { id: string };
    const jobId = requireString(id, 'id', 100);

    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { id: true, type: true, tenantId: true, status: true, attempts: true, payload: true },
    });
    if (!job) throw new HttpError(404, 'Trabajo no encontrado');
    if (job.status !== 'DEAD') throw new HttpError(409, 'El trabajo ya no está en estado DEAD');

    const refs = summarizeJobPayload(job.payload);

    // Regla de takeover (CLAUDE.md § 1.5): si recepción tomó el control después
    // de que muriera una respuesta de la IA, reenviarla ahora metería a la IA
    // en una conversación que debe estar silenciada. Los mensajes del personal
    // sí pueden reintentarse: son suyos.
    if (job.type === 'WHATSAPP_SEND' && refs.messageId && job.tenantId) {
      const message = await db.message.findFirst({
        where: { id: refs.messageId, tenantId: job.tenantId },
        select: { senderRole: true, conversation: { select: { isHandedOverToHuman: true } } },
      });
      if (message?.senderRole === 'AI_AGENT' && message.conversation.isHandedOverToHuman) {
        throw new HttpError(
          409,
          'La conversación está en modo humano: no se reenvía una respuesta de la IA'
        );
      }
    }

    const requeued = await db.$transaction(async (tx) => {
      const ok = await requeueDeadJob(tx, job.id);
      if (!ok) return false;

      await recordAudit(
        {
          tenantId: job.tenantId,
          actor: actorFromRequest(request),
          action: 'UPDATE',
          entityType: 'JOB',
          entityId: job.id,
          patientId: refs.patientId ?? null,
          changes: {
            status: { before: 'DEAD', after: 'PENDING' },
            attempts: { before: job.attempts, after: 0 },
          },
          metadata: { type: job.type, reason: 'MANUAL_RETRY' },
        },
        tx
      );
      return true;
    });

    // Otro administrador lo reintentó entre la lectura y el compare-and-swap.
    if (!requeued) throw new HttpError(409, 'El trabajo ya no está en estado DEAD');

    return reply.send({ id: job.id, type: job.type, tenantId: job.tenantId, status: 'PENDING' });
  });
}
