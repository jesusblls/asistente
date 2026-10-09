import { db, decryptCredentials } from '@asistente/database';
import { createLogger } from '@asistente/observability';
import { maskPhone } from '../lib/webhookSecurity.js';
import { buildDepositConfirmationLine, formatMxDateTime } from './deposits/depositMessages.js';

const logger = createLogger('whatsapp');

/**
 * Servicio para envío de mensajes y botones interactivos mediante WhatsApp Cloud API (Meta).
 */

export interface SendWhatsAppParams {
  /**
   * Clínica que envía. Con ella se usan las credenciales de su propio número
   * (`ChannelConfig` WHATSAPP); sin ella solo queda el número global de la
   * plataforma, que no es el de ninguna clínica en particular.
   */
  tenantId?: string | null;
  phoneNumberId?: string;
  accessToken?: string;
  toPhoneE164: string;
  text: string;
  interactiveButtons?: { id: string; title: string }[];
  /**
   * Plantilla aprobada por Meta. Fuera de la ventana de 24 h desde el último
   * mensaje del paciente, Meta solo acepta plantillas; `text` se sigue usando
   * para la bandeja y los logs.
   */
  template?: WhatsAppTemplate;
}

export interface WhatsAppTemplate {
  name: string;
  languageCode: string;
  /** Valores de {{1}}, {{2}}… del cuerpo, en orden. */
  bodyParameters: string[];
  /** Payload de cada botón de respuesta rápida, en el orden de la plantilla. */
  quickReplyPayloads?: string[];
}

export interface AppointmentConfirmationDetails {
  id: string;
  /** La cita de Prisma ya lo trae; se usa para enviar desde el número de su clínica. */
  tenantId?: string | null;
  startTime: Date | string;
  patient: {
    fullName: string;
    phoneE164: string;
  };
  doctor: {
    name: string;
    specialty: string;
  };
  service: {
    name: string;
    requiredDepositMxn: number;
  };
  tenant: {
    name: string;
    address?: string | null;
    timezone?: string | null;
  };
  status?: string;
  paymentStatus?: string;
  depositAmountMxn?: number | null;
  depositPaymentUrl?: string | null;
  depositDeadlineAt?: Date | string | null;
}

const MAX_SEND_ATTEMPTS = Math.max(1, Number(process.env.WHATSAPP_SEND_ATTEMPTS || 3));
const RETRY_BASE_DELAY_MS = Number(process.env.WHATSAPP_RETRY_DELAY_MS || 300);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Versión de Graph API usada para mensajes y verificación de números. */
export const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/** Forma del JSON cifrado en `ChannelConfig.credentials` para WHATSAPP. */
export interface WhatsAppChannelCredentials {
  phoneNumberId?: string;
  accessToken?: string;
  displayPhoneNumber?: string;
  wabaId?: string;
}

export type WhatsAppCredentialSource = 'CLINIC' | 'PLATFORM';

export interface ResolvedWhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  source: WhatsAppCredentialSource;
}

/**
 * Caché corta de las credenciales por clínica. Cada envío consultaría y
 * descifraría la fila de `ChannelConfig`; con 30 s de vida se ahorra eso en
 * ráfagas (respuesta + confirmación de cita). Las rutas de canales invalidan la
 * entrada del proceso que atendió el cambio; si hay varias réplicas de la API,
 * las demás lo toman al vencer la entrada (máximo 30 s).
 */
const CREDENTIALS_TTL_MS = 30_000;
const credentialsCache = new Map<
  string,
  { value: WhatsAppChannelCredentials | null; expiresAt: number }
>();

async function loadClinicCredentials(tenantId: string): Promise<WhatsAppChannelCredentials | null> {
  const cached = credentialsCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: WhatsAppChannelCredentials | null = null;
  try {
    const config = await db.channelConfig.findFirst({
      where: { tenantId, channelType: 'WHATSAPP', isActive: true },
    });
    if (config) {
      value = JSON.parse(decryptCredentials(config.credentials)) as WhatsAppChannelCredentials;
    }
  } catch (error) {
    // Error de base o fila ilegible (llave rotada sin re-cifrar, JSON corrupto):
    // se trata como "sin número propio" solo para este envío. No se guarda en
    // caché para que un tropiezo momentáneo no desvíe los envíos de un minuto.
    logger.error('No se pudieron leer las credenciales de WhatsApp de la clínica', error, { tenantId });
    return null;
  }

  credentialsCache.set(tenantId, { value, expiresAt: Date.now() + CREDENTIALS_TTL_MS });
  return value;
}

export class WhatsAppService {
  /** Olvida las credenciales en caché de una clínica (tras guardarlas o borrarlas). */
  static invalidateCredentials(tenantId: string): void {
    credentialsCache.delete(tenantId);
  }

  /**
   * Credenciales con las que se envía a nombre de una clínica: primero su
   * propio número (`ChannelConfig`), después el número global de la plataforma
   * (`META_WHATSAPP_TOKEN` / `META_PHONE_NUMBER_ID`). `null` si no hay ninguno.
   *
   * Si el paciente escribió a otro número (`phoneNumberId` del webhook distinto
   * al de la clínica, p. ej. el compartido de la plataforma) se contesta desde
   * ese mismo número: Meta solo permite texto libre dentro de la ventana de 24 h
   * del número que recibió el mensaje.
   */
  static async resolveCredentials(params: {
    tenantId?: string | null;
    phoneNumberId?: string;
    accessToken?: string;
  }): Promise<ResolvedWhatsAppCredentials | null> {
    const platformToken = params.accessToken || process.env.META_WHATSAPP_TOKEN;

    if (params.tenantId) {
      const clinic = await loadClinicCredentials(params.tenantId);
      const repliesElsewhere =
        Boolean(params.phoneNumberId) && params.phoneNumberId !== clinic?.phoneNumberId && Boolean(platformToken);
      if (clinic?.accessToken && clinic.phoneNumberId && !repliesElsewhere) {
        return { accessToken: clinic.accessToken, phoneNumberId: clinic.phoneNumberId, source: 'CLINIC' };
      }
    }

    const accessToken = platformToken;
    const phoneNumberId = params.phoneNumberId || process.env.META_PHONE_NUMBER_ID;
    if (accessToken && phoneNumberId) {
      return { accessToken, phoneNumberId, source: 'PLATFORM' };
    }
    return null;
  }

