import { db, recordAudit, resolveTenantPlan, type AuditActor } from '@asistente/database';
import { OmnichannelAgent, evaluateTriage } from '@asistente/ai-agent';
import { createLogger } from '@asistente/observability';
import { WhatsAppService } from '../whatsappService.js';
import { JobQueue, PermanentJobError, type JobContext, type JobHandlerMap } from './queue.js';
import { maskJobText } from './queue.js';
import { ensureDepositLink } from '../deposits/depositLink.js';
import { buildDepositNotice, type DepositNoticeKind } from '../deposits/depositMessages.js';

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
  /**
   * Botón interactivo de la confirmación de cita (`confirm_<id>` /
   * `reschedule_<id>`). Viaja aparte del texto para no perder a qué cita se
   * refiere el paciente.
   */
  buttonAction?: { kind: 'CONFIRM' | 'RESCHEDULE'; appointmentId: string };
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
  | { kind: 'APPOINTMENT_CONFIRMATION'; appointmentId: string; tenantId: string }
  | { kind: 'DEPOSIT_NOTICE'; notice: DepositNoticeKind; appointmentId: string; tenantId: string };

export interface VoicePostCallPayload {
  tenantId: string;
  toPhoneE164: string;
  callSid?: string;
}

const logger = createLogger('api:queue:handlers');

const agent = new OmnichannelAgent();

/**
 * Actor de auditoría de lo que el canal de WhatsApp hace por su cuenta. Es el
 * mismo identificador que usa el agente para sus herramientas: para quien lee
 * la bitácora, confirmar con el botón o con la herramienta es la misma acción.
 */
const AGENT_AUDIT_ACTOR: AuditActor = { type: 'AI_AGENT', id: 'omnichannel-agent' };

/** Estados de cita sobre los que todavía tiene sentido confirmar o reagendar. */
const ACTIONABLE_APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'RESCHEDULED'];

type InboundConversation = NonNullable<Awaited<ReturnType<typeof loadInboundConversation>>>;

function loadInboundConversation(conversationId: string, tenantId: string) {
  return db.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: {
      patient: true,
      tenant: {
        select: {
          name: true,
          address: true,
          timezone: true,
          planSlug: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
        },
      },
    },
  });
}

interface InboundRef {
  id: string;
  createdAt: Date;
}

/** Marca que liga la respuesta de la IA con el mensaje entrante que contesta. */
function replyMarker(inboundMessageId: string): string {
  return JSON.stringify({ inReplyTo: inboundMessageId });
}

interface InboundTurnResult {
  replyText: string;
  /** Motivo por el que la IA cede la conversación a recepción; null si no la cede. */
  handoverReason: string | null;
  appointmentBookedId?: string | null;
}

