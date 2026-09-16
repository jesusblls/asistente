/**
 * Aplicación de los cupos del plan contratado.
 *
 * El catálogo de planes (precios y límites) vive en `@asistente/shared-types`;
 * aquí solo se resuelve el plan efectivo de una clínica y se mide su consumo.
 * La separación es deliberada: la landing importa el catálogo sin arrastrar
 * Prisma, y el backend no puede aplicar un cupo que no esté publicado.
 */
import {
  PLANS,
  type PlanDefinition,
  type PlanLimits,
  type PlanSlug,
  type SubscriptionStatus,
  type UsageMetric,
} from '@asistente/shared-types';
import { db } from './client.js';
import type { Prisma, PrismaClient } from '@prisma/client';

type PlanWriter = PrismaClient | Prisma.TransactionClient;

/** Cupos de una cuenta cuya suscripción ya no está vigente: solo lectura. */
const SUSPENDED_LIMITS: PlanLimits = {
  maxDoctors: 0,
  maxAppointmentsPerMonth: 0,
  includedVoiceMinutes: 0,
  voiceEnabled: false,
};

export interface TenantPlanState {
  plan: PlanDefinition;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  /** Días completos que faltan para que expire la prueba; null si no hay prueba. */
  trialDaysLeft: number | null;
  /** True cuando la prueba venció o la suscripción dejó de estar vigente. */
  isSuspended: boolean;
  /** Cupos ya considerando la suspensión: es lo que se debe aplicar. */
  limits: PlanLimits;
}

/** Forma mínima de tenant que necesita `resolveTenantPlan`. */
export interface TenantPlanFields {
  planSlug: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  /** Hasta cuándo está pagado el servicio; null si nunca hubo un cobro. */
  currentPeriodEnd?: Date | null;
}

export function isPlanSlug(value: string): value is PlanSlug {
  return Object.prototype.hasOwnProperty.call(PLANS, value);
}

/**
 * Traduce las columnas del tenant al estado de plan que rige sus cupos.
 *
 * Un plan desconocido en base de datos degrada a `trial` en vez de reventar:
 * ante un dato corrupto se prefiere el cupo más chico, nunca el más amplio.
 */
export function resolveTenantPlan(
  tenant: TenantPlanFields,
  now: Date = new Date()
): TenantPlanState {
  const slug: PlanSlug = isPlanSlug(tenant.planSlug) ? tenant.planSlug : 'trial';
  const plan = PLANS[slug];
  const status = tenant.subscriptionStatus as SubscriptionStatus;
  const trialEndsAt = tenant.trialEndsAt ?? null;

  const trialExpired =
    status === 'TRIALING' && trialEndsAt !== null && trialEndsAt.getTime() <= now.getTime();

  // Periodo ya pagado. Manda sobre el estado de la suscripción: quien cancela
  // a mitad del mes pagó ese mes completo, y cortarle el servicio al momento
  // sería cobrar de más y entregar de menos. Lo mismo vale para un cobro que
  // falló: Mercado Pago reintenta durante días, y dejar sin línea telefónica a
  // una clínica al primer rechazo de la tarjeta es desproporcionado mientras
  // el periodo que ya pagó siga vigente.
  const periodEnd = tenant.currentPeriodEnd ?? null;
  const pagadoHastaHoy = periodEnd !== null && periodEnd.getTime() > now.getTime();

  const suscripcionCaida =
    status === 'CANCELED' || status === 'EXPIRED' || status === 'PAST_DUE';

  const isSuspended = trialExpired || (suscripcionCaida && !pagadoHastaHoy);

  const trialDaysLeft =
    status === 'TRIALING' && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000))
      : null;

  return {
    plan,
    status,
    trialEndsAt,
    trialDaysLeft,
    isSuspended,
    limits: isSuspended ? SUSPENDED_LIMITS : plan.limits,
  };
}

