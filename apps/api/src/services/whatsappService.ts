import { createLogger } from '@asistente/observability';
import { maskPhone } from '../lib/webhookSecurity.js';

const logger = createLogger('whatsapp');

/**
 * Servicio para envío de mensajes y botones interactivos mediante WhatsApp Cloud API (Meta).
 */

export interface SendWhatsAppParams {
  phoneNumberId?: string;
  accessToken?: string;
  toPhoneE164: string;
  text: string;
  interactiveButtons?: { id: string; title: string }[];
}

export interface AppointmentConfirmationDetails {
  id: string;
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
}

const MAX_SEND_ATTEMPTS = Math.max(1, Number(process.env.WHATSAPP_SEND_ATTEMPTS || 3));
const RETRY_BASE_DELAY_MS = Number(process.env.WHATSAPP_RETRY_DELAY_MS || 300);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WhatsAppService {
  /**
   * Envía un mensaje de texto o interactivo a un paciente en México, con reintentos.
   */
  static async sendMessage(params: SendWhatsAppParams): Promise<boolean> {
    const { phoneNumberId, accessToken, toPhoneE164, text, interactiveButtons } = params;

    // Normalizar formato de destinatario para Meta (sin signo +)
    const recipientPhone = toPhoneE164.replace(/\D/g, '');

    const activeToken = accessToken || process.env.META_WHATSAPP_TOKEN;
    const activePhoneId = phoneNumberId || process.env.META_PHONE_NUMBER_ID;

    if (!activeToken || !activePhoneId) {
      logger.info('Simulación WhatsApp: mensaje enviado', {
        to: maskPhone(toPhoneE164),
        text,
        buttons: interactiveButtons?.map((b) => b.title),
      });
      return true;
    }

    const url = `https://graph.facebook.com/v21.0/${activePhoneId}/messages`;

    let body: Record<string, unknown>;
    if (interactiveButtons && interactiveButtons.length > 0) {
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
        logger.error('Intento fallido al enviar mensaje por WhatsApp', {
          attempt,
          maxAttempts: MAX_SEND_ATTEMPTS,
          status: response.status,
          to: maskPhone(toPhoneE164),
          error: errorText.slice(0, 300),
        });
      } catch (error) {
        logger.error('Error de red al enviar mensaje por WhatsApp', {
          attempt,
          maxAttempts: MAX_SEND_ATTEMPTS,
          to: maskPhone(toPhoneE164),
          error: error instanceof Error ? error.message : error,
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
    const dateFormatted = new Date(startTime).toLocaleString('es-MX', {
      timeZone: tenant?.timezone || 'America/Mexico_City',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const message = `🦷 *¡Cita Confirmada en ${tenant.name}!*

Hola *${patient.fullName}*, tu cita ha quedado agendada con éxito:

👨‍⚕️ *Especialista:* ${doctor.name} (${doctor.specialty})
📋 *Tratamiento:* ${service.name}
🗓 *Fecha y Hora:* ${dateFormatted}
📍 *Dirección:* ${tenant.address || 'Consultorio'}
${service.requiredDepositMxn > 0 ? `💳 *Anticipo:* $${service.requiredDepositMxn} MXN` : ''}

Te esperamos con 10 minutos de anticipación. Si requieres reagendar o tienes dudas, puedes responder a este mensaje en cualquier momento.`;

    return this.sendMessage({
      toPhoneE164: patient.phoneE164,
      text: message,
      interactiveButtons: [
        { id: `confirm_${appointment.id}`, title: 'Confirmar Asistencia' },
        { id: `reschedule_${appointment.id}`, title: 'Reagendar Cita' },
      ],
    });
  }
}