/** Fecha de cita legible para el paciente, en la zona horaria de la clínica. */
function formatAppointmentDate(date: Date, timezone: string | null | undefined): string {
  return date.toLocaleString('es-MX', {
    timeZone: timezone || 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/**
 * Cita a la que apunta un botón interactivo, solo si es de ESTA clínica y de
 * ESTE paciente. El id viene dentro del mensaje entrante y no se le confía a
 * ciegas: sin este filtro bastaría un id ajeno para confirmar o reagendar la
 * cita de otro paciente.
 */
function findButtonAppointment(conversation: InboundConversation, appointmentId: string) {
  return db.appointment.findFirst({
    where: {
      id: appointmentId,
      tenantId: conversation.tenantId,
      patientId: conversation.patientId,
      status: { in: ACTIONABLE_APPOINTMENT_STATUSES },
      endTime: { gte: new Date() },
    },
    include: { doctor: true, service: true },
  });
}

const STALE_BUTTON_REPLY =
  'Esa cita ya no está vigente (pudo haberse cancelado, reagendado o ya pasó). ' +
  'Si necesitas una nueva cita o tienes dudas, escríbenos por aquí y con gusto te ayudamos.';

/**
 * Botón "Confirmar Asistencia": confirma exactamente la cita del mensaje que
 * lo trajo. Antes el botón se aplanaba a texto y el agente confirmaba "la
 * próxima cita" del paciente, que con dos citas agendadas no es la misma.
 * Se resuelve sin LLM porque no hay nada que interpretar.
 */
async function confirmAppointmentFromButton(
  conversation: InboundConversation,
  appointmentId: string
): Promise<InboundTurnResult> {
  const appointment = await findButtonAppointment(conversation, appointmentId);
  if (!appointment) {
    return { replyText: STALE_BUTTON_REPLY, handoverReason: null };
  }

  if (appointment.status !== 'CONFIRMED') {
    await db.$transaction(async (tx) => {
      // Condicional sobre el estado leído: dos toques seguidos del botón no
      // deben duplicar la nota ni el rastro de auditoría.
      const updated = await tx.appointment.updateMany({
        where: { id: appointment.id, tenantId: conversation.tenantId, status: appointment.status },
        data: {
          status: 'CONFIRMED',
          notes: ((appointment.notes || '') + ' | Asistencia confirmada con botón de WhatsApp').trim(),
        },
      });
      if (updated.count === 0) return;
      await recordAudit(
        {
          tenantId: conversation.tenantId,
          actor: AGENT_AUDIT_ACTOR,
          action: 'UPDATE',
          entityType: 'APPOINTMENT',
          entityId: appointment.id,
          patientId: appointment.patientId,
          changes: { status: { before: appointment.status, after: 'CONFIRMED' } },
          metadata: {
            tool: 'whatsapp:boton_confirmar',
            channel: 'WHATSAPP',
            conversationId: conversation.id,
          },
        },
        tx
      );
    });
  }

  const when = formatAppointmentDate(appointment.startTime, conversation.tenant.timezone);
  return {
    replyText:
      `¡Gracias por confirmar tu asistencia, ${conversation.patient.fullName}! 🙌\n\n` +
      `📅 *Fecha:* ${when}\n` +
      `👨‍⚕️ *Especialista:* ${appointment.doctor.name}\n` +
      `🦷 *Tratamiento:* ${appointment.service.name}\n` +
      `📍 *Ubicación:* ${conversation.tenant.address || conversation.tenant.name}\n\n` +
      'Te sugerimos llegar 10 minutos antes. ¡Te esperamos!',
    handoverReason: null,
  };
}

/**
 * Turno del agente. El historial y la llamada al LLM no cambian; lo único que
 * se agrega es la traducción de `requiresHumanHandover` a un motivo auditable.
 */
async function runAgentTurn(
  conversation: InboundConversation,
  inbound: InboundRef,
  text: string
): Promise<InboundTurnResult> {
  // Solo lo anterior al mensaje que se contesta: en una ráfaga, los mensajes
  // posteriores del paciente tienen su propio turno y meterlos aquí invertiría
  // el orden de la conversación que ve el modelo.
  const recentMessages = await db.message.findMany({
    where: {
      conversationId: conversation.id,
      id: { not: inbound.id },
      createdAt: { lte: inbound.createdAt },
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { senderRole: true, content: true },
  });

  const conversationHistory = recentMessages.reverse().map((storedMessage) => ({
    role: (storedMessage.senderRole === 'PATIENT' ? 'user' : 'model') as 'user' | 'model',
    parts: [{ text: storedMessage.content }],
  }));

  const agentResponse = await agent.processMessage(
    text,
    {
      tenantId: conversation.tenantId,
      patientPhone: conversation.patient.phoneE164,
      patientName: conversation.patient.fullName,
      channel: 'WHATSAPP',
      conversationId: conversation.id,
    },
    conversationHistory
  );

  const booked = agentResponse.appointmentBooked as { id?: string } | null | undefined;
  // El motivo queda en la auditoría: una emergencia vital o una urgencia dental
  // detectadas por el triaje se distinguen de una transferencia que pidió el
  // paciente (herramienta `transferir_a_recepcionista_humano`).
  const triageLevel = agentResponse.triageAlert?.level;

  // Excepción deliberada: la urgencia dental aguda NO silencia a la IA. Su
  // respuesta termina preguntando "¿te reservamos el espacio de hoy?", y si la
  // conversación pasara a modo humano el "sí" del paciente no lo contestaría
  // nadie hasta que recepción abriera la bandeja. La regla de negocio para
  // URGENT_DENTAL es agendar el mismo día, no transferir.
  const handover =
    agentResponse.requiresHumanHandover === true && triageLevel !== 'URGENT_DENTAL';

  return {
    replyText: agentResponse.replyText,
    handoverReason: handover
      ? triageLevel === 'CRITICAL_EMERGENCY'
        ? 'CRITICAL_EMERGENCY'
        : 'TRANSFER_REQUESTED'
      : null,
    appointmentBookedId: booked && typeof booked === 'object' ? booked.id ?? null : null,
  };
}

/**
 * Clínica suspendida (prueba vencida o suscripción caída sin periodo pagado):
 * la IA no atiende. El mensaje ya quedó guardado en la bandeja, así que el
 * personal lo ve y puede contestar a mano.
 *
 * Se decidió NO mandar un aviso automático ("la clínica no está atendiendo"):
 * saldría del número de la clínica y con su nombre, diciendo algo que la
 * clínica no autorizó, y Meta se lo cobra a su cuenta de WhatsApp Business.
 * La única excepción es una emergencia vital evidente: ahí se manda la
 * indicación del 911 y se pasa a recepción, porque el silencio ante "no puedo
 * respirar" no es aceptable por ningún motivo comercial. El triaje es local
 * (palabras clave), no consume LLM.
 */
function suspendedClinicTurn(text: string): InboundTurnResult | null {
  const triage = evaluateTriage(text);
  if (triage.level !== 'CRITICAL_EMERGENCY') return null;

  return {
    replyText:
      `🚨 ATENCIÓN MÉDICA INMEDIATA:\n\n${triage.adviceForPatient}\n\n` +
      'Si necesitas auxilio urgente, por favor comunícate al 911 de inmediato.',
    handoverReason: 'CRITICAL_EMERGENCY',
  };
}

/**
 * Decide la respuesta del turno. Devuelve null cuando no se debe contestar
 * (clínica suspendida sin emergencia vital).
 */
async function decideInboundTurn(
  conversation: InboundConversation,
  inbound: InboundRef,
  payload: MetaInboundPayload
): Promise<InboundTurnResult | null> {
  // Se evalúa aquí y no en el webhook: un turno encolado antes de que venciera
  // la suscripción también debe respetar la suspensión al ejecutarse.
  if (resolveTenantPlan(conversation.tenant).isSuspended) {
    return suspendedClinicTurn(payload.text);
  }

  const action = payload.buttonAction;
  if (action?.kind === 'CONFIRM') {
    return confirmAppointmentFromButton(conversation, action.appointmentId);
  }

  if (action?.kind === 'RESCHEDULE') {
    const appointment = await findButtonAppointment(conversation, action.appointmentId);
    if (!appointment) return { replyText: STALE_BUTTON_REPLY, handoverReason: null };
    // Al agente se le describe la cita concreta: "Reagendar Cita" a secas lo
    // dejaba adivinar cuál, y con dos citas podía mover la equivocada.
    return runAgentTurn(
      conversation,
      inbound,
      `Quiero reagendar mi cita de ${appointment.service.name} con ${appointment.doctor.name} ` +
        `del ${formatAppointmentDate(appointment.startTime, conversation.tenant.timezone)}.`
    );
  }

  return runAgentTurn(conversation, inbound, payload.text);
}

/**
 * Procesa un mensaje entrante de Meta: historial -> agente -> respuesta.
 * Idempotencia: si la conversación ya tiene una respuesta posterior al mensaje
 * entrante (por ejemplo, un reintento tras un éxito parcial), no repite el turno.
 */
async function processMetaInbound(payload: MetaInboundPayload, context: JobContext): Promise<void> {
  const conversation = await loadInboundConversation(payload.conversationId, payload.tenantId);

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

  // Reintento tras éxito parcial: la respuesta de la IA a ESTE mensaje ya se
  // guardó, o recepción ya contestó a mano después de él.
  //
  // Antes bastaba "cualquier saliente posterior al entrante", pero con ráfagas
  // (Meta manda varios mensajes juntos, o el paciente escribe mientras la IA
  // aún piensa) la respuesta al primer mensaje queda después del segundo y el
  // segundo se daba por contestado sin estarlo. La marca `inReplyTo` liga cada
  // respuesta con su entrante sin tocar el esquema.
  const alreadyAnswered = await db.message.findFirst({
    where: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      OR: [
        { senderRole: 'AI_AGENT', rawPayload: replyMarker(inbound.id) },
        { senderRole: 'HUMAN_STAFF', createdAt: { gte: inbound.createdAt } },
        // Respuestas guardadas antes de que existiera la marca: se conserva el
        // criterio anterior para no contestar dos veces un reintento en vuelo.
        { senderRole: 'AI_AGENT', rawPayload: null, createdAt: { gte: inbound.createdAt } },
      ],
    },
    select: { id: true },
  });
  if (alreadyAnswered) {
    context.logger.info('El turno ya fue respondido; se omite el reintento', {
      conversationId: conversation.id,
    });
    return;
  }

  const turn = await decideInboundTurn(conversation, inbound, payload);
  if (!turn) {
    context.logger.warn('Clínica suspendida: el mensaje se guarda pero la IA no responde', {
      conversationId: conversation.id,
    });
    return;
  }

  // La respuesta y el cambio a modo humano se confirman juntos: si la IA dice
  // "te comunico con recepción" la conversación tiene que quedar en la bandeja
  // de recepción, y la IA no debe volver a contestar el siguiente mensaje.
  const outboundMessage = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: conversation.id,
        tenantId: conversation.tenantId,
        direction: 'OUTBOUND',
        senderRole: 'AI_AGENT',
        content: turn.replyText,
        channel: 'WHATSAPP',
        deliveryStatus: 'PENDING',
        rawPayload: replyMarker(inbound.id),
      },
      select: { id: true },
    });

    if (!turn.handoverReason) {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
      return created;
    }

    // updateMany con la condición `false`: si recepción tomó el control en el
    // intervalo, no se duplica el cambio ni su rastro de auditoría.
    const flipped = await tx.conversation.updateMany({
      where: { id: conversation.id, tenantId: conversation.tenantId, isHandedOverToHuman: false },
      data: { isHandedOverToHuman: true, lastMessageAt: new Date() },
    });
    if (flipped.count > 0) {
      await recordAudit(
        {
          tenantId: conversation.tenantId,
          actor: AGENT_AUDIT_ACTOR,
          action: 'UPDATE',
          entityType: 'CONVERSATION',
          entityId: conversation.id,
          patientId: conversation.patientId,
          changes: { isHandedOverToHuman: { before: false, after: true } },
          metadata: {
            reason: turn.handoverReason,
            channel: 'WHATSAPP',
            inboundMessageId: inbound.id,
          },
        },
        tx
      );
    }
    return created;
  });

  if (turn.handoverReason) {
    // Recepción se entera por la bandeja omnicanal, que marca la conversación
    // como "Humano en Control"; el log deja además la alerta para monitoreo.
    context.logger.warn('La IA cedió la conversación de WhatsApp a recepción', {
      conversationId: conversation.id,
      reason: turn.handoverReason,
    });
  }

  await jobQueue.enqueue({
    type: 'WHATSAPP_SEND',
    tenantId: conversation.tenantId,
    dedupeKey: `wa:${outboundMessage.id}`,
    payload: {
      kind: 'TEXT',
      toPhoneE164: conversation.patient.phoneE164,
      text: turn.replyText,
      phoneNumberId: payload.phoneNumberId,
      messageId: outboundMessage.id,
    } satisfies WhatsAppSendPayload,
  });

  if (turn.appointmentBookedId) {
    await enqueueAppointmentConfirmation(conversation.tenantId, turn.appointmentBookedId);
  }
}

