import { createLogger } from '@asistente/observability';

const logger = createLogger('email');

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type EmailSender = (email: OutgoingEmail) => Promise<void>;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Envío de correo transaccional vía la API HTTP de Resend.
 *
 * Se eligió una API HTTP en vez de SMTP para no sumar dependencias (basta
 * `fetch`) y porque los VPS suelen tener el puerto 25 bloqueado. Cambiar de
 * proveedor es reescribir solo esta función.
 *
 * Sin `RESEND_API_KEY` corre en modo simulación, igual que las demás
 * integraciones: en desarrollo imprime el correo completo en el log (es la
 * única forma de seguir un enlace de recuperación sin proveedor). En
 * producción NO lo imprime: el cuerpo trae enlaces de un solo uso que darían
 * acceso a la cuenta a quien lea los logs.
 */
export const sendEmail: EmailSender = async (email) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'AsistentePro <no-reply@asistentepro.mx>';

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('RESEND_API_KEY no configurada: correo transaccional descartado', {
        subject: email.subject,
      });
    } else {
      logger.info('Correo simulado (sin RESEND_API_KEY)', {
        to: email.to,
        subject: email.subject,
        text: email.text,
      });
    }
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend respondió ${response.status}: ${detail.slice(0, 300)}`);
  }
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function passwordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): OutgoingEmail {
  const { to, name, resetUrl, expiresInMinutes } = params;
  const text = [
    `Hola ${name}:`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta de AsistentePro.',
    `Abre este enlace para elegir una nueva (vence en ${expiresInMinutes} minutos y solo sirve una vez):`,
    '',
    resetUrl,
    '',
    'Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.',
  ].join('\n');

  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:480px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
    <p style="margin:0 0 16px;font-size:13px;font-weight:bold;color:#0f766e;text-transform:uppercase;letter-spacing:.05em">AsistentePro</p>
    <h1 style="margin:0 0 16px;font-size:20px">Restablece tu contraseña</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#475569">Hola ${safeName}, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
    <p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:8px">Elegir nueva contraseña</a></p>
    <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#64748b">El enlace vence en ${expiresInMinutes} minutos y solo sirve una vez. Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.</p>
  </div>
</body></html>`;

  return { to, subject: 'Restablece tu contraseña de AsistentePro', text, html };
}

const HANDOVER_REASON_TEXT: Record<string, { subject: string; detail: string }> = {
  CRITICAL_EMERGENCY: {
    subject: '🚨 Posible emergencia: un paciente necesita atención de recepción',
    detail:
      'El asistente detectó síntomas de una posible emergencia vital. Ya le indicó al paciente llamar al 911 o acudir a urgencias, y dejó de responder para que recepción tome la conversación.',
  },
  LOW_SURVEY_SCORE: {
    subject: 'Un paciente calificó su visita como "mejorable"',
    detail:
      'Un paciente respondió la encuesta después de su cita con la calificación más baja. El asistente le dijo que alguien del equipo le escribirá y dejó la conversación en manos de recepción.',
  },
  TRANSFER_REQUESTED: {
    subject: 'Un paciente pidió hablar con recepción',
    detail: 'El asistente le avisó al paciente que lo comunica con recepción y dejó de responder en esa conversación.',
  },
};

/**
 * Aviso al personal cuando la IA cede una conversación. A propósito no lleva
 * nombre, teléfono ni el texto del paciente: el correo sale del sistema y
 * puede reenviarse; el detalle se consulta en el panel, donde queda auditado.
 */
export function handoverAlertEmail(params: {
  to: string;
  clinicName: string;
  reason: string;
  conversationUrl: string;
}): OutgoingEmail {
  const copy = HANDOVER_REASON_TEXT[params.reason] ?? HANDOVER_REASON_TEXT.TRANSFER_REQUESTED;
  const text = [
    `${params.clinicName}:`,
    '',
    copy.detail,
    '',
    `Ábrela en la bandeja del panel: ${params.conversationUrl}`,
  ].join('\n');
  const safeUrl = escapeHtml(params.conversationUrl);
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:480px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
    <p style="margin:0 0 16px;font-size:13px;font-weight:bold;color:#0f766e;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(params.clinicName)}</p>
    <h1 style="margin:0 0 16px;font-size:18px">${escapeHtml(copy.subject)}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#475569">${escapeHtml(copy.detail)}</p>
    <p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:8px">Abrir la bandeja</a></p>
  </div>
</body></html>`;
  return { to: params.to, subject: copy.subject, text, html };
}
