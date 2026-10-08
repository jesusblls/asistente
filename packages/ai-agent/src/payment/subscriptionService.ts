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
import { db, recordAudit, type AuditActor, type Prisma } from '@asistente/database';
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

type Tx = Prisma.TransactionClient;

/**
 * Bloquea la fila de la clínica hasta que termine la transacción.
 *
 * Mercado Pago avisa del mismo alta por dos vías casi simultáneas (el
 * preapproval autorizado y el primer cobro), y la clínica puede abrir otro
 * checkout mientras tanto. Sin el bloqueo, dos webhooks podrían promover el
 * mismo cambio dos veces o promover un pendiente que otro checkout acaba de
 * sustituir.
 */
async function bloquearClinica(tx: Tx, tenantId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
}

/**
 * Busca la clínica dueña de un preapproval, sea el activo o el pendiente.
 *
 * Mientras un cambio de plan espera su cobro conviven dos autorizaciones: la
 * vigente sigue cobrando y sus notificaciones deben seguir encontrando a la
 * clínica, y la nueva debe encontrarla para poder promoverse.
 */
async function buscarClinicaPorPreapproval(preapprovalId: string) {
  if (!preapprovalId) return null;
  return db.tenant.findFirst({
    where: {
      OR: [{ mpPreapprovalId: preapprovalId }, { pendingPreapprovalId: preapprovalId }],
    },
  });
}

type TenantRow = Awaited<ReturnType<Tx['tenant']['findUniqueOrThrow']>>;

/**
 * Promueve el cambio pendiente a activo.
 *
 * Debe llamarse con la fila ya bloqueada y releída (`actual`), y solo cuando
 * `actual.pendingPreapprovalId` es el preapproval cuyo cobro se confirmó.
 * Devuelve la fila actualizada y el preapproval que dejó de estar activo, para
 * cancelarlo fuera de la transacción.
 */
async function promoverPendiente(
  tx: Tx,
  actual: TenantRow,
  origen: string
): Promise<{ tenant: TenantRow; anterior: string | null }> {
  const tenantId = actual.id;
  const preapprovalId = actual.pendingPreapprovalId!;
  const planSlug = actual.pendingPlanSlug ?? actual.planSlug;
  const billingCycle = actual.pendingBillingCycle ?? actual.billingCycle;

  const tenant = await tx.tenant.update({
    where: { id: tenantId },
    data: {
      planSlug,
      billingCycle,
      mpPreapprovalId: preapprovalId,
      pendingPlanSlug: null,
      pendingBillingCycle: null,
      pendingPreapprovalId: null,
      subscriptionStatus: 'ACTIVE',
      // Al activarse, la prueba deja de regir: su fecha se limpia para que
      // `resolveTenantPlan` no la vuelva a considerar vencida.
      trialEndsAt: null,
    },
  });

  await recordAudit(
    {
      tenantId,
      actor: SUSCRIPCION_ACTOR,
      action: 'UPDATE',
      entityType: 'TENANT',
      entityId: tenantId,
      metadata: {
        suscripcion: 'PLAN_ACTIVADO',
        origen,
        planAnterior: actual.planSlug,
        planNuevo: planSlug,
        billingCycle,
        preapprovalAnterior: actual.mpPreapprovalId,
      },
    },
    tx
  );

  // La autorización anterior solo se cancela si seguía viva: una suscripción
  // que la clínica ya canceló no cobra, y pedirlo de nuevo solo generaría una
  // alerta falsa de "cancelar a mano" si Mercado Pago lo rechaza.
  const anteriorViva =
    actual.mpPreapprovalId !== null &&
    actual.mpPreapprovalId !== preapprovalId &&
    actual.subscriptionStatus !== 'CANCELED';

  return { tenant, anterior: anteriorViva ? actual.mpPreapprovalId : null };
}

