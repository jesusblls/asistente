/**
 * Suscripción de la clínica a la plataforma, con Mercado Pago.
 *
 * Ojo con la distinción que es fácil de perder: `MercadoPagoService` cobra
 * **anticipos de pacientes a favor de la clínica**, mientras que esto cobra
 * **la mensualidad de la clínica a favor de la plataforma**. Son dos flujos de
 * dinero en direcciones distintas y, en producción, dos cuentas de Mercado
 * Pago distintas — de ahí que este módulo exija su propia credencial y no
 * reutilice la de los anticipos.
 *
 * Se usa la API de *preapproval* (suscripción recurrente): la clínica autoriza
 * una vez y Mercado Pago cobra solo cada periodo, avisando por webhook. La
 * plataforma nunca ve ni toca los datos de la tarjeta: la captura ocurre en el
 * `init_point` alojado por Mercado Pago.
 */
import { db, recordAudit, type AuditActor } from '@asistente/database';
import { createLogger } from '@asistente/observability';
import {
  PLANS,
  esPlanContratable,
  importeDelCiclo,
  mesesDelCiclo,
  type BillingCycle,
  type PlanSlug,
  type SubscriptionStatus,
} from '@asistente/shared-types';

const logger = createLogger('subscriptions');

const MP_API_BASE = process.env.MERCADOPAGO_API_BASE || 'https://api.mercadopago.com';

const SUSCRIPCION_ACTOR: AuditActor = { type: 'WEBHOOK', id: 'mercadopago-suscripciones' };

/**
 * Credencial de la cuenta de **la plataforma**.
 *
 * En desarrollo se acepta la credencial de anticipos como respaldo para poder
 * probar sin configurar dos cuentas. En producción no: si alguien dejara solo
 * `MERCADOPAGO_ACCESS_TOKEN` —que es la cuenta por donde entran los anticipos
 * de los pacientes— las mensualidades de las clínicas terminarían cobrándose
 * a favor de la cuenta equivocada, y eso no se nota hasta conciliar.
 */
function resolvePlatformToken(): string | undefined {
  const propio = process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN?.trim();
  if (propio) return propio;
  if (process.env.NODE_ENV === 'production') return undefined;
  return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || undefined;
}

/** Estados que devuelve Mercado Pago para un preapproval. */
type EstadoPreapproval = 'pending' | 'authorized' | 'paused' | 'cancelled';

interface RespuestaPreapproval {
  id?: string;
  status?: EstadoPreapproval;
  init_point?: string;
  external_reference?: string;
  next_payment_date?: string;
}

interface RespuestaCobroAutorizado {
  id?: number | string;
  preapproval_id?: string;
  status?: string;
  transaction_amount?: number;
}

/**
 * Traduce el estado de Mercado Pago al de la clínica.
 *
 * `pending` no activa nada: la clínica autorizó el link pero todavía no hay
 * cobro confirmado, y dar acceso ahí regalaría el servicio a quien abandone
 * el checkout a la mitad.
 */
export function mapearEstado(estado: EstadoPreapproval | undefined): SubscriptionStatus | null {
  switch (estado) {
    case 'authorized':
      return 'ACTIVE';
    case 'paused':
      // Mercado Pago pausa la suscripción cuando no logra cobrar.
      return 'PAST_DUE';
    case 'cancelled':
      return 'CANCELED';
    case 'pending':
      return null;
    default:
      return null;
  }
}

export interface CheckoutSuscripcionParams {
  tenantId: string;
  planSlug: string;
  billingCycle: BillingCycle;
  /** Correo de quien contrata; Mercado Pago lo exige para el preapproval. */
  payerEmail: string;
  /** A dónde regresa Mercado Pago tras autorizar. */
  backUrl: string;
  auditActor: AuditActor;
}

export interface CheckoutSuscripcionResult {
  preapprovalId: string;
  initPoint: string;
  planSlug: PlanSlug;
  billingCycle: BillingCycle;
  amountMxn: number;
  /** True cuando no hay credencial y el link es simulado para desarrollo. */
  simulado: boolean;
}

