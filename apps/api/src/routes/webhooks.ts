import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, decryptCredentials } from '@asistente/database';
import {
  normalizeMexicanPhone,
  MercadoPagoService,
  SubscriptionService,
} from '@asistente/ai-agent';
import { enqueueMetaInbound, type MetaInboundPayload } from '../services/queue/handlers.js';
import { enqueueDepositNotice } from '../services/deposits/depositSweeper.js';
import { HttpError } from '../lib/http.js';
import {
  maskPhone,
  verifyMercadoPagoSignature,
  verifyMetaSignature,
  verifyVoiceWebhookSignature,
} from '../lib/webhookSecurity.js';
import { webhookActor } from '../lib/audit.js';

async function resolveTenantByWhatsApp(params: {
  phoneNumberId?: string;
  displayPhoneNumber?: string;
}) {
  if (params.phoneNumberId) {
    const configs = await db.channelConfig.findMany({
      where: { channelType: 'WHATSAPP', isActive: true },
    });

    for (const config of configs) {
      try {
        const credentials = JSON.parse(decryptCredentials(config.credentials)) as { phoneNumberId?: string };
        if (credentials.phoneNumberId && credentials.phoneNumberId === params.phoneNumberId) {
          return db.tenant.findFirst({ where: { id: config.tenantId, isActive: true } });
        }
      } catch {
        // Credenciales ilegibles: se ignora ese canal y se continúa con el resto.
      }
    }
  }

  if (params.displayPhoneNumber) {
    return db.tenant.findFirst({
      where: { isActive: true, phoneE164: normalizeMexicanPhone(params.displayPhoneNumber) },
    });
  }

  return null;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

interface ParsedMetaMessage {
  text: string;
  buttonAction?: MetaInboundPayload['buttonAction'];
}

/**
 * Extrae el texto de un mensaje de Meta y, si es uno de los botones de la
 * confirmación de cita, el id de la cita a la que apunta.
 */
function parseMetaMessage(message: Record<string, any>): ParsedMetaMessage {
  if (message.type === 'text') return { text: message.text?.body || '' };

  // `interactive` es el botón de un mensaje interactivo; `button` es el botón
  // de respuesta rápida de una plantilla. Ambos pueden traer `confirm_<id>`.
  if (message.type === 'interactive' || message.type === 'button') {
    const replyButton =
      message.type === 'interactive'
        ? message.interactive?.button_reply
        : { id: message.button?.payload, title: message.button?.text };
    const buttonId = typeof replyButton?.id === 'string' ? replyButton.id : '';
    const title = typeof replyButton?.title === 'string' ? replyButton.title : '';

    // El id de la cita se manda aparte: si solo se pasa "Confirmar Asistencia"
    // el agente confirma la próxima cita del paciente, que no siempre es la
    // del mensaje que trae el botón.
    const confirmId = buttonId.startsWith('confirm_') ? buttonId.slice('confirm_'.length) : '';
    if (confirmId) {
      return { text: 'Confirmar Asistencia', buttonAction: { kind: 'CONFIRM', appointmentId: confirmId } };
    }
    // Encuesta post-cita: `survey_<cita>_<puntaje>`.
    const survey = /^survey_(.+)_([123])$/.exec(buttonId);
    if (survey) {
      return { text: title || 'Respuesta de encuesta', buttonAction: { kind: 'SURVEY', appointmentId: survey[1], score: Number(survey[2]) } };
    }
    // Invitación a revisión: el agente toma la solicitud como cualquier otra.
    if (buttonId.startsWith('recall_')) {
      return { text: 'Quiero agendar mi cita de revisión' };
    }
    const rescheduleId = buttonId.startsWith('reschedule_') ? buttonId.slice('reschedule_'.length) : '';
    if (rescheduleId) {
      return { text: 'Reagendar Cita', buttonAction: { kind: 'RESCHEDULE', appointmentId: rescheduleId } };
    }

    if (title.toLowerCase().includes('confirmar')) return { text: 'Confirmar Asistencia' };
    if (title.toLowerCase().includes('reagendar')) return { text: 'Reagendar Cita' };
    return { text: title || buttonId };
  }

  if (message.type === 'audio' || message.type === 'voice') return { text: '[Mensaje de voz recibido]' };
  if (message.type === 'image') return { text: message.image?.caption || '[Imagen recibida]' };
  return { text: '' };
}

type MetaMessageResult =
  | { status: 'received'; queued: boolean; duplicateJob: boolean }
  | { status: 'duplicate' | 'handed_over' | 'ignored' | 'unknown_number' };

type ResolvedTenant = Awaited<ReturnType<typeof resolveTenantByWhatsApp>>;

/** Persiste un mensaje entrante de Meta y encola su turno. */
async function processMetaMessage(
  request: FastifyRequest,
  value: Record<string, any>,
  message: Record<string, any>,
  resolveTenant: () => Promise<ResolvedTenant>
): Promise<MetaMessageResult> {
  const { text: incomingText, buttonAction } = parseMetaMessage(message ?? {});
  if (!incomingText) return { status: 'ignored' };

  const senderRawPhone = String(message.from || '');
  const senderPhoneE164 = normalizeMexicanPhone(senderRawPhone);
  // El contacto se busca por wa_id: en un lote con varios remitentes,
  // `contacts[0]` puede ser de otra persona.
  const contacts = asArray(value?.contacts);
  const contact = contacts.find((c) => c?.wa_id === message.from) ?? (contacts.length === 1 ? contacts[0] : null);
  const senderName = contact?.profile?.name || 'Paciente';
  const phoneNumberId = value?.metadata?.phone_number_id;
  const externalMessageId = message.id ? String(message.id) : undefined;

  request.log.info(
    { sender: maskPhone(senderPhoneE164), channel: 'WHATSAPP' },
    'Mensaje entrante de WhatsApp'
  );

  const tenant = await resolveTenant();
  if (!tenant) {
    // 200 y no 404: Meta reintenta cualquier respuesta distinta de 2xx durante
    // horas, y un número sin clínica no se va a arreglar solo con reintentos.
    request.log.warn(
      { phoneNumberId: phoneNumberId ?? null },
      'Mensaje de WhatsApp para un número no asociado a ninguna clínica activa; se descarta'
    );
    return { status: 'unknown_number' };
  }

  const patient = await db.patient.upsert({
    where: { tenantId_phoneE164: { tenantId: tenant.id, phoneE164: senderPhoneE164 } },
    update: {
      fullName: senderName !== 'Paciente' ? senderName : undefined,
      whatsappId: senderRawPhone,
    },
    create: {
      tenantId: tenant.id,
      fullName: senderName,
      phoneE164: senderPhoneE164,
      whatsappId: senderRawPhone,
    },
  });

  let conversation = await db.conversation.findFirst({
    where: { tenantId: tenant.id, patientId: patient.id, channel: 'WHATSAPP' },
  });

  if (conversation) {
    conversation = await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
  } else {
    conversation = await db.conversation.create({
      data: {
        tenantId: tenant.id,
        patientId: patient.id,
        channel: 'WHATSAPP',
        externalChannelId: senderRawPhone,
      },
    });
  }

  const conversationId = conversation.id;
  const isHandedOver = conversation.isHandedOverToHuman;

  // El turno del agente y el envío por WhatsApp se ejecutan en la cola:
  // Meta exige una respuesta rápida y reintenta el webhook si tardamos, lo
  // que duplicaría respuestas y citas. El mensaje entrante ya quedó
  // persistido, así que aparece de inmediato en la bandeja omnicanal.
  const enqueueTurn = (inboundMessageId: string) =>
    enqueueMetaInbound({
      conversationId,
      patientId: patient.id,
      tenantId: tenant.id,
      inboundMessageId,
      text: incomingText,
      channel: 'WHATSAPP',
      phoneNumberId,
      buttonAction,
    });

  // Idempotencia: Meta reintenta el mismo wamid; se descarta sin duplicar respuesta.
  // Se vuelve a encolar con la misma llave (`meta:<id>`, que la cola deduplica):
  // si el intento anterior guardó el mensaje pero falló antes de encolarlo, el
  // reintento de Meta es la única oportunidad de que ese turno se conteste.
  const handleDuplicate = async (duplicateId: string): Promise<MetaMessageResult> => {
    request.log.info({ externalMessageId }, 'Mensaje duplicado de Meta ignorado');
    if (!isHandedOver) await enqueueTurn(duplicateId);
    return { status: 'duplicate' };
  };

  if (externalMessageId) {
    const duplicate = await db.message.findFirst({
      where: { conversationId, externalMessageId },
      select: { id: true },
    });
    if (duplicate) return handleDuplicate(duplicate.id);
  }

  let inboundMessageId: string;
  try {
    const created = await db.message.create({
      data: {
        conversationId,
        tenantId: tenant.id,
        direction: 'INBOUND',
        senderRole: 'PATIENT',
        content: incomingText,
        channel: 'WHATSAPP',
        externalMessageId,
        rawPayload: JSON.stringify(message),
      },
      select: { id: true },
    });
    inboundMessageId = created.id;
  } catch (error) {
    // Dos entregas simultáneas del mismo wamid: la consulta de arriba no vio
    // la otra, pero el índice único (conversación, wamid) sí. Es un duplicado.
    if ((error as { code?: string })?.code === 'P2002' && externalMessageId) {
      const winner = await db.message.findFirst({
        where: { conversationId, externalMessageId },
        select: { id: true },
      });
      if (winner) return handleDuplicate(winner.id);
    }
    throw error;
  }

  if (isHandedOver) {
    request.log.info({ conversationId }, 'Conversación en modo humano: IA silenciada');
    return { status: 'handed_over' };
  }

  const jobId = await enqueueTurn(inboundMessageId);
  return { status: 'received', queued: Boolean(jobId), duplicateJob: jobId === null };
}

/**
 * Host público de la API. El header `Host` lo controla quien hace la petición,
 * y aquí acaba dentro del TwiML como destino del media stream (`wss://…`), así
 * que en producción se exige el valor configurado y el header solo se usa como
 * comodidad en desarrollo y pruebas.
 */
function resolvePublicHost(request: FastifyRequest): string {
  const configured = process.env.PUBLIC_API_HOST?.trim();
  if (configured) return configured.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  if (process.env.NODE_ENV === 'production') {
    throw new HttpError(503, 'PUBLIC_API_HOST es obligatorio en producción para los webhooks de voz');
  }

  return request.headers.host || 'localhost:3000';
}

async function resolveTenantByPhone(phone: string) {
  // El "To" que manda Twilio ya llega en E.164 real; normalizeMexicanPhone solo
  // reescribe formatos locales mexicanos y deja intacto cualquier otro país, así
  // que aquí solo validamos la forma E.164 en general (no solo +52) para poder
  // dar de alta clínicas de prueba con números de otros países.
  const normalized = normalizeMexicanPhone(phone);
  if (!/^\+\d{8,15}$/.test(normalized)) return null;
  return db.tenant.findFirst({ where: { isActive: true, phoneE164: normalized } });
}

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * 1. Verificación de Webhook de Meta (WhatsApp Cloud API, Instagram, Messenger)
   */
  fastify.get('/webhooks/meta', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const expectedToken = process.env.META_VERIFY_TOKEN;

    if (!expectedToken) {
      throw new HttpError(503, 'Webhook no configurado: falta META_VERIFY_TOKEN');
    }

    if (mode === 'subscribe' && token && token === expectedToken) {
      request.log.info('Webhook de Meta verificado correctamente');
      return reply.status(200).send(challenge);
    }

    request.log.warn('Falló la verificación del webhook de Meta');
    return reply.status(403).send('Forbidden');
  });

  /**
   * 2. Recepción de mensajes de Meta.
   *    La firma X-Hub-Signature-256 es obligatoria: sin ella no se procesa nada.
   *
   *    Meta agrupa: un mismo POST puede traer varias `entry`, cada una con
   *    varios `changes`, y cada `value` con varios `messages` (ráfagas del
   *    mismo paciente o de varios). Antes solo se leía el primero y el resto
   *    se perdía en silencio. Ahora se procesa cada mensaje por separado, con
   *    su propia idempotencia por wamid: si algo falla a la mitad se responde
   *    500, Meta reenvía el lote completo y los ya guardados se reconocen
   *    como duplicados (reencolando su turno por si no alcanzó a encolarse).
   */
  fastify.post('/webhooks/meta', async (request: FastifyRequest, reply: FastifyReply) => {
    verifyMetaSignature(
      request.rawBody,
      request.headers['x-hub-signature-256'] as string | undefined
    );

    const body = request.body as Record<string, any>;
    const results: MetaMessageResult[] = [];

    for (const entry of asArray(body?.entry)) {
      for (const change of asArray(entry?.changes)) {
        const value = change?.value;
        const messages = asArray(value?.messages);
        // Los `statuses` (enviado/entregado/leído) llegan por el mismo webhook.
        // Hoy no se usan; se aceptan con 200 para que Meta no los reintente.
        if (messages.length === 0) continue;

        // Una sola búsqueda de clínica por `value`, y solo si algún mensaje
        // trae contenido (un lote de stickers no consulta la base).
        let tenantLookup: Promise<ResolvedTenant> | null = null;
        const resolveTenant = () =>
          (tenantLookup ??= resolveTenantByWhatsApp({
            phoneNumberId: value?.metadata?.phone_number_id,
            displayPhoneNumber: value?.metadata?.display_phone_number,
          }));

        for (const message of messages) {
          results.push(await processMetaMessage(request, value, message, resolveTenant));
        }
      }
    }

    if (results.length === 0) {
      return reply.status(200).send({ status: 'ignored' });
    }

    // Con un solo mensaje se conserva la respuesta de siempre; con lote se
    // agrega el detalle por mensaje.
    if (results.length === 1) {
      return reply.status(200).send(results[0]);
    }
    return reply.status(200).send({ status: 'batch', results });
  });

  /**
   * 3. Webhook de Twilio Voice (llamadas entrantes en México).
   */
  fastify.post('/voice/incoming', async (request: FastifyRequest, reply: FastifyReply) => {
    const proto = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = resolvePublicHost(request);
    const url = `${proto}://${host}${request.url}`;
    const body = (request.body ?? {}) as Record<string, unknown>;

    verifyVoiceWebhookSignature({
      url,
      body,
      twilioSignature: request.headers['x-twilio-signature'] as string | undefined,
      signalWireSignature: request.headers['x-signalwire-signature'] as string | undefined,
    });

    const to = typeof body.To === 'string' ? body.To : '';
    const from = typeof body.From === 'string' ? body.From : '';
    const tenant = await resolveTenantByPhone(to);
    if (!tenant) {
      throw new HttpError(404, 'Número telefónico no asociado a ninguna clínica activa');
    }

    const welcome =
      tenant.welcomeMessage ||
      `Bienvenido a ${tenant.name}. Conectando con tu asistente virtual.`;

    // El token del stream se exige en el evento `start` del WebSocket
    // (/voice/stream) para que nadie externo pueda abrir una sesión de voz
    // suplantando el número de un paciente. En producción es obligatorio
    // (env.ts no arranca sin él); solo en desarrollo puede faltar.
    const streamToken = process.env.VOICE_STREAM_TOKEN;
    const authTokenParam = streamToken
      ? `\n      <Parameter name="authToken" value="${escapeXml(streamToken)}" />`
      : '';

    // El "From" ya viene confirmado en el webhook; se manda explícito como
    // Parameter en vez de confiar en que el evento `start` del WebSocket lo
    // replique igual en todos los proveedores (SignalWire no lo garantiza
    // como Twilio, y sin identidad de canal el agente no puede agendar).
    const fromParam = from
      ? `\n      <Parameter name="from" value="${escapeXml(from)}" />`
      : '';

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Mia-Neural" language="es-MX">${escapeXml(welcome)}</Say>
  <Connect>
    <Stream url="wss://${host}/voice/stream">
      <Parameter name="tenantId" value="${escapeXml(tenant.id)}" />${fromParam}${authTokenParam}
    </Stream>
  </Connect>
</Response>`;

    reply.header('Content-Type', 'text/xml');
    return reply.status(200).send(twiml);
  });

  /**
   * 4. Webhook de Mercado Pago.
   *
   * Por aquí entran dos flujos de dinero que van en direcciones opuestas y no
   * deben confundirse: los **anticipos de pacientes** a favor de la clínica
   * (`payment`) y las **mensualidades de la clínica** a favor de la plataforma
   * (`subscription_*`). Mercado Pago los distingue con `type`.
   */
  fastify.post('/webhooks/mercadopago', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, any>;

    verifyMercadoPagoSignature({
      dataId: body?.data?.id ? String(body.data.id) : undefined,
      requestId: request.headers['x-request-id'] as string | undefined,
      signatureHeader: request.headers['x-signature'] as string | undefined,
    });

    const tipo = String(body?.type || body?.topic || '');
    const dataId = body?.data?.id ? String(body.data.id) : '';

    // Cambio de estado de una suscripción (autorizada, pausada, cancelada).
    if (tipo === 'subscription_preapproval') {
      const estado = await SubscriptionService.syncFromPreapproval(dataId);
      return reply.status(200).send({ success: true, tipo, estado });
    }

    // Cobro periódico de una suscripción ya autorizada.
    if (tipo === 'subscription_authorized_payment') {
      const aplicado = await SubscriptionService.handleAuthorizedPayment(dataId);
      return reply.status(200).send({ success: true, tipo, aplicado });
    }

    const result = await MercadoPagoService.processPaymentWebhook(
      body,
      webhookActor(request, 'mercadopago')
    );
    return replyToDepositWebhook(request, reply, result);
  });

  /**
   * 4b. Aviso de pagos de la cuenta de Mercado Pago PROPIA de una clínica.
   *
   * Los anticipos se cobran con la cuenta de cada clínica, y la preferencia
   * le pide a Mercado Pago avisar a esta URL. No se valida firma: el secreto
   * de firma pertenece a la aplicación de la clínica en Mercado Pago, que la
   * plataforma no tiene (y que muchas clínicas ni siquiera crean). En su
   * lugar, el cuerpo del aviso no se cree: solo se usa el id del pago para
   * consultarlo en Mercado Pago con el token de ESA clínica, y solo puede
   * acreditar citas de esa misma clínica. Alguien que mande avisos falsos
   * solo consigue que consultemos pagos que Mercado Pago no le confirmará.
   */
  fastify.post(
    '/webhooks/mercadopago/clinica/:tenantId',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.params as { tenantId: string };
      const body = (request.body ?? {}) as Record<string, any>;
      const query = (request.query ?? {}) as Record<string, string>;
      // Mercado Pago a veces manda el aviso solo en la query (?type=payment&data.id=…).
      const payload = {
        type: body?.type || body?.topic || query.type || query.topic,
        data: { id: body?.data?.id ?? query['data.id'] ?? query.id },
        // Campos de simulación solo aplican fuera de producción (ver servicio).
        ...(process.env.NODE_ENV === 'production'
          ? {}
          : { status: body?.status, external_reference: body?.external_reference, appointmentId: body?.appointmentId }),
      };

      const result = await MercadoPagoService.processPaymentWebhook(
        payload,
        webhookActor(request, 'mercadopago'),
        { tenantId }
      );
      return replyToDepositWebhook(request, reply, result);
    }
  );
}

/** Respuesta común a los avisos de anticipo (cuenta de la plataforma o de la clínica). */
async function replyToDepositWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  result: Awaited<ReturnType<typeof MercadoPagoService.processPaymentWebhook>>
) {
  // Pago no aprobado, evento ajeno o pago inexistente: se responde 200 para
  // que Mercado Pago no reintente algo que nunca va a acreditarse.
  if (result.outcome === 'IGNORED') {
    request.log.info({ reason: result.reason }, 'Notificación de Mercado Pago sin acreditación');
    return reply.status(200).send({
      success: true,
      ignored: true,
      reason: result.reason,
      appointmentId: result.appointmentId ?? null,
    });
  }

  const { appointment, transitioned } = result;

  // El aviso "Recibimos tu anticipo" va por la cola (reintentos si Meta
  // falla). Se encola también en los duplicados a propósito: la dedupeKey
  // por cita hace que solo exista un aviso, y así, si el encolado falló
  // justo después de acreditar, el reintento de Mercado Pago lo recupera.
  if (appointment.paymentStatus === 'DEPOSIT_PAID') {
    await enqueueDepositNotice({
      notice: 'PAID',
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
    });
  }

  return reply.status(200).send({
    success: true,
    appointmentId: appointment.id,
    paymentStatus: appointment.paymentStatus,
    depositAmountMxn: appointment.depositAmountMxn,
    duplicate: !transitioned,
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
