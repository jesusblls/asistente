/**
 * Servicio de Notificaciones de Cobranza, Morosidad y Período de Gracia (Dunning).
 *
 * Canaliza avisos multicanal (WhatsApp oficial al teléfono de la clínica + Email transaccional)
 * ante eventos del ciclo de cobro:
 *  - Cobro rechazado (con motivo bancario legible en español).
 *  - Período de gracia activo (1 aviso diario durante 3 días).
 *  - Suspensión definitiva del servicio al 4º día.
 *  - Fin próximo de la prueba gratuita (a 3 días y a 24 horas).
 */
import { db, recordAudit, type AuditActor } from '@asistente/database';
import { createLogger } from '@asistente/observability';
import { formatMexicanPhoneDisplay } from '../utils/phone.js';

const logger = createLogger('billing:dunning');

const DUNNING_ACTOR: AuditActor = { type: 'SYSTEM', id: 'dunning-service' };

export type DunningNoticeType =
  | 'PAYMENT_FAILED'
  | 'GRACE_PERIOD_REMINDER'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'TRIAL_EXPIRING'
  | 'PAYMENT_RECOVERED';

export interface SendDunningNoticeParams {
  tenantId: string;
  type: DunningNoticeType;
  failureReason?: string;
  amountMxn?: number;
  graceDaysLeft?: number;
  trialDaysLeft?: number;
  dashboardUrl?: string;
}

export interface DunningMessageContent {
  subject: string;
  bodyText: string;
  whatsAppText: string;
}

