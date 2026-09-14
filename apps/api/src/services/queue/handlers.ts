import { db } from '@asistente/database';
import { OmnichannelAgent } from '@asistente/ai-agent';
import { createLogger } from '@asistente/observability';
import { WhatsAppService } from '../whatsappService.js';
import { JobQueue, PermanentJobError, type JobContext, type JobHandlerMap } from './queue.js';

/**
 * Handlers concretos de la cola y la instancia compartida (`jobQueue`).
 *
 * El reparto es deliberado:
 *  - El webhook HTTP solo valida firma, deduplica y persiste el mensaje entrante.
 *  - El agente (Gemini + agenda) corre en la cola, con reintentos.
 *  - El envío a WhatsApp también es un trabajo: si Meta está caído, se reintenta
 *    sin perder el mensaje y sin bloquear la respuesta al webhook.
 */

export interface MetaInboundPayload {
  conversationId: string;
  patientId: string;
  tenantId: string;
  inboundMessageId: string;
  text: string;
  channel: string;
  phoneNumberId?: string;
}

export type WhatsAppSendPayload =
  | {
      kind: 'TEXT';
      toPhoneE164: string;
      text: string;
      phoneNumberId?: string;
      /** Si viene, se actualiza `Message.deliveryStatus` con el resultado. */
      messageId?: string;
      interactiveButtons?: { id: string; title: string }[];
    }
  | { kind: 'APPOINTMENT_CONFIRMATION'; appointmentId: string; tenantId: string };

export interface VoicePostCallPayload {
  tenantId: string;
  toPhoneE164: string;
  callSid?: string;
}

const logger = createLogger('api:queue:handlers');

const agent = new OmnichannelAgent();

/**
 * Procesa un mensaje entrante de Meta: historial -> agente -> respuesta.
 * Idempotencia: si la conversación ya tiene una respuesta posterior al mensaje
 * entrante (por ejemplo, un reintento tras un éxito parcial), no repite el turno.
 */
async function processMetaInbound(payload: MetaInboundPayload, context: JobContext): Promise<void> {
  const conversation = await db.conversation.findFirst({
    where: { id: payload.conversationId, tenantId: payload.tenantId },
    include: { patient: true },
  });

  if (!conversation) {
    throw new PermanentJobError(`Conversación ${payload.conversationId} no encontrada en la clínica`);
  }

  // Regla de negocio: con takeover humano activo la IA guarda silencio absoluto.
  if (conversation.isHandedOverToHuman) {
    context.logger.info('Conversación en modo humano: la IA no responde', {
      conversationId: conversation.id,
    });
    return;
  }

  const inbound = await db.message.findFirst({
    where: { id: payload.inboundMessageId, conversationId: conversation.id },
    select: { id: true, createdAt: true },
  });
  if (!inbound) {
    throw new PermanentJobError(`Mensaje entrante ${payload.inboundMessageId} no encontrado`);
  }

  // Reintento tras éxito parcial: ya existe una respuesta emitida después del entrante.
  const alreadyAnswered = await db.message.findFirst({
    where: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      createdAt: { gte: inbound.createdAt },
    },
    select: { id: true },
  });
  if (alreadyAnswered) {
    context.logger.info('El turno ya fue respondido; se omite el reintento', {
      conversationId: conversation.id,
    });
    return;
  }

  const recentMessages = await db.message.findMany({
    where: { conversationId: conversation.id, id: { not: inbound.id } },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { senderRole: true, content: true },
  });

  const conversationHistory = recentMessages.reverse().map((storedMessage) => ({
    role: (storedMessage.senderRole === 'PATIENT' ? 'user' : 'model') as 'user' | 'model',
    parts: [{ text: storedMessage.content }],
  }));

  const agentResponse = await agent.processMessage(
    payload.text,
    {
      tenantId: conversation.tenantId,
      patientPhone: conversation.patient.phoneE164,
      patientName: conversation.patient.fullName,
      channel: 'WHATSAPP',
      conversationId: conversation.id,
    },
    conversationHistory
  );

  const outboundMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      tenantId: conversation.tenantId,
      direction: 'OUTBOUND',
      senderRole: 'AI_AGENT',
      content: agentResponse.replyText,
      channel: 'WHATSAPP',
      deliveryStatus: 'PENDING',
    },
    select: { id: true },
  });

  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  await jobQueue.enqueue({
    type: 'WHATSAPP_SEND',
    tenantId: conversation.tenantId,
    dedupeKey: `wa:${outboundMessage.id}`,
    payload: {
      kind: 'TEXT',
      toPhoneE164: conversation.patient.phoneE164,
      text: agentResponse.replyText,
      phoneNumberId: payload.phoneNumberId,
      messageId: outboundMessage.id,
    } satisfies WhatsAppSendPayload,
  });

  if (agentResponse.appointmentBooked && typeof agentResponse.appointmentBooked === 'object') {
    const appointmentId = (agentResponse.appointmentBooked as { id?: string }).id;
    if (appointmentId) {
      await jobQueue.enqueue({
        type: 'WHATSAPP_SEND',
        tenantId: conversation.tenantId,
        dedupeKey: `wa-confirm:${appointmentId}`,
        payload: {
          kind: 'APPOINTMENT_CONFIRMATION',
          appointmentId,
          tenantId: conversation.tenantId,
        } satisfies WhatsAppSendPayload,
      });
    }
  }
}