/**
 * Error de cupo agotado. Se distingue de un error genérico para que la API lo
 * traduzca a HTTP 402 (Payment Required) y el panel pueda ofrecer la mejora
 * de plan en vez de mostrar un fallo técnico.
 */
export class PlanLimitError extends Error {
  readonly limit: number | null;
  readonly current: number;
  readonly planSlug: PlanSlug;

  constructor(message: string, planSlug: PlanSlug, current: number, limit: number | null) {
    super(message);
    this.name = 'PlanLimitError';
    this.planSlug = planSlug;
    this.current = current;
    this.limit = limit;
  }
}

async function loadPlanState(tenantId: string, now: Date): Promise<TenantPlanState> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      planSlug: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });
  if (!tenant) throw new Error('Clínica no encontrada');
  return resolveTenantPlan(tenant, now);
}

/**
 * Periodo de consumo: mes natural en horario del centro de México. Se calcula
 * con `Intl` en vez de con los getters UTC porque una llamada de las 19:00 del
 * 30 de septiembre en CDMX es 01:00 del 1 de octubre en UTC, y cargarla al mes
 * siguiente adelantaría el corte de minutos un día.
 */
export function usagePeriod(now: Date = new Date(), timeZone = 'America/Mexico_City'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

/**
 * Desfase del huso respecto a UTC en un instante dado, en milisegundos.
 * Se mide formateando el instante en la zona y releyéndolo como si fuera UTC:
 * la diferencia es el offset vigente, con horario de verano incluido.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Intl rinde la medianoche como hora 24 en `hour12: false`; se normaliza a 0.
  const hour = read('hour') % 24;
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), hour, read('minute'), read('second'));
  return asUtc - instant.getTime();
}

/** Primer instante (UTC) del mes natural en curso en el huso de la clínica. */
export function usagePeriodStart(
  now: Date = new Date(),
  timeZone = 'America/Mexico_City'
): Date {
  const [year, month] = usagePeriod(now, timeZone).split('-').map(Number);
  const naiveUtc = Date.UTC(year, month - 1, 1, 0, 0, 0);

  // El offset se mide en el instante candidato y se reaplica: dos pasadas
  // bastan incluso si el primer día del mes cae justo en un cambio de horario.
  let candidate = naiveUtc - timeZoneOffsetMs(new Date(naiveUtc), timeZone);
  candidate = naiveUtc - timeZoneOffsetMs(new Date(candidate), timeZone);
  return new Date(candidate);
}

/** Acumula consumo medido. Idempotente por clínica, métrica y periodo. */
export async function recordUsage(
  tenantId: string,
  metric: UsageMetric,
  amount: number,
  now: Date = new Date(),
  writer: PlanWriter = db
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const period = usagePeriod(now);
  const value = Math.round(amount);

  await writer.usageCounter.upsert({
    where: { tenantId_metric_period: { tenantId, metric, period } },
    create: { tenantId, metric, period, value },
    update: { value: { increment: value } },
  });
}

export async function getUsage(
  tenantId: string,
  metric: UsageMetric,
  now: Date = new Date()
): Promise<number> {
  const row = await db.usageCounter.findUnique({
    where: { tenantId_metric_period: { tenantId, metric, period: usagePeriod(now) } },
    select: { value: true },
  });
  return row?.value ?? 0;
}

/** Citas creadas por la clínica dentro del mes natural en curso. */
export async function countAppointmentsThisPeriod(
  tenantId: string,
  now: Date = new Date()
): Promise<number> {
  return db.appointment.count({
    where: { tenantId, createdAt: { gte: usagePeriodStart(now) } },
  });
}

/**
 * Verifica que quepa un doctor más. Se cuenta solo sobre los activos: dar de
 * baja a un especialista debe liberar el cupo de inmediato.
 */
export async function assertCanAddDoctor(tenantId: string, now: Date = new Date()): Promise<void> {
  const state = await loadPlanState(tenantId, now);
  const limit = state.limits.maxDoctors;
  if (limit === null) return;

  const current = await db.doctor.count({ where: { tenantId, isActive: true } });
  if (current >= limit) {
    throw new PlanLimitError(
      state.isSuspended
        ? 'Tu prueba gratuita terminó. Activa un plan para seguir dando de alta especialistas.'
        : `Tu plan ${state.plan.name} incluye ${limit} ${limit === 1 ? 'especialista' : 'especialistas'}. Mejora de plan para agregar más.`,
      state.plan.slug,
      current,
      limit
    );
  }
}

/** Verifica que quepa una cita más en el mes natural en curso. */
export async function assertCanBookAppointment(
  tenantId: string,
  now: Date = new Date()
): Promise<void> {
  const state = await loadPlanState(tenantId, now);
  const limit = state.limits.maxAppointmentsPerMonth;
  if (limit === null) return;

  const current = await countAppointmentsThisPeriod(tenantId, now);
  if (current >= limit) {
    throw new PlanLimitError(
      state.isSuspended
        ? 'Tu prueba gratuita terminó. Activa un plan para seguir agendando citas.'
        : `Tu plan ${state.plan.name} incluye ${limit} citas al mes y ya se alcanzó el límite. Mejora de plan para seguir agendando.`,
      state.plan.slug,
      current,
      limit
    );
  }
}

/**
 * Verifica que la clínica pueda recibir una llamada más.
 *
 * Se comprueba al inicio de la llamada, no al final: cortar a medias a un
 * paciente que ya está describiendo un dolor sería peor que no contestarle.
 * Por eso el último minuto puede rebasar el cupo incluido.
 */
export async function assertCanTakeCall(tenantId: string, now: Date = new Date()): Promise<void> {
  const state = await loadPlanState(tenantId, now);

  if (!state.limits.voiceEnabled) {
    throw new PlanLimitError(
      state.isSuspended
        ? 'Tu prueba gratuita terminó. Activa un plan para seguir recibiendo llamadas.'
        : `Tu plan ${state.plan.name} no incluye telefonía con IA. Mejora a Clínica Pro para activarla.`,
      state.plan.slug,
      0,
      0
    );
  }

  const usedSeconds = await getUsage(tenantId, 'VOICE_SECONDS', now);
  const includedSeconds = state.limits.includedVoiceMinutes * 60;
  if (usedSeconds >= includedSeconds) {
    throw new PlanLimitError(
      `Se agotaron los ${state.limits.includedVoiceMinutes} minutos de voz incluidos en tu plan ${state.plan.name} este mes.`,
      state.plan.slug,
      Math.round(usedSeconds / 60),
      state.limits.includedVoiceMinutes
    );
  }
}

/** Resumen de plan y consumo para el panel. */
export async function getPlanSummary(tenantId: string, now: Date = new Date()) {
  const state = await loadPlanState(tenantId, now);
  const [suscripcion, doctors, appointments, voiceSeconds] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { billingCycle: true, currentPeriodEnd: true, mpPreapprovalId: true },
    }),
    db.doctor.count({ where: { tenantId, isActive: true } }),
    countAppointmentsThisPeriod(tenantId, now),
    getUsage(tenantId, 'VOICE_SECONDS', now),
  ]);

  return {
    planSlug: state.plan.slug,
    planName: state.plan.name,
    status: state.status,
    trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: state.trialDaysLeft,
    isSuspended: state.isSuspended,
    billingCycle: suscripcion.billingCycle,
    currentPeriodEnd: suscripcion.currentPeriodEnd?.toISOString() ?? null,
    /** Solo si existe, nunca el id: el panel no necesita la referencia de cobro. */
    tieneSuscripcion: suscripcion.mpPreapprovalId !== null,
    period: usagePeriod(now),
    limits: state.limits,
    usage: {
      doctors,
      appointments,
      voiceMinutes: Math.round(voiceSeconds / 60),
    },
  };
}