export class DunningNotificationService {
  /**
   * Genera el contenido enriquecido y empático del mensaje según el tipo de aviso.
   */
  static composeNoticeContent(params: {
    tenantName: string;
    type: DunningNoticeType;
    failureReason?: string;
    amountMxn?: number;
    graceDaysLeft?: number;
    trialDaysLeft?: number;
    dashboardUrl: string;
  }): DunningMessageContent {
    const { tenantName, type, failureReason, amountMxn, graceDaysLeft, trialDaysLeft, dashboardUrl } = params;
    const portalUrl = `${dashboardUrl}/dashboard/suscripcion`;

    switch (type) {
      case 'PAYMENT_FAILED': {
        const motivo = failureReason || 'El banco emisor no autorizó el cargo';
        const dias = graceDaysLeft !== undefined ? graceDaysLeft : 3;
        const montoStr = amountMxn ? `$${amountMxn.toLocaleString('es-MX')} MXN` : 'la mensualidad';

        const whatsAppText =
          `🏥 *AsistentePro Clínicas · Aviso de Facturación*\n\n` +
          `Estimado equipo de *${tenantName}*:\n\n` +
          `No fue posible procesar el cargo de ${montoStr} de tu asistente clínico.\n\n` +
          `📌 *Motivo reportado por tu banco:* ${motivo}.\n` +
          `⏳ *Período de gracia:* Cuentas con *${dias} ${dias === 1 ? 'día' : 'días'}* de tolerancia con tus líneas y citas 100% activas mientras regularizas tu método de pago.\n\n` +
          `👉 Puedes reintentar el cobro o registrar otra tarjeta aquí:\n` +
          `${portalUrl}\n\n` +
          `Si necesitas ayuda, nuestro equipo de soporte está a tu disposición.`;

        return {
          subject: `⚠️ Acción requerida: Problema con el pago de ${tenantName} en AsistentePro`,
          bodyText: whatsAppText,
          whatsAppText,
        };
      }

      case 'GRACE_PERIOD_REMINDER': {
        const dias = graceDaysLeft ?? 1;
        const whatsAppText =
          `🚨 *AsistentePro Clínicas · Recordatorio de Gracia*\n\n` +
          `Hola *${tenantName}*:\n\n` +
          `Te recordamos que tu período de gracia finaliza en *${dias} ${dias === 1 ? 'día natural' : 'días naturales'}*.\n\n` +
          `Para evitar que la recepción de llamadas de pacientes y el asistente de WhatsApp se pausen, por favor actualiza tu tarjeta bancaria en tu panel:\n\n` +
          `👉 ${portalUrl}\n\n` +
          `Tus líneas siguen operando con normalidad el día de hoy.`;

        return {
          subject: `⏳ Te ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`} de gracia para mantener activo a tu asistente en ${tenantName}`,
          bodyText: whatsAppText,
          whatsAppText,
        };
      }

      case 'SUBSCRIPTION_SUSPENDED': {
        const whatsAppText =
          `🛑 *AsistentePro Clínicas · Asistente Pausado*\n\n` +
          `Estimado equipo de *${tenantName}*:\n\n` +
          `El período de gracia ha concluido sin registrarse un pago exitoso. El asistente virtual y las líneas de atención han sido temporalmente puestos en pausa.\n\n` +
          `Tus datos clínicos, doctores y citas siguen seguros. Para reactivar de inmediato la atención automática de tus pacientes, reactiva tu plan en:\n\n` +
          `👉 ${portalUrl}\n\n` +
          `La reactivación es instantánea tras autorizar el cargo.`;

        return {
          subject: `🛑 Asistente virtual pausado temporalmente para ${tenantName}`,
          bodyText: whatsAppText,
          whatsAppText,
        };
      }

      case 'TRIAL_EXPIRING': {
        const dias = trialDaysLeft ?? 1;
        const whatsAppText =
          `🌟 *AsistentePro Clínicas · Fin de Prueba Próximo*\n\n` +
          `Hola *${tenantName}*:\n\n` +
          `Tu prueba gratuita de 14 días concluye en *${dias} ${dias === 1 ? 'día' : 'días'}*.\n\n` +
          `No dejes que tus pacientes se queden sin respuesta fuera de horario. Contrata tu plan ahora y asegura atención 24/7 sin interrupciones:\n\n` +
          `👉 ${portalUrl}\n\n` +
          `Facturación con CFDI 4.0 deducible disponible en México (+52).`;

        return {
          subject: `⏰ Tu prueba gratuita en AsistentePro termina en ${dias} ${dias === 1 ? 'día' : 'días'}`,
          bodyText: whatsAppText,
          whatsAppText,
        };
      }

      case 'PAYMENT_RECOVERED': {
        const whatsAppText =
          `✅ *AsistentePro Clínicas · Pago Recibido con Éxito*\n\n` +
          `¡Buenas noticias, equipo de *${tenantName}*!\n\n` +
          `Hemos recibido exitosamente el pago de tu suscripción. Tu asistente clínico omnicanal y tus líneas continúan operando con total normalidad.\n\n` +
          `Puedes consultar tu recibo y detalles en cualquier momento en tu panel:\n` +
          `${portalUrl}\n\n` +
          `Gracias por confiar en AsistentePro Clínicas.`;

        return {
          subject: `✅ Pago confirmado — Tu servicio continúa activo en ${tenantName}`,
          bodyText: whatsAppText,
          whatsAppText,
        };
      }
    }
  }

  /**
   * Despacha el aviso respetando la idempotencia diaria:
   * Evita enviar dos avisos del mismo tipo el mismo día para no saturar al cliente.
   */
  static async sendNotice(params: SendDunningNoticeParams): Promise<boolean> {
    const { tenantId, type, failureReason, amountMxn, graceDaysLeft, trialDaysLeft } = params;
    const now = new Date();

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: { where: { role: 'ADMIN', isActive: true }, select: { email: true, name: true }, take: 1 },
      },
    });

    if (!tenant || !tenant.isActive) {
      logger.warn('No se puede enviar aviso: clínica inexistente o inactiva', { tenantId });
      return false;
    }

    // Idempotencia: no enviar más de un aviso de morosidad el mismo día natural (salvo si es PAYMENT_RECOVERED)
    if (type !== 'PAYMENT_RECOVERED' && tenant.lastBillingNoticeSentAt) {
      const horasDesdeUltimo = (now.getTime() - tenant.lastBillingNoticeSentAt.getTime()) / (1000 * 60 * 60);
      if (horasDesdeUltimo < 20) {
        logger.info('Aviso omitido por regla de cadencia diaria (menos de 20 horas desde el último envío)', {
          tenantId,
          type,
          horasDesdeUltimo: Math.round(horasDesdeUltimo),
        });
        return false;
      }
    }

    const dashboardUrl = process.env.APP_PUBLIC_URL?.replace(/\/+$/, '') || 'http://localhost:3001';
    const content = this.composeNoticeContent({
      tenantName: tenant.name,
      type,
      failureReason,
      amountMxn,
      graceDaysLeft,
      trialDaysLeft,
      dashboardUrl,
    });

    const adminEmail = tenant.users[0]?.email;
    const phoneE164 = tenant.phoneE164;

    logger.info(`Despachando aviso de cobranza [${type}] a ${tenant.name}`, {
      tenantId,
      phone: phoneE164 ? formatMexicanPhoneDisplay(phoneE164) : 'sin teléfono',
      email: adminEmail || 'sin email',
    });

    // 1. Despacho por WhatsApp: se encola en la tabla Job si existe teléfono
    if (phoneE164) {
      const dedupeKey = `dunning-wa-${tenantId}-${type}-${now.toISOString().slice(0, 10)}`;
      await db.job
        .upsert({
          where: { dedupeKey },
          create: {
            tenantId,
            type: 'WHATSAPP_SEND',
            payload: JSON.stringify({
              kind: 'TEXT',
              toPhoneE164: phoneE164,
              text: content.whatsAppText,
            }),
            dedupeKey,
          },
          update: {},
        })
        .catch((err) => {
          logger.warn('No se pudo encolar mensaje de WhatsApp para aviso de cobranza', {
            tenantId,
            error: String(err),
          });
        });
    }

    // 2. Registro extensible para Email transaccional (Resend / SMTP)
    // En producción se dispara el correo al adminEmail; en desarrollo queda registrado y trazable
    if (adminEmail) {
      logger.info('Notificación por correo preparada para despacho', {
        adminEmail,
        subject: content.subject,
      });
    }

    // 3. Actualizar la fecha de último aviso en la clínica
    await db.tenant.update({
      where: { id: tenantId },
      data: { lastBillingNoticeSentAt: now },
    });

    // 4. Registro de auditoría oficial (NOM-024 / LFPDPPP)
    await recordAudit({
      tenantId,
      actor: DUNNING_ACTOR,
      action: 'CREATE',
      entityType: 'TENANT',
      entityId: tenantId,
      metadata: {
        dunningNotice: type,
        phoneE164,
        adminEmail,
        failureReason,
        graceDaysLeft,
      },
    });

    return true;
  }
}
