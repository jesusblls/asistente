/**
 * Textos de WhatsApp del anticipo. Cada aviso es distinto a propósito: antes,
 * al acreditarse el pago se reenviaba la misma confirmación de la cita, y el
 * paciente no podía saber si su pago había llegado.
 */

export type DepositNoticeKind = 'PAID' | 'REMINDER' | 'EXPIRED';

export interface DepositNoticeAppointment {
  startTime: Date | string;
  status: string;
  paymentStatus: string;
  depositAmountMxn: number | null;
  depositPaymentUrl: string | null;
  depositDeadlineAt: Date | string | null;
  patient: { fullName: string };
  doctor: { name: string };
  service: { name: string; requiredDepositMxn: number };
  tenant: { name: string; timezone?: string | null };
}

export function depositAmountOf(appointment: {
  depositAmountMxn: number | null;
  service: { requiredDepositMxn: number };
}): number {
  return appointment.depositAmountMxn && appointment.depositAmountMxn > 0
    ? appointment.depositAmountMxn
    : appointment.service.requiredDepositMxn;
}

export function formatMxDateTime(value: Date | string, timezone?: string | null): string {
  return new Date(value).toLocaleString('es-MX', {
    timeZone: timezone || 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/**
 * Línea del anticipo dentro de la confirmación de la cita. Sin link (por
 * ejemplo, Mercado Pago sin configurar en producción) se le dice al paciente
 * que recepción le dará los datos, en vez de mencionarle un cobro sin forma
 * de pagarlo.
 */
export function buildDepositConfirmationLine(
  appointment: Omit<DepositNoticeAppointment, 'patient' | 'doctor'>
): string {
  const amount = depositAmountOf(appointment);
  if (amount <= 0) return '';

  if (appointment.paymentStatus === 'DEPOSIT_PAID' || appointment.paymentStatus === 'FULLY_PAID') {
    return `💳 *Anticipo:* $${amount} MXN (pagado ✅)`;
  }
  if (appointment.paymentStatus !== 'DEPOSIT_PENDING') return '';

  if (!appointment.depositPaymentUrl) {
    return `💳 *Anticipo:* $${amount} MXN. Recepción te compartirá cómo realizar el pago.`;
  }

  const deadline = appointment.depositDeadlineAt
    ? `\n⏳ Si no recibimos el pago antes del ${formatMxDateTime(appointment.depositDeadlineAt, appointment.tenant.timezone)}, el horario se liberará para otro paciente.`
    : '';

  return `💳 *Anticipo para garantizar tu lugar:* $${amount} MXN\nPágalo aquí: ${appointment.depositPaymentUrl}${deadline}`;
}

/**
 * Texto del aviso, o `null` si la cita ya no está en el estado que el aviso
 * describe (p. ej. el recordatorio de un anticipo que se pagó mientras el
 * trabajo esperaba en la cola). Se decide al enviar, no al encolar.
 */
export function buildDepositNotice(
  kind: DepositNoticeKind,
  appointment: DepositNoticeAppointment
): string | null {
  const amount = depositAmountOf(appointment);
  const when = formatMxDateTime(appointment.startTime, appointment.tenant.timezone);
  const header = `🦷 *${appointment.tenant.name}*`;
  const isPaid = appointment.paymentStatus === 'DEPOSIT_PAID' || appointment.paymentStatus === 'FULLY_PAID';

  if (kind === 'PAID') {
    if (!isPaid) return null;
    if (appointment.status === 'CANCELLED') {
      return `${header}

Hola *${appointment.patient.fullName}*, recibimos tu anticipo de $${amount} MXN, pero tu horario del ${when} ya se había liberado porque el pago no llegó a tiempo.

Recepción se comunicará contigo para reagendar o devolverte el anticipo. Una disculpa por la molestia.`;
    }
    return `${header}

✅ *Recibimos tu anticipo de $${amount} MXN.*

Hola *${appointment.patient.fullName}*, tu cita de ${appointment.service.name} con ${appointment.doctor.name} el ${when} queda garantizada. ¡Te esperamos!`;
  }

  if (kind === 'REMINDER') {
    if (appointment.paymentStatus !== 'DEPOSIT_PENDING' || appointment.status === 'CANCELLED') return null;
    if (!appointment.depositPaymentUrl) return null;
    const deadline = appointment.depositDeadlineAt
      ? ` antes del ${formatMxDateTime(appointment.depositDeadlineAt, appointment.tenant.timezone)}`
      : '';
    return `${header}

Hola *${appointment.patient.fullName}*, te recordamos que tu cita de ${appointment.service.name} del ${when} requiere un anticipo de $${amount} MXN.

Págalo${deadline} para conservar tu horario: ${appointment.depositPaymentUrl}

Si ya lo pagaste, ignora este mensaje.`;
  }

  // EXPIRED
  if (appointment.status !== 'CANCELLED' || isPaid) return null;
  return `${header}

Hola *${appointment.patient.fullName}*, como no recibimos el anticipo de $${amount} MXN, liberamos tu horario de ${appointment.service.name} del ${when}.

Si aún quieres tu cita, respóndenos por aquí y con gusto te buscamos un nuevo horario.`;
}