  /**
   * Envía un mensaje de texto o interactivo a un paciente en México, con reintentos.
   * Devuelve `true` solo si Meta aceptó el mensaje (o en la simulación de desarrollo).
   */
  static async sendMessage(params: SendWhatsAppParams): Promise<boolean> {
    const { tenantId, toPhoneE164, text, interactiveButtons } = params;

    // Normalizar formato de destinatario para Meta (sin signo +)
    const recipientPhone = toPhoneE164.replace(/\D/g, '');

    const credentials = await this.resolveCredentials(params);

    if (!credentials) {
      // En producción no hay simulación: reportar `true` marcaría el mensaje
      // como SENT en la bandeja aunque el paciente nunca lo recibió.
      if (process.env.NODE_ENV === 'production') {
        logger.error('WhatsApp sin credenciales: el mensaje no se envió', undefined, {
          tenantId: tenantId ?? null,
          to: maskPhone(toPhoneE164),
        });
        return false;
      }

      logger.info('Simulación WhatsApp: mensaje enviado', {
        to: maskPhone(toPhoneE164),
        text,
        buttons: interactiveButtons?.map((b) => b.title),
      });
      return true;
    }

    const activeToken = credentials.accessToken;
    const url = `${META_GRAPH_BASE}/${credentials.phoneNumberId}/messages`;

    let body: Record<string, unknown>;
    if (params.template) {
      const { name, languageCode, bodyParameters, quickReplyPayloads = [] } = params.template;
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'template',
        template: {
          name,
          language: { code: languageCode },
          components: [
            {
              type: 'body',
              parameters: bodyParameters.map((value) => ({ type: 'text', text: value })),
            },
            ...quickReplyPayloads.map((payload, index) => ({
              type: 'button',
              sub_type: 'quick_reply',
              index: String(index),
              parameters: [{ type: 'payload', payload }],
            })),
          ],
        },
      };
    } else if (interactiveButtons && interactiveButtons.length > 0) {
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: {
            buttons: interactiveButtons.slice(0, 3).map((btn) => ({
              type: 'reply',
              reply: {
                id: btn.id,
                title: btn.title.slice(0, 20), // Máximo 20 caracteres por Meta
              },
            })),
          },
        },
      };
    } else {
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: text },
      };
    }

    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (response.ok) return true;

        const errorText = await response.text();
        logger.error('Intento fallido al enviar mensaje por WhatsApp', errorText.slice(0, 300), {
          attempt,
          maxAttempts: MAX_SEND_ATTEMPTS,
          status: response.status,
          to: maskPhone(toPhoneE164),
        });
      } catch (error) {
        logger.error('Error de red al enviar mensaje por WhatsApp', error, {
          attempt,
          maxAttempts: MAX_SEND_ATTEMPTS,
          to: maskPhone(toPhoneE164),
        });
      }

      if (attempt < MAX_SEND_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
      }
    }

    return false;
  }

  /**
   * Envía confirmación formal de cita por WhatsApp con ubicación y detalles.
   */
  static async sendAppointmentConfirmation(
    appointment: AppointmentConfirmationDetails
  ): Promise<boolean> {
    const { patient, doctor, service, tenant, startTime } = appointment;
    const dateFormatted = formatMxDateTime(startTime, tenant?.timezone);
    const depositLine = buildDepositConfirmationLine({
      startTime,
      status: appointment.status ?? 'CONFIRMED',
      // Sin estado de pago explícito se conserva el comportamiento anterior:
      // mostrar el monto del servicio como pendiente.
      paymentStatus:
        appointment.paymentStatus ?? (service.requiredDepositMxn > 0 ? 'DEPOSIT_PENDING' : 'NONE'),
      depositAmountMxn: appointment.depositAmountMxn ?? null,
      depositPaymentUrl: appointment.depositPaymentUrl ?? null,
      depositDeadlineAt: appointment.depositDeadlineAt ?? null,
      service,
      tenant,
    });

    const message = `🦷 *¡Cita Confirmada en ${tenant.name}!*

Hola *${patient.fullName}*, tu cita ha quedado agendada con éxito:

👨‍⚕️ *Especialista:* ${doctor.name} (${doctor.specialty})
📋 *Tratamiento:* ${service.name}
🗓 *Fecha y Hora:* ${dateFormatted}
📍 *Dirección:* ${tenant.address || 'Consultorio'}
${depositLine}

Te esperamos con 10 minutos de anticipación. Si requieres reagendar o tienes dudas, puedes responder a este mensaje en cualquier momento.`;

    return this.sendMessage({
      tenantId: appointment.tenantId,
      toPhoneE164: patient.phoneE164,
      text: message,
      interactiveButtons: [
        { id: `confirm_${appointment.id}`, title: 'Confirmar Asistencia' },
        { id: `reschedule_${appointment.id}`, title: 'Reagendar Cita' },
      ],
    });
  }
}