async function processWhatsAppSend(payload: WhatsAppSendPayload, context: JobContext): Promise<void> {
  if (payload.kind === 'TEXT') {
    const delivered = await WhatsAppService.sendMessage({
      phoneNumberId: payload.phoneNumberId,
      toPhoneE164: payload.toPhoneE164,
      text: payload.text,
      interactiveButtons: payload.interactiveButtons,
    });

    if (!delivered) throw new Error('Meta no aceptó el mensaje de WhatsApp');

    if (payload.messageId) {
      await db.message.updateMany({
        where: { id: payload.messageId },
        data: { deliveryStatus: 'SENT' },
      });
    }
    return;
  }

  const appointment = await db.appointment.findFirst({
    where: { id: payload.appointmentId, tenantId: payload.tenantId },
    include: { patient: true, doctor: true, service: true, tenant: true },
  });

  if (!appointment) {
    throw new PermanentJobError(`Cita ${payload.appointmentId} no encontrada en la clínica`);
  }

  const delivered = await WhatsAppService.sendAppointmentConfirmation(appointment);
  if (!delivered) throw new Error('Meta no aceptó la confirmación de cita');

  context.logger.info('Confirmación de cita enviada', { appointmentId: appointment.id });
}

async function processVoiceFollowUp(payload: VoicePostCallPayload): Promise<void> {
  const tenant = await db.tenant.findFirst({ where: { id: payload.tenantId, isActive: true } });
  if (!tenant) {
    throw new PermanentJobError(
      `Clínica ${payload.tenantId} no encontrada para el seguimiento post-llamada`
    );
  }

  const delivered = await WhatsAppService.sendMessage({
    toPhoneE164: payload.toPhoneE164,
    text: `🦷 *${tenant.name}*\n\n¡Muchas gracias por comunicarte con nosotros por teléfono!\n\nSi necesitas agendar o consultar cualquier duda sobre tus tratamientos, puedes escribirnos por este mismo chat de WhatsApp las 24 horas del día.`,
  });

  if (!delivered) throw new Error('Meta no aceptó el seguimiento post-llamada');
}

export const jobHandlers: JobHandlerMap = {
  META_INBOUND_MESSAGE: processMetaInbound,
  WHATSAPP_SEND: processWhatsAppSend,
  VOICE_POST_CALL_FOLLOWUP: processVoiceFollowUp,
};

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Instancia compartida por rutas, worker y pruebas. */
export const jobQueue = new JobQueue({
  handlers: jobHandlers,
  pollIntervalMs: envNumber('JOBS_POLL_INTERVAL_MS', 1000),
  batchSize: envNumber('JOBS_BATCH_SIZE', 5),
  baseBackoffMs: envNumber('JOBS_BASE_BACKOFF_MS', 2000),
  maxBackoffMs: envNumber('JOBS_MAX_BACKOFF_MS', 5 * 60 * 1000),
  maxAttemptsDefault: envNumber('JOBS_MAX_ATTEMPTS', 5),
  logger: createLogger('api:queue'),
  onDeadLetter: async (job, reason) => {
    // Un mensaje que jamás pudo entregarse no debe quedarse en PENDING para
    // siempre: se marca FAILED para que la bandeja muestre el fallo real.
    const payload = job.payload as Partial<WhatsAppSendPayload> & { messageId?: string };
    if (job.type !== 'WHATSAPP_SEND' || !payload?.messageId) return;

    await db.message.updateMany({
      where: { id: payload.messageId, deliveryStatus: { not: 'SENT' } },
      data: { deliveryStatus: 'FAILED' },
    });

    logger.error('Mensaje de WhatsApp descartado tras agotar reintentos', undefined, {
      messageId: payload.messageId,
      reason: reason.slice(0, 200),
    });
  },
});

/** Encola el turno de un mensaje entrante de Meta (una sola vez por wamid). */
export async function enqueueMetaInbound(payload: MetaInboundPayload): Promise<string | null> {
  return jobQueue.enqueue({
    type: 'META_INBOUND_MESSAGE',
    tenantId: payload.tenantId,
    dedupeKey: `meta:${payload.inboundMessageId}`,
    payload,
  });
}

/** Encola el seguimiento post-llamada de voz. */
export async function enqueueVoiceFollowUp(payload: VoicePostCallPayload): Promise<string | null> {
  return jobQueue.enqueue({
    type: 'VOICE_POST_CALL_FOLLOWUP',
    tenantId: payload.tenantId,
    dedupeKey: payload.callSid ? `voice-followup:${payload.callSid}` : null,
    payload,
  });
}

/** Procesa toda la cola pendiente (pruebas y apagado ordenado). */
export async function drainQueue(): Promise<number> {
  return jobQueue.drain();
}

/** Arranca el worker dentro del proceso de la API. */
export function startQueueWorker(): void {
  jobQueue.start();
}
