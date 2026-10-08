/**
 * Reglas de tiempo del anticipo (No-Show Shield): cuánto se espera el pago,
 * cuándo se recuerda y cuándo se libera el horario.
 *
 * Decisión de producto ("recordar y liberar"): un anticipo no pagado no puede
 * apartar un horario para siempre. Se libera lo que ocurra primero:
 *   - 24 h después de agendar, o
 *   - cuando faltan menos de 3 h para la cita (para que otro paciente alcance
 *     a tomar el espacio).
 *
 * Caso borde deliberado: una cita agendada con menos de 3 h de anticipación
 * (urgencias del mismo día) cumpliría la segunda regla en el instante mismo de
 * agendarse. Para no cancelarle la cita a alguien que aún no ha tenido tiempo
 * de abrir el link, el paciente siempre tiene al menos `minWindowMs` para
 * pagar; y si ni eso cabe antes de la cita, no se fija límite y el horario no
 * se libera solo (recepción decide en persona).
 */
export interface DepositPolicy {
  /** Tiempo máximo para pagar desde que se agendó (por defecto 24 h). */
  paymentWindowMs: number;
  /** Se libera el horario cuando falta menos que esto para la cita (por defecto 3 h). */
  releaseBeforeStartMs: number;
  /** Tiempo mínimo que siempre tiene el paciente para pagar (por defecto 1 h). */
  minWindowMs: number;
}

const HOUR_MS = 60 * 60 * 1000;

function envHours(name: string, fallbackHours: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return (Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackHours) * HOUR_MS;
}

export function resolveDepositPolicy(): DepositPolicy {
  return {
    paymentWindowMs: envHours('DEPOSIT_PAYMENT_WINDOW_HOURS', 24),
    releaseBeforeStartMs: envHours('DEPOSIT_RELEASE_BEFORE_HOURS', 3),
    minWindowMs: envHours('DEPOSIT_MIN_WINDOW_HOURS', 1),
  };
}

/**
 * Límite de pago para una cita recién agendada, o `null` si no hay tiempo
 * útil antes de la cita (en ese caso el barrido nunca la cancela).
 */
export function computeDepositDeadline(params: {
  bookedAt: Date;
  startTime: Date;
  now?: Date;
  policy?: DepositPolicy;
}): Date | null {
  const policy = params.policy ?? resolveDepositPolicy();
  const now = params.now ?? new Date();
  const bookedAt = params.bookedAt.getTime();
  const startTime = params.startTime.getTime();

  const byWindow = bookedAt + policy.paymentWindowMs;
  const byStart = startTime - policy.releaseBeforeStartMs;
  const minimum = Math.max(bookedAt, now.getTime()) + policy.minWindowMs;

  const deadline = Math.max(Math.min(byWindow, byStart), minimum);
  if (deadline >= startTime) return null;
  return new Date(deadline);
}

/**
 * Momento del único recordatorio: a la mitad del plazo. Con el plazo normal
 * de 24 h son 12 h después de agendar; con plazos cortos sigue dejando tiempo
 * para pagar después de recordarlo.
 */
export function depositReminderDueAt(bookedAt: Date, deadline: Date): Date {
  return new Date(bookedAt.getTime() + (deadline.getTime() - bookedAt.getTime()) / 2);
}

/**
 * Si al mandar el link quedan menos de 2 veces el plazo mínimo (2 h por
 * defecto), no cabe un recordatorio útil: llegaría pegado a la confirmación
 * (p. ej. una urgencia del mismo día o una confirmación que salió tarde por
 * reintentos). En ese caso el propio link cuenta como el recordatorio.
 */
export function isReminderCoveredByLink(deadline: Date, now: Date, policy?: DepositPolicy): boolean {
  const { minWindowMs } = policy ?? resolveDepositPolicy();
  return deadline.getTime() - now.getTime() < 2 * minWindowMs;
}
