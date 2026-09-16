import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, decryptCredentials } from '@asistente/database';
import {
  normalizeMexicanPhone,
  MercadoPagoService,
  SubscriptionService,
} from '@asistente/ai-agent';
import { WhatsAppService } from '../services/whatsappService.js';
import { enqueueMetaInbound } from '../services/queue/handlers.js';
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
   */
  fastify.post('/webhooks/meta', async (request: FastifyRequest, reply: FastifyReply) => {
    verifyMetaSignature(
      request.rawBody,
      request.headers['x-hub-signature-256'] as string | undefined
    );

    const body = request.body as Record<string, any>;
    const entry = body?.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return reply.status(200).send({ status: 'ignored' });
    }

    const senderRawPhone = String(message.from || '');
    const senderPhoneE164 = normalizeMexicanPhone(senderRawPhone);
    const senderName = value?.contacts?.[0]?.profile?.name || 'Paciente';
    const phoneNumberId = value?.metadata?.phone_number_id;
    const displayPhoneNumber = value?.metadata?.display_phone_number;
    const externalMessageId = message.id ? String(message.id) : undefined;

    let incomingText = '';
    if (message.type === 'text') {
      incomingText = message.text?.body || '';
    } else if (message.type === 'interactive') {
      const replyButton = message.interactive?.button_reply;
      if (
        replyButton?.id?.startsWith('confirm_') ||
        replyButton?.title?.toLowerCase().includes('confirmar')
      ) {
        incomingText = 'Confirmar Asistencia';
      } else if (
        replyButton?.id?.startsWith('reschedule_') ||
        replyButton?.title?.toLowerCase().includes('reagendar')
      ) {
        incomingText = 'Reagendar Cita';
      } else {
        incomingText = replyButton?.title || replyButton?.id || '';
      }
    } else if (message.type === 'button') {
      incomingText = message.button?.text || message.button?.payload || '';
    } else if (message.type === 'audio' || message.type === 'voice') {
      incomingText = '[Mensaje de voz recibido]';
    } else if (message.type === 'image') {
      incomingText = message.image?.caption || '[Imagen recibida]';
    }

    if (!incomingText) {
      return reply.status(200).send({ status: 'ignored' });
    }

    request.log.info(
      { sender: maskPhone(senderPhoneE164), channel: 'WHATSAPP' },
      'Mensaje entrante de WhatsApp'
    );

    const tenant = await resolveTenantByWhatsApp({ phoneNumberId, displayPhoneNumber });
    if (!tenant) {
      throw new HttpError(404, 'Número de WhatsApp no asociado a ninguna clínica activa');
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

    // Idempotencia: Meta reintenta el mismo wamid; se descarta sin duplicar respuesta.
    if (externalMessageId) {
      const duplicate = await db.message.findFirst({
        where: { conversationId: conversation.id, externalMessageId },
        select: { id: true },
      });
      if (duplicate) {
        request.log.info({ externalMessageId }, 'Mensaje duplicado de Meta ignorado');
        return reply.status(200).send({ status: 'duplicate' });
      }
    }

    const inboundMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        tenantId: tenant.id,
        direction: 'INBOUND',
        senderRole: 'PATIENT',
        content: incomingText,
        channel: 'WHATSAPP',
        externalMessageId,
        rawPayload: JSON.stringify(message),
      },
    });

    if (conversation.isHandedOverToHuman) {
      request.log.info({ conversationId: conversation.id }, 'Conversación en modo humano: IA silenciada');
      return reply.status(200).send({ status: 'handed_over' });
    }

    // El turno del agente y el envío por WhatsApp se ejecutan en la cola:
    // Meta exige una respuesta rápida y reintenta el webhook si tardamos, lo
    // que duplicaría respuestas y citas. El mensaje entrante ya quedó
    // persistido, así que aparece de inmediato en la bandeja omnicanal.
    const jobId = await enqueueMetaInbound({
      conversationId: conversation.id,
      patientId: patient.id,
      tenantId: tenant.id,
      inboundMessageId: inboundMessage.id,
      text: incomingText,
      channel: 'WHATSAPP',
      phoneNumberId,
    });

    return reply.status(200).send({
      status: 'received',
      queued: Boolean(jobId),
      duplicateJob: jobId === null,
    });
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

    // El token del stream es opcional: si está configurado se exige en el
    // handshake del WebSocket (/voice/stream) para que nadie externo pueda
    // inyectar audio o escuchar la conversación.
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

    const updated = await MercadoPagoService.processPaymentWebhook(
      body,
      webhookActor(request, 'mercadopago')
    );

    if (updated.paymentStatus === 'DEPOSIT_PAID') {
      await WhatsAppService.sendAppointmentConfirmation(updated);
    }

    return reply.status(200).send({
      success: true,
      appointmentId: updated.id,
      paymentStatus: updated.paymentStatus,
      depositAmountMxn: updated.depositAmountMxn,
    });
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
