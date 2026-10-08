import type { AuditActor } from '@asistente/database';
import {
  DepositLinkUnavailableError,
  DepositStateError,
  MercadoPagoService,
} from '@asistente/ai-agent';
import { createLogger } from '@asistente/observability';
import { computeDepositDeadline, isReminderCoveredByLink } from './depositPolicy.js';
import { depositAmountOf } from './depositMessages.js';

const logger = createLogger('api:deposits');

/** Actor de auditoría de todo lo que hace el No-Show Shield sin intervención humana. */
export const DEPOSITS_SYSTEM_ACTOR: AuditActor = { type: 'SYSTEM', id: 'deposits' };

export interface DepositLinkCandidate {
  id: string;
  tenantId: string;
  status: string;
  paymentStatus: string;
  depositAmountMxn: number | null;
  depositPaymentUrl: string | null;
  depositDeadlineAt: Date | null;
  startTime: Date;
  createdAt: Date;
  service: { requiredDepositMxn: number };
}

/**
 * Garantiza que una cita recién agendada con anticipo pendiente tenga su link
 * de Mercado Pago antes de mandarle la confirmación al paciente.
 *
 * Antes la cita quedaba en DEPOSIT_PENDING pero el link solo se generaba si
 * recepción lo pedía a mano: el paciente recibía el monto sin forma de pagar.
 *
 * Reintentos: si el link ya existe (un intento anterior lo creó y falló el
 * envío), se reutiliza. Si la API de Mercado Pago falla, se relanza para que
 * la cola reintente; en el último intento se manda la confirmación sin link,
 * porque una confirmación sin link es mejor que ninguna confirmación.
 */
export async function ensureDepositLink<T extends DepositLinkCandidate>(
  appointment: T,
  options: { isFinalAttempt: boolean; now?: Date }
): Promise<T> {
  if (appointment.paymentStatus !== 'DEPOSIT_PENDING' || appointment.status === 'CANCELLED') {
    return appointment;
  }
  if (appointment.depositPaymentUrl) return appointment;

  const amountMxn = depositAmountOf(appointment);
  if (amountMxn <= 0) return appointment;

  const now = options.now ?? new Date();
  const deadlineAt = computeDepositDeadline({
    bookedAt: appointment.createdAt,
    startTime: appointment.startTime,
    now,
  });

  try {
    const preference = await MercadoPagoService.createDepositPreference({
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
      amountMxn,
      auditActor: DEPOSITS_SYSTEM_ACTOR,
      deadlineAt: deadlineAt ?? undefined,
      reminderCovered: deadlineAt ? isReminderCoveredByLink(deadlineAt, now) : false,
    });

    return {
      ...appointment,
      depositPaymentUrl: preference.initPoint,
      depositDeadlineAt: deadlineAt ?? appointment.depositDeadlineAt,
    };
  } catch (error) {
    // Configuración faltante o cita ya pagada/cancelada: reintentar no
    // cambia nada. Sin link tampoco hay límite, así que el barrido no la
    // cancelará; queda en DEPOSIT_PENDING para que recepción la vea.
    if (error instanceof DepositLinkUnavailableError || error instanceof DepositStateError) {
      logger.warn('Confirmación de cita sin link de anticipo', {
        appointmentId: appointment.id,
        tenantId: appointment.tenantId,
        reason: error.message,
      });
      return appointment;
    }

    if (!options.isFinalAttempt) throw error;

    logger.error('No se pudo generar el link de anticipo; se confirma la cita sin link', error, {
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
    });
    return appointment;
  }
}