/** Pide a Mercado Pago cancelar un preapproval. Sin credencial no hay nada que cancelar. */
async function cancelarPreapprovalEnMercadoPago(preapprovalId: string, tenantId: string) {
  const accessToken = resolvePlatformToken();
  if (!accessToken) return;

  const response = await fetch(`${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  if (!response.ok) {
    const detalle = await response.text();
    logger.error('Mercado Pago rechazó la cancelación', detalle.slice(0, 300), {
      status: response.status,
      tenantId,
      preapprovalId,
    });
    throw new Error('Mercado Pago rechazó la cancelación de la suscripción');
  }
}

/**
 * Cancela una autorización que ya no es la de la clínica, sin propagar el
 * error. El cambio de plan ya está pagado y confirmado: revertirlo porque
 * Mercado Pago no respondió castigaría a la clínica por un fallo ajeno. El
 * error queda en el log para cancelarla a mano y no cobrar doble.
 */
async function cancelarSinBloquear(preapprovalId: string, tenantId: string, motivo: string) {
  try {
    await cancelarPreapprovalEnMercadoPago(preapprovalId, tenantId);
    logger.info('Suscripción sustituida cancelada en Mercado Pago', {
      tenantId,
      preapprovalId,
      motivo,
    });
  } catch (error) {
    logger.error(
      'No se pudo cancelar la suscripción sustituida; cancelarla a mano para no cobrar doble',
      error,
      { tenantId, preapprovalId, motivo }
    );
  }
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

    // El cambio se guarda como PENDIENTE, nunca en `planSlug` ni en
    // `mpPreapprovalId`: los cupos se derivan del plan activo, así que escribir
    // ahí regalaría el plan pedido a quien solo abrió el link, y pisar la
    // autorización activa dejaría huérfana una suscripción que Mercado Pago
    // sigue cobrando. La promoción ocurre cuando el webhook confirma el cobro.
    const pendienteReemplazado = await db.$transaction(async (tx) => {
      await bloquearClinica(tx, tenantId);
      // El pendiente a sustituir se lee bajo el bloqueo, no del `tenant` de
      // arriba: mientras se esperaba a Mercado Pago, un webhook pudo haberlo
      // promovido a activo (y cancelarlo sería cortar una suscripción pagada)
      // u otro checkout simultáneo pudo haber dejado el suyo.
      const { pendingPreapprovalId: anterior } = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { pendingPreapprovalId: true },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          pendingPlanSlug: planSlug,
          pendingBillingCycle: billingCycle,
          pendingPreapprovalId: preapprovalId,
        },
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
            // El plan no cambia aquí; se deja explícito para quien lea la bitácora.
            planActivo: tenant.planSlug,
            pendienteDePago: true,
          },
        },
        tx
      );
      return anterior;
    });

    // Un checkout anterior sin confirmar queda sustituido. Si la clínica llegó
    // a autorizarlo, Mercado Pago lo cobraría sin que ninguna clínica lo
    // reconozca: se cancela, sin bloquear el alta del nuevo.
    if (pendienteReemplazado && pendienteReemplazado !== preapprovalId) {
      await cancelarSinBloquear(pendienteReemplazado, tenantId, 'CHECKOUT_REEMPLAZADO');
    }

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
    const tenant = await buscarClinicaPorPreapproval(preapprovalId);
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

    // La decisión se toma sobre la fila bloqueada y releída: entre la lectura
    // de arriba y la respuesta de Mercado Pago, otro webhook pudo promover el
    // pendiente o un checkout sustituirlo, y aplicar este estado sobre la
    // suscripción equivocada cortaría (o reviviría) a la clínica por error.
    const aplicado = await db.$transaction(async (tx) => {
      await bloquearClinica(tx, tenant.id);
      const actual = await tx.tenant.findUniqueOrThrow({ where: { id: tenant.id } });

      if (actual.pendingPreapprovalId === preapprovalId) {
        // Cambio de plan que espera su cobro. Que la clínica haya autorizado
        // la tarjeta NO es haber pagado: la promoción la decide el primer
        // cobro aprobado (`handleAuthorizedPayment`). Si el pendiente se
        // cancela antes, se descarta; la suscripción vigente no se toca.
        if (estado !== 'CANCELED') return null;

        await tx.tenant.update({
          where: { id: actual.id },
          data: { pendingPlanSlug: null, pendingBillingCycle: null, pendingPreapprovalId: null },
        });
        await recordAudit(
          {
            tenantId: actual.id,
            actor: SUSCRIPCION_ACTOR,
            action: 'UPDATE',
            entityType: 'TENANT',
            entityId: actual.id,
            metadata: {
              suscripcion: 'CAMBIO_PENDIENTE_DESCARTADO',
              estadoMercadoPago: cuerpo.status,
              planPendiente: actual.pendingPlanSlug,
            },
          },
          tx
        );
        return null;
      }

      // Ya no es ni la activa ni la pendiente (p. ej. la autorización vieja
      // que se canceló al promover un cambio de plan): no rige a la clínica.
      if (actual.mpPreapprovalId !== preapprovalId) return null;

      await tx.tenant.update({
        where: { id: actual.id },
        data: {
          subscriptionStatus: estado,
          // Al activarse, la prueba deja de regir: su fecha se limpia para que
          // `resolveTenantPlan` no la vuelva a considerar vencida.
          ...(estado === 'ACTIVE' && { trialEndsAt: null }),
        },
      });

      await recordAudit(
        {
          tenantId: actual.id,
          actor: SUSCRIPCION_ACTOR,
          action: 'UPDATE',
          entityType: 'TENANT',
          entityId: actual.id,
          metadata: {
            suscripcion: 'ESTADO_SINCRONIZADO',
            estadoMercadoPago: cuerpo.status,
            estado,
          },
        },
        tx
      );
      return estado;
    });

    if (aplicado) {
      logger.info('Suscripción sincronizada', { tenantId: tenant.id, estado: aplicado });
    } else {
      logger.info('Notificación de un preapproval que no rige a la clínica; sin cambios', {
        tenantId: tenant.id,
        preapprovalId,
        estadoMercadoPago: cuerpo.status,
      });
    }
    return aplicado;
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

    const preapprovalId = cobro.preapproval_id;
    const encontrada = await buscarClinicaPorPreapproval(preapprovalId);
    if (!encontrada) {
      // Un cobro aprobado que no corresponde a ninguna clínica es dinero
      // recibido sin acreditar (p. ej. un checkout sustituido cuya
      // cancelación falló): se registra como error para reembolsarlo.
      logger.error(
        'Cobro aprobado de una suscripción sin clínica asociada; revisar y reembolsar',
        undefined,
        { paymentId, preapprovalId, montoMxn: cobro.transaction_amount }
      );
      return false;
    }

    const resultado = await db.$transaction(async (tx) => {
      // Bloqueo y relectura: la idempotencia por `lastPaymentId` y la
      // promoción del pendiente deben decidirse sobre el estado más reciente,
      // no sobre el que se leyó antes de esperar a Mercado Pago.
      await bloquearClinica(tx, encontrada.id);

      let tenant = await tx.tenant.findUniqueOrThrow({ where: { id: encontrada.id } });
      if (tenant.lastPaymentId === String(paymentId)) {
        return { aplicado: false as const, motivo: 'REENVIO' as const };
      }

      // El primer cobro aprobado del cambio pendiente es la confirmación de
      // pago: promueve el plan antes de extender el periodo, para que los
      // meses se cuenten con el ciclo recién contratado.
      let anterior: string | null = null;
      if (tenant.pendingPreapprovalId === preapprovalId) {
        const promocion = await promoverPendiente(tx, tenant, 'PRIMER_COBRO');
        anterior = promocion.anterior;
        tenant = promocion.tenant;
      } else if (tenant.mpPreapprovalId !== preapprovalId) {
        // Ni activo ni pendiente: otro checkout lo sustituyó entre la lectura
        // y el bloqueo. No se acredita a la clínica un cobro que ya no es suyo.
        return { aplicado: false as const, motivo: 'SUSTITUIDO' as const };
      }

      const meses = mesesDelCiclo((tenant.billingCycle as BillingCycle) || 'MONTHLY');
      // El periodo se encadena desde el final del anterior cuando sigue
      // vigente, para que un cobro adelantado no le regale días a la clínica
      // ni se los quite. Si ya venció, se cuenta desde hoy.
      const ahora = new Date();
      const base =
        tenant.currentPeriodEnd && tenant.currentPeriodEnd > ahora ? tenant.currentPeriodEnd : ahora;
      const nuevoFin = new Date(base);
      nuevoFin.setMonth(nuevoFin.getMonth() + meses);

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

      return { aplicado: true as const, anterior, periodoHasta: nuevoFin };
    });

    if (!resultado.aplicado) {
      if (resultado.motivo === 'REENVIO') {
        logger.info('Cobro ya procesado; se ignora el reenvío', {
          paymentId,
          tenantId: encontrada.id,
        });
      } else {
        // Dinero cobrado sobre una autorización que la clínica ya sustituyó
        // (su cancelación falló o perdió una carrera). No se acredita, pero
        // tampoco puede pasar inadvertido: hay que reembolsarlo.
        logger.error(
          'Cobro aprobado de una suscripción sustituida; revisar y reembolsar a la clínica',
          undefined,
          { paymentId, tenantId: encontrada.id, preapprovalId, montoMxn: cobro.transaction_amount }
        );
      }
      return false;
    }

    // Fuera de la transacción: la llamada a Mercado Pago no debe retener el
    // bloqueo de la fila, y su fallo no debe deshacer un cobro ya confirmado.
    if (resultado.anterior) {
      await cancelarSinBloquear(resultado.anterior, encontrada.id, 'PLAN_SUSTITUIDO');
    }

    logger.info('Cobro de suscripción aplicado', {
      tenantId: encontrada.id,
      paymentId,
      periodoHasta: resultado.periodoHasta.toISOString(),
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
    const activa = tenant.mpPreapprovalId;
    const pendiente = tenant.pendingPreapprovalId;
    if (!activa && !pendiente) throw new Error('Esta clínica no tiene una suscripción activa');

    if (activa) await cancelarPreapprovalEnMercadoPago(activa, tenantId);

    // Un cambio de plan a medio contratar también se cancela: si la clínica
    // lo autorizara después, empezaría a cobrarse una suscripción que pidió
    // cancelar. Si es lo único que hay, su fallo sí se reporta a quien cancela.
    if (pendiente) {
      if (activa) await cancelarSinBloquear(pendiente, tenantId, 'SUSCRIPCION_CANCELADA');
      else await cancelarPreapprovalEnMercadoPago(pendiente, tenantId);
    }

    const canceladas = [activa, pendiente].filter((id): id is string => Boolean(id));

    await db.$transaction(async (tx) => {
      // Relectura bajo bloqueo: si el pendiente se promovió mientras se
      // hablaba con Mercado Pago, la que hoy rige es justo la que se canceló.
      await bloquearClinica(tx, tenantId);
      const actual = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const rigeUnaCancelada =
        actual.mpPreapprovalId !== null && canceladas.includes(actual.mpPreapprovalId);
      const pendienteCancelado =
        actual.pendingPreapprovalId !== null && canceladas.includes(actual.pendingPreapprovalId);

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(rigeUnaCancelada && { subscriptionStatus: 'CANCELED' }),
          ...(pendienteCancelado && {
            pendingPlanSlug: null,
            pendingBillingCycle: null,
            pendingPreapprovalId: null,
          }),
        },
      });

      await recordAudit(
        {
          tenantId,
          actor: auditActor,
          action: 'UPDATE',
          entityType: 'TENANT',
          entityId: tenantId,
          metadata: {
            suscripcion: rigeUnaCancelada ? 'CANCELADA' : 'CAMBIO_PENDIENTE_CANCELADO',
            planPendienteCancelado: pendienteCancelado ? actual.pendingPlanSlug : null,
            accesoHasta: actual.currentPeriodEnd?.toISOString() ?? null,
          },
        },
        tx
      );
    });
  }
}