export class SubscriptionService {
  /**
   * Crea la suscripción en Mercado Pago y devuelve el link de autorización.
   *
   * No cambia el estado de la clínica: eso ocurre cuando Mercado Pago confirma
   * el primer cobro por webhook. Crear el link no es haber cobrado.
   */
  static async createCheckout(
    params: CheckoutSuscripcionParams
  ): Promise<CheckoutSuscripcionResult> {
    const { tenantId, billingCycle, payerEmail, backUrl, auditActor } = params;

    if (!esPlanContratable(params.planSlug)) {
      throw new Error(`El plan "${params.planSlug}" no se puede contratar`);
    }
    const planSlug = params.planSlug as PlanSlug;
    const plan = PLANS[planSlug];
    const amountMxn = importeDelCiclo(plan, billingCycle);

    const tenant = await db.tenant.findFirst({ where: { id: tenantId, isActive: true } });
    if (!tenant) throw new Error('Clínica no encontrada o inactiva');

    const accessToken = resolvePlatformToken();
    let preapprovalId: string;
    let initPoint: string;
    let simulado = false;

    if (accessToken) {
      const response = await fetch(`${MP_API_BASE}/preapproval`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: `AsistentePro · ${plan.name}`,
          external_reference: tenantId,
          payer_email: payerEmail,
          back_url: backUrl,
          status: 'pending',
          auto_recurring: {
            frequency: mesesDelCiclo(billingCycle),
            frequency_type: 'months',
            transaction_amount: amountMxn,
            currency_id: 'MXN',
          },
        }),
      });

      if (!response.ok) {
        const detalle = await response.text();
        logger.error('Mercado Pago rechazó la suscripción', detalle.slice(0, 300), {
          status: response.status,
          tenantId,
          planSlug,
        });
        throw new Error('Mercado Pago rechazó la creación de la suscripción');
      }

      const cuerpo = (await response.json()) as RespuestaPreapproval;
      if (!cuerpo.id || !cuerpo.init_point) {
        throw new Error('Mercado Pago devolvió una suscripción incompleta');
      }
      preapprovalId = String(cuerpo.id);
      initPoint = cuerpo.init_point;
    } else if (process.env.NODE_ENV === 'production') {
      // Un link simulado en producción sería un cobro que nunca ocurre: la
      // clínica creería haber contratado y el servicio se le cortaría igual.
      // Mejor fallar ruidosamente que entregar una promesa falsa de pago.
      throw new Error(
        'No se puede contratar: falta MERCADOPAGO_PLATFORM_ACCESS_TOKEN en el servidor'
      );
    } else {
      // Sin credencial no se inventa un cobro: se genera un link claramente
      // simulado para poder recorrer el flujo en local.
      preapprovalId = `sim-preapproval-${tenantId}-${Date.now().toString(36)}`;
      initPoint = `https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=${preapprovalId}`;
      simulado = true;
      logger.warn(
        'MERCADOPAGO_PLATFORM_ACCESS_TOKEN no configurado: link de suscripción simulado',
        { tenantId, planSlug }
      );
    }

    // Se guarda el preapproval y el plan pretendido, pero NO se activa: el
    // estado solo cambia cuando Mercado Pago confirma el cobro.
    await db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { mpPreapprovalId: preapprovalId, billingCycle, planSlug },
      });

      await recordAudit(
        {
          tenantId,
          actor: auditActor,
          action: 'UPDATE',
          entityType: 'TENANT',
          entityId: tenantId,
          metadata: {
            suscripcion: 'CHECKOUT_CREADO',
            planSlug,
            billingCycle,
            amountMxn,
            simulado,
          },
        },
        tx
      );
    });

    return { preapprovalId, initPoint, planSlug, billingCycle, amountMxn, simulado };
  }

  /**
   * Relee el preapproval en Mercado Pago y sincroniza el estado de la clínica.
   *
   * Es la fuente de verdad ante cualquier duda: el webhook solo avisa que algo
   * cambió, nunca se confía en el cuerpo de la notificación para decidir si
   * una clínica está al corriente.
   */
  static async syncFromPreapproval(preapprovalId: string): Promise<SubscriptionStatus | null> {
    const tenant = await db.tenant.findFirst({ where: { mpPreapprovalId: preapprovalId } });
    if (!tenant) {
      logger.warn('Notificación de suscripción sin clínica asociada', { preapprovalId });
      return null;
    }

    const accessToken = resolvePlatformToken();
    if (!accessToken) {
      logger.warn('Sin credencial de plataforma no se puede verificar la suscripción', {
        preapprovalId,
      });
      return null;
    }

    const response = await fetch(`${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      logger.error('No se pudo consultar la suscripción en Mercado Pago', undefined, {
        status: response.status,
        preapprovalId,
      });
      throw new Error('Mercado Pago no devolvió la suscripción');
    }

    const cuerpo = (await response.json()) as RespuestaPreapproval;
    const estado = mapearEstado(cuerpo.status);
    if (!estado) return null;

    await db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          subscriptionStatus: estado,
          // Al activarse, la prueba deja de regir: su fecha se limpia para que
          // `resolveTenantPlan` no la vuelva a considerar vencida.
          ...(estado === 'ACTIVE' && { trialEndsAt: null }),
        },
      });

      await recordAudit(
        {
          tenantId: tenant.id,
          actor: SUSCRIPCION_ACTOR,
          action: 'UPDATE',
          entityType: 'TENANT',
          entityId: tenant.id,
          metadata: {
            suscripcion: 'ESTADO_SINCRONIZADO',
            estadoMercadoPago: cuerpo.status,
            estado,
          },
        },
        tx
      );
    });

    logger.info('Suscripción sincronizada', { tenantId: tenant.id, estado });
    return estado;
  }

  /**
   * Procesa un cobro autorizado: extiende el periodo pagado.
   *
   * Es idempotente por `lastPaymentId`. Mercado Pago reintenta las
   * notificaciones que no recibieron 200, y sin esta guarda un reenvío
   * regalaría un mes de servicio en cada reintento.
   */
  static async handleAuthorizedPayment(paymentId: string): Promise<boolean> {
    const accessToken = resolvePlatformToken();
    if (!accessToken) {
      logger.warn('Sin credencial de plataforma no se puede verificar el cobro', { paymentId });
      return false;
    }

    const response = await fetch(
      `${MP_API_BASE}/authorized_payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      logger.error('No se pudo consultar el cobro en Mercado Pago', undefined, {
        status: response.status,
        paymentId,
      });
      throw new Error('Mercado Pago no devolvió el cobro');
    }

    const cobro = (await response.json()) as RespuestaCobroAutorizado;
    if (!cobro.preapproval_id) {
      logger.warn('Cobro sin suscripción asociada', { paymentId });
      return false;
    }

    // Solo un cobro aprobado extiende el servicio. Uno rechazado se ignora
    // aquí: el cambio de estado llega por la notificación del preapproval.
    if (cobro.status !== 'approved' && cobro.status !== 'processed') {
      logger.info('Cobro de suscripción no aprobado; no se extiende el periodo', {
        paymentId,
        estado: cobro.status,
      });
      return false;
    }

    const tenant = await db.tenant.findFirst({
      where: { mpPreapprovalId: cobro.preapproval_id },
    });
    if (!tenant) {
      logger.warn('Cobro de una suscripción sin clínica asociada', {
        paymentId,
        preapprovalId: cobro.preapproval_id,
      });
      return false;
    }

    if (tenant.lastPaymentId === String(paymentId)) {
      logger.info('Cobro ya procesado; se ignora el reenvío', { paymentId, tenantId: tenant.id });
      return false;
    }

    const meses = mesesDelCiclo((tenant.billingCycle as BillingCycle) || 'MONTHLY');
    // El periodo se encadena desde el final del anterior cuando sigue vigente,
    // para que un cobro adelantado no le regale días a la clínica ni se los
    // quite. Si ya venció, se cuenta desde hoy.
    const ahora = new Date();
    const base =
      tenant.currentPeriodEnd && tenant.currentPeriodEnd > ahora ? tenant.currentPeriodEnd : ahora;
    const nuevoFin = new Date(base);
    nuevoFin.setMonth(nuevoFin.getMonth() + meses);

    await db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          subscriptionStatus: 'ACTIVE',
          currentPeriodEnd: nuevoFin,
          lastPaymentId: String(paymentId),
          trialEndsAt: null,
        },
      });

      await recordAudit(
        {
          tenantId: tenant.id,
          actor: SUSCRIPCION_ACTOR,
          action: 'UPDATE',
          entityType: 'TENANT',
          entityId: tenant.id,
          metadata: {
            suscripcion: 'COBRO_APLICADO',
            paymentId: String(paymentId),
            montoMxn: cobro.transaction_amount,
            periodoHasta: nuevoFin.toISOString(),
          },
        },
        tx
      );
    });

    logger.info('Cobro de suscripción aplicado', {
      tenantId: tenant.id,
      paymentId,
      periodoHasta: nuevoFin.toISOString(),
    });
    return true;
  }

  /**
   * Cancela la suscripción en Mercado Pago.
   *
   * El acceso **no** se corta de inmediato: la clínica ya pagó el periodo en
   * curso y `currentPeriodEnd` lo respeta. Cortar al momento de cancelar sería
   * cobrar un mes y entregar menos.
   */
  static async cancel(tenantId: string, auditActor: AuditActor): Promise<void> {
    const tenant = await db.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new Error('Clínica no encontrada');
    if (!tenant.mpPreapprovalId) throw new Error('Esta clínica no tiene una suscripción activa');

    const accessToken = resolvePlatformToken();
    if (accessToken) {
      const response = await fetch(
        `${MP_API_BASE}/preapproval/${encodeURIComponent(tenant.mpPreapprovalId)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'cancelled' }),
        }
      );
      if (!response.ok) {
        const detalle = await response.text();
        logger.error('Mercado Pago rechazó la cancelación', detalle.slice(0, 300), {
          status: response.status,
          tenantId,
        });
        throw new Error('Mercado Pago rechazó la cancelación de la suscripción');
      }
    }

    await db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: 'CANCELED' },
      });

      await recordAudit(
        {
          tenantId,
          actor: auditActor,
          action: 'UPDATE',
          entityType: 'TENANT',
          entityId: tenantId,
          metadata: {
            suscripcion: 'CANCELADA',
            accesoHasta: tenant.currentPeriodEnd?.toISOString() ?? null,
          },
        },
        tx
      );
    });
  }
}