/**
 * Confirmación de cita por WhatsApp (con el link de anticipo si aplica). La
 * usan los dos canales que agendan: el chat y la llamada. La clave de
 * deduplicación por cita evita mandarla dos veces si ambos la piden.
 */
export async function enqueueAppointmentConfirmation(
  tenantId: string,
  appointmentId: string
): Promise<string | null> {
  return jobQueue.enqueue({
    type: 'WHATSAPP_SEND',
    tenantId,
    dedupeKey: `wa-confirm:${appointmentId}`,
    payload: {
      kind: 'APPOINTMENT_CONFIRMATION',
      appointmentId,
      tenantId,
    } satisfies WhatsAppSendPayload,
  });
}

async function processWhatsAppSend(payload: WhatsAppSendPayload, context: JobContext): Promise<void> {
  // En producción, sin credenciales de WhatsApp (ni de la clínica ni de la
  // plataforma) ningún reintento va a funcionar: se falla de inmediato para
  // que el mensaje quede FAILED en la bandeja en vez de pasar horas en cola.
  if (process.env.NODE_ENV === 'production') {
    const credentials = await WhatsAppService.resolveCredentials({
      tenantId: context.tenantId,
      phoneNumberId: payload.kind === 'TEXT' ? payload.phoneNumberId : undefined,
    });
    if (!credentials) {
      throw new PermanentJobError('WhatsApp no está configurado para esta clínica');
    }
  }

  if (payload.kind === 'TEXT') {
    const delivered = await WhatsAppService.sendMessage({
      tenantId: context.tenantId,
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

  if (payload.kind === 'DEPOSIT_NOTICE') {
    // El texto se decide al enviar: si el estado cambió mientras el trabajo
    // esperaba (p. ej. pagó antes del recordatorio), el aviso ya no aplica.
    const text = buildDepositNotice(payload.notice, appointment);
    if (!text) {
      context.logger.info('Aviso de anticipo omitido: la cita cambió de estado', {
        appointmentId: appointment.id,
        notice: payload.notice,
      });
      return;
    }

    const delivered = await WhatsAppService.sendMessage({
      // Sin tenantId saldría del número global en vez del de la clínica.
      tenantId: appointment.tenantId,
      toPhoneE164: appointment.patient.phoneE164,
      text,
    });
    if (!delivered) throw new Error('Meta no aceptó el aviso de anticipo');

    context.logger.info('Aviso de anticipo enviado', {
      appointmentId: appointment.id,
      notice: payload.notice,
    });
    return;
  }

  // Cita con anticipo: el link de pago va dentro de la confirmación.
  const withDeposit = await ensureDepositLink(appointment, {
    isFinalAttempt: context.attempt >= context.maxAttempts,
  });

  const delivered = await WhatsAppService.sendAppointmentConfirmation(withDeposit);
  if (!delivered) throw new Error('Meta no aceptó la confirmación de cita');

  context.logger.info('Confirmación de cita enviada', {
    appointmentId: appointment.id,
    depositLink: Boolean(withDeposit.depositPaymentUrl),
  });
}

async function processVoiceFollowUp(payload: VoicePostCallPayload): Promise<void> {
  const tenant = await db.tenant.findFirst({ where: { id: payload.tenantId, isActive: true } });
  if (!tenant) {
    throw new PermanentJobError(
      `Clínica ${payload.tenantId} no encontrada para el seguimiento post-llamada`
    );
  }

  const delivered = await WhatsAppService.sendMessage({
    tenantId: tenant.id,
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
    // Todo descarte se registra en nivel error, sea cual sea el tipo: un
    // META_INBOUND_MESSAGE muerto significa que un paciente escribió y nadie
    // le respondió, y antes eso ocurría en silencio (solo WHATSAPP_SEND dejaba
    // rastro). Solo identificadores: nada de teléfono ni texto del paciente.
    // El reintento manual vive en POST /api/admin/queue/:id/retry.
    logger.error('Trabajo descartado definitivamente (DEAD)', undefined, {
      jobId: job.id,
      type: job.type,
      tenantId: job.tenantId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      reason: maskJobText(reason, 200),
    });

    // Un mensaje que jamás pudo entregarse no debe quedarse en PENDING para
    // siempre: se marca FAILED para que la bandeja muestre el fallo real.
    const payload = job.payload as Partial<WhatsAppSendPayload> & { messageId?: string };
    if (job.type !== 'WHATSAPP_SEND' || !payload?.messageId) return;

    await db.message.updateMany({
      where: { id: payload.messageId, deliveryStatus: { not: 'SENT' } },
      data: { deliveryStatus: 'FAILED' },
    });

    logger.warn('Mensaje de WhatsApp descartado tras agotar reintentos', {
      messageId: payload.messageId,
      reason: maskJobText(reason, 200),
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
