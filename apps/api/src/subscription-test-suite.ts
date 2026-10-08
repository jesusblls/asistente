/**
 * Suite de suscripciones recurrentes con Mercado Pago.
 *
 * No hay credenciales de Mercado Pago en este entorno, así que se sustituye
 * `fetch` y se ejercitan los caminos reales del servicio contra respuestas
 * representativas de su API. Lo que se protege aquí es dinero: que se cobre el
 * importe anunciado, que un reenvío del webhook no regale un mes, y que
 * cancelar no corte un servicio ya pagado.
 */
import { db, getPlanSummary, resolveTenantPlan } from '@asistente/database';
import { buildServer } from './server.js';
import { computeMercadoPagoSignature } from './lib/webhookSecurity.js';
import { SubscriptionService, mapearEstado } from '@asistente/ai-agent';
import { PLANS, importeDelCiclo } from '@asistente/shared-types';
import type { AuditActor } from '@asistente/database';

process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN = 'test-platform-token';
process.env.MERCADOPAGO_API_BASE = 'https://api.mercadopago.test';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-webhook-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-con-al-menos-32-caracteres';

const ACTOR: AuditActor = { type: 'USER', id: 'u-test', email: 'admin@clinica.mx', role: 'ADMIN' };

interface EstadoMock {
  preapprovalStatus: string;
  pagoStatus: string;
  preapprovalIdDelPago: string;
  montoPago: number;
  /** Id que devolverá el siguiente alta. Mercado Pago nunca repite uno. */
  siguientePreapprovalId: string;
  /** Simula que Mercado Pago falla al cancelar una autorización. */
  cancelacionFalla: boolean;
  /** Cuerpos enviados a Mercado Pago, para poder inspeccionarlos. */
  enviados: { url: string; method: string; body: Record<string, unknown> | null }[];
}

const mock: EstadoMock = {
  preapprovalStatus: 'authorized',
  pagoStatus: 'approved',
  preapprovalIdDelPago: '',
  montoPago: 3499,
  siguientePreapprovalId: 'preapproval-mp-123',
  cancelacionFalla: false,
  enviados: [],
};

const fetchOriginal = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input.url);
  const method = (init?.method || 'GET').toUpperCase();
  let body: Record<string, unknown> | null = null;
  try {
    body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  mock.enviados.push({ url, method, body });

  if (url.includes('/authorized_payments/')) {
    return new Response(
      JSON.stringify({
        id: url.split('/').pop(),
        preapproval_id: mock.preapprovalIdDelPago,
        status: mock.pagoStatus,
        transaction_amount: mock.montoPago,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  if (url.includes('/preapproval')) {
    if (method === 'POST') {
      const id = mock.siguientePreapprovalId;
      return new Response(
        JSON.stringify({
          id,
          status: 'pending',
          init_point: `https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=${id}`,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      );
    }
    if (method === 'PUT') {
      if (mock.cancelacionFalla) {
        return new Response('{"message":"internal_error"}', { status: 500 });
      }
      return new Response(JSON.stringify({ id: mock.siguientePreapprovalId, status: 'cancelled' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ id: url.split('/').pop(), status: mock.preapprovalStatus }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  return new Response('{}', { status: 404 });
}) as typeof fetch;

async function run() {
  let passed = 0;
  let failed = 0;
  const creados: string[] = [];

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed += 1;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed += 1;
    }
  }

  async function nuevaClinica(extra: Record<string, unknown> = {}) {
    const sufijo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const t = await db.tenant.create({
      data: {
        name: `Clínica Sub ${sufijo}`,
        slug: `clinica-sub-${sufijo}`,
        phoneE164: '+525577770000',
        planSlug: 'trial',
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
        ...extra,
      },
    });
    creados.push(t.id);
    return t;
  }

  console.log('\n🧪 SUITE DE SUSCRIPCIONES (MERCADO PAGO)\n');

  try {
    // ---------------------------------------------------------------------
    console.log('▶ Importes: se cobra lo que anuncia la landing');
    // ---------------------------------------------------------------------
    assert(
      importeDelCiclo(PLANS['clinica-pro'], 'MONTHLY') === 3499,
      'El cargo mensual de Clínica Pro es el precio anunciado ($3,499)'
    );
    assert(
      importeDelCiclo(PLANS['clinica-pro'], 'ANNUAL') === 2799 * 12,
      'El cargo anual es el precio mensual anunciado por doce ($2,799 × 12 = $33,588)'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Traducción de estados de Mercado Pago');
    // ---------------------------------------------------------------------
    assert(mapearEstado('authorized') === 'ACTIVE', 'authorized activa la suscripción');
    assert(mapearEstado('paused') === 'PAST_DUE', 'paused (no se pudo cobrar) marca pago vencido');
    assert(mapearEstado('cancelled') === 'CANCELED', 'cancelled cancela la suscripción');
    assert(
      mapearEstado('pending') === null,
      'pending no activa nada: autorizar el link no es haber pagado'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Alta de la suscripción');
    // ---------------------------------------------------------------------
    const clinica = await nuevaClinica();
    mock.enviados = [];

    const checkout = await SubscriptionService.createCheckout({
      tenantId: clinica.id,
      planSlug: 'clinica-pro',
      billingCycle: 'MONTHLY',
      payerEmail: 'admin@clinica.mx',
      backUrl: 'http://localhost:3001/dashboard/suscripcion',
      auditActor: ACTOR,
    });

    const envio = mock.enviados.find((e) => e.method === 'POST');
    const recurrencia = envio?.body?.auto_recurring as Record<string, unknown> | undefined;
    assert(
      recurrencia?.transaction_amount === 3499 &&
        recurrencia?.currency_id === 'MXN' &&
        recurrencia?.frequency === 1 &&
        recurrencia?.frequency_type === 'months',
      'Se pide a Mercado Pago un cargo mensual de $3,499 MXN'
    );
    assert(
      envio?.body?.external_reference === clinica.id,
      'La suscripción queda referenciada a la clínica que la contrata'
    );
    assert(
      checkout.initPoint.startsWith('https://') && !checkout.simulado,
      'Se devuelve el link alojado por Mercado Pago, donde ocurre la captura de la tarjeta'
    );

    const trasCheckout = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    assert(
      trasCheckout.subscriptionStatus === 'TRIALING' && trasCheckout.currentPeriodEnd === null,
      'Crear el link NO activa el plan: eso lo decide el cobro confirmado'
    );
    assert(
      trasCheckout.planSlug === 'trial' && trasCheckout.mpPreapprovalId === null,
      'Abrir el checkout NO cambia el plan activo ni la autorización vigente'
    );
    assert(
      trasCheckout.pendingPreapprovalId === 'preapproval-mp-123' &&
        trasCheckout.pendingPlanSlug === 'clinica-pro' &&
        trasCheckout.pendingBillingCycle === 'MONTHLY',
      'El plan pedido y su autorización quedan como cambio pendiente de pago'
    );
    const resumenPendiente = await getPlanSummary(clinica.id);
    assert(
      resumenPendiente.planSlug === 'trial' &&
        JSON.stringify(resumenPendiente.limits) === JSON.stringify(PLANS.trial.limits) &&
        resumenPendiente.planPendiente?.planSlug === 'clinica-pro',
      'Los cupos siguen siendo los de la prueba: abrir el link de Pro no regala Pro'
    );

    let rechazoTrial = false;
    try {
      await SubscriptionService.createCheckout({
        tenantId: clinica.id,
        planSlug: 'trial',
        billingCycle: 'MONTHLY',
        payerEmail: 'admin@clinica.mx',
        backUrl: 'x',
        auditActor: ACTOR,
      });
    } catch {
      rechazoTrial = true;
    }
    assert(rechazoTrial, 'La prueba gratuita no se puede "contratar"');

    // ---------------------------------------------------------------------
    console.log('\n▶ Sincronización desde Mercado Pago');
    // ---------------------------------------------------------------------
    mock.preapprovalStatus = 'authorized';
    const estado = await SubscriptionService.syncFromPreapproval('preapproval-mp-123');
    const autorizada = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    assert(
      estado === null &&
        autorizada.planSlug === 'trial' &&
        autorizada.subscriptionStatus === 'TRIALING' &&
        autorizada.pendingPreapprovalId === 'preapproval-mp-123',
      'Autorizar la tarjeta no promueve el plan: lo decide el primer cobro aprobado'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Cobros periódicos');
    // ---------------------------------------------------------------------
    mock.preapprovalIdDelPago = 'preapproval-mp-123';
    mock.pagoStatus = 'approved';

    const aplicado = await SubscriptionService.handleAuthorizedPayment('pago-001');
    const pagada = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    const finPrimerPeriodo = pagada.currentPeriodEnd;
    assert(
      aplicado && pagada.subscriptionStatus === 'ACTIVE' && finPrimerPeriodo !== null,
      'Un cobro aprobado activa la clínica y fija hasta cuándo está pagada'
    );
    assert(
      pagada.planSlug === 'clinica-pro' &&
        pagada.mpPreapprovalId === 'preapproval-mp-123' &&
        pagada.pendingPreapprovalId === null &&
        pagada.pendingPlanSlug === null,
      'El primer cobro aprobado promueve el cambio pendiente a plan activo'
    );
    assert(
      pagada.trialEndsAt === null,
      'Al activarse se limpia la prueba, para que no la vuelva a suspender al vencer'
    );

    const diasCubiertos = Math.round(
      (finPrimerPeriodo!.getTime() - Date.now()) / 86_400_000
    );
    assert(
      diasCubiertos >= 27 && diasCubiertos <= 32,
      `Un cobro mensual cubre alrededor de un mes (cubrió ${diasCubiertos} días)`
    );

    // Idempotencia: Mercado Pago reintenta las notificaciones sin 200.
    const reenvio = await SubscriptionService.handleAuthorizedPayment('pago-001');
    const trasReenvio = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    assert(
      !reenvio && trasReenvio.currentPeriodEnd?.getTime() === finPrimerPeriodo!.getTime(),
      'Reenviar la misma notificación NO regala otro mes de servicio'
    );

    // El segundo cobro encadena desde el fin del periodo vigente.
    await SubscriptionService.handleAuthorizedPayment('pago-002');
    const dosPeriodos = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    const saltoMs = dosPeriodos.currentPeriodEnd!.getTime() - finPrimerPeriodo!.getTime();
    assert(
      saltoMs > 27 * 86_400_000,
      'Un cobro adelantado encadena desde el periodo vigente, no desde hoy (no le quita días a la clínica)'
    );

    mock.pagoStatus = 'rejected';
    const rechazado = await SubscriptionService.handleAuthorizedPayment('pago-003');
    const trasRechazo = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    assert(
      !rechazado && trasRechazo.currentPeriodEnd?.getTime() === dosPeriodos.currentPeriodEnd?.getTime(),
      'Un cobro rechazado no extiende el servicio'
    );

    mock.preapprovalStatus = 'paused';
    await SubscriptionService.syncFromPreapproval('preapproval-mp-123');
    const pausada = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    assert(pausada.subscriptionStatus === 'PAST_DUE', 'Una suscripción pausada marca pago vencido');

    mock.preapprovalStatus = 'authorized';
    const reautorizada = await SubscriptionService.syncFromPreapproval('preapproval-mp-123');
    assert(
      reautorizada === 'ACTIVE',
      'Cuando Mercado Pago reanuda la suscripción vigente, la clínica vuelve a quedar activa'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Ciclo anual');
    // ---------------------------------------------------------------------
    const anual = await nuevaClinica();
    mock.siguientePreapprovalId = 'preapproval-mp-anual';
    mock.enviados = [];
    await SubscriptionService.createCheckout({
      tenantId: anual.id,
      planSlug: 'consultorio',
      billingCycle: 'ANNUAL',
      payerEmail: 'admin@clinica.mx',
      backUrl: 'x',
      auditActor: ACTOR,
    });
    const envioAnual = mock.enviados.find((e) => e.method === 'POST');
    const recurrenciaAnual = envioAnual?.body?.auto_recurring as Record<string, unknown> | undefined;
    assert(
      recurrenciaAnual?.frequency === 12 &&
        recurrenciaAnual?.transaction_amount === 1199 * 12,
      'El ciclo anual pide un cargo cada 12 meses por el precio anunciado × 12'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Cambio de plan de una clínica activa');
    // ---------------------------------------------------------------------
    const finVigente = new Date(Date.now() + 20 * 86_400_000);
    const activaConsultorio = await nuevaClinica({
      planSlug: 'consultorio',
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: null,
      mpPreapprovalId: 'preapproval-mp-viejo',
      billingCycle: 'MONTHLY',
      currentPeriodEnd: finVigente,
    });
    mock.siguientePreapprovalId = 'preapproval-mp-nuevo';
    await SubscriptionService.createCheckout({
      tenantId: activaConsultorio.id,
      planSlug: 'clinica-pro',
      billingCycle: 'ANNUAL',
      payerEmail: 'admin@clinica.mx',
      backUrl: 'x',
      auditActor: ACTOR,
    });
    const enCambio = await db.tenant.findUniqueOrThrow({ where: { id: activaConsultorio.id } });
    assert(
      enCambio.planSlug === 'consultorio' &&
        enCambio.mpPreapprovalId === 'preapproval-mp-viejo' &&
        resolveTenantPlan(enCambio).limits.maxDoctors === PLANS.consultorio.limits.maxDoctors,
      'Una clínica activa que abre el checkout de Pro conserva su plan y cupos hasta pagar'
    );

    // La suscripción vieja sigue cobrando mientras tanto: sus notificaciones
    // deben seguir encontrando a la clínica.
    mock.preapprovalIdDelPago = 'preapproval-mp-viejo';
    mock.pagoStatus = 'approved';
    const cobroViejo = await SubscriptionService.handleAuthorizedPayment('pago-viejo-001');
    const trasCobroViejo = await db.tenant.findUniqueOrThrow({ where: { id: activaConsultorio.id } });
    assert(
      cobroViejo &&
        trasCobroViejo.planSlug === 'consultorio' &&
        trasCobroViejo.pendingPreapprovalId === 'preapproval-mp-nuevo',
      'Un cobro de la suscripción vigente se aplica a la clínica sin promover el cambio pendiente'
    );
    mock.preapprovalStatus = 'authorized';
    assert(
      (await SubscriptionService.syncFromPreapproval('preapproval-mp-viejo')) === 'ACTIVE',
      'Una notificación del preapproval vigente sigue resolviendo la clínica durante el cambio'
    );

    mock.preapprovalStatus = 'paused';
    const pendientePausado = await SubscriptionService.syncFromPreapproval('preapproval-mp-nuevo');
    const trasPausaPendiente = await db.tenant.findUniqueOrThrow({
      where: { id: activaConsultorio.id },
    });
    assert(
      pendientePausado === null &&
        trasPausaPendiente.subscriptionStatus === 'ACTIVE' &&
        trasPausaPendiente.planSlug === 'consultorio',
      'Un problema con el preapproval pendiente no degrada la suscripción vigente'
    );

    mock.preapprovalIdDelPago = 'preapproval-mp-nuevo';
    mock.enviados = [];
    const primerCobroNuevo = await SubscriptionService.handleAuthorizedPayment('pago-nuevo-001');
    const promovida = await db.tenant.findUniqueOrThrow({ where: { id: activaConsultorio.id } });
    assert(
      primerCobroNuevo &&
        promovida.planSlug === 'clinica-pro' &&
        promovida.billingCycle === 'ANNUAL' &&
        promovida.mpPreapprovalId === 'preapproval-mp-nuevo' &&
        promovida.pendingPreapprovalId === null,
      'El primer cobro aprobado del preapproval nuevo promueve el plan y el ciclo'
    );
    assert(
      mock.enviados.some(
        (e) =>
          e.method === 'PUT' &&
          e.url.endsWith('/preapproval/preapproval-mp-viejo') &&
          e.body?.status === 'cancelled'
      ),
      'Tras promover, se cancela en Mercado Pago la suscripción anterior para no cobrar doble'
    );

    mock.preapprovalStatus = 'cancelled';
    const avisoViejo = await SubscriptionService.syncFromPreapproval('preapproval-mp-viejo');
    const trasAvisoViejo = await db.tenant.findUniqueOrThrow({ where: { id: activaConsultorio.id } });
    assert(
      avisoViejo === null && trasAvisoViejo.subscriptionStatus === 'ACTIVE',
      'La notificación de cancelación de la suscripción sustituida no cancela a la clínica'
    );

    // Si Mercado Pago falla al cancelar la anterior, el cambio pagado se
    // activa igual: el error se registra para cancelarla a mano.
    const conFalla = await nuevaClinica({
      planSlug: 'consultorio',
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: null,
      mpPreapprovalId: 'preapproval-mp-viejo-2',
      billingCycle: 'MONTHLY',
      currentPeriodEnd: finVigente,
    });
    mock.siguientePreapprovalId = 'preapproval-mp-nuevo-2';
    await SubscriptionService.createCheckout({
      tenantId: conFalla.id,
      planSlug: 'clinica-pro',
      billingCycle: 'MONTHLY',
      payerEmail: 'admin@clinica.mx',
      backUrl: 'x',
      auditActor: ACTOR,
    });
    mock.preapprovalIdDelPago = 'preapproval-mp-nuevo-2';
    mock.pagoStatus = 'approved';
    mock.cancelacionFalla = true;
    let promoviaPeseAFalla = false;
    try {
      promoviaPeseAFalla = await SubscriptionService.handleAuthorizedPayment('pago-nuevo-2-001');
    } finally {
      mock.cancelacionFalla = false;
    }
    const trasFalla = await db.tenant.findUniqueOrThrow({ where: { id: conFalla.id } });
    assert(
      promoviaPeseAFalla &&
        trasFalla.planSlug === 'clinica-pro' &&
        trasFalla.mpPreapprovalId === 'preapproval-mp-nuevo-2',
      'Un fallo al cancelar la suscripción anterior no bloquea la activación del plan pagado'
    );

    // Un segundo checkout sustituye al primero sin confirmar y lo cancela.
    mock.siguientePreapprovalId = 'preapproval-mp-abandonado';
    await SubscriptionService.createCheckout({
      tenantId: conFalla.id,
      planSlug: 'cadenas',
      billingCycle: 'MONTHLY',
      payerEmail: 'admin@clinica.mx',
      backUrl: 'x',
      auditActor: ACTOR,
    });
    mock.siguientePreapprovalId = 'preapproval-mp-definitivo';
    mock.enviados = [];
    await SubscriptionService.createCheckout({
      tenantId: conFalla.id,
      planSlug: 'consultorio',
      billingCycle: 'MONTHLY',
      payerEmail: 'admin@clinica.mx',
      backUrl: 'x',
      auditActor: ACTOR,
    });
    const reemplazo = await db.tenant.findUniqueOrThrow({ where: { id: conFalla.id } });
    assert(
      reemplazo.pendingPreapprovalId === 'preapproval-mp-definitivo' &&
        reemplazo.pendingPlanSlug === 'consultorio' &&
        mock.enviados.some(
          (e) => e.method === 'PUT' && e.url.endsWith('/preapproval/preapproval-mp-abandonado')
        ),
      'Un checkout nuevo sustituye al pendiente anterior y lo cancela en Mercado Pago'
    );

    mock.preapprovalIdDelPago = 'preapproval-mp-abandonado';
    const cobroAbandonado = await SubscriptionService.handleAuthorizedPayment('pago-abandonado-001');
    assert(
      !cobroAbandonado,
      'Un cobro de un checkout sustituido no se acredita a la clínica'
    );

    await SubscriptionService.cancel(conFalla.id, ACTOR);
    const canceladaConPendiente = await db.tenant.findUniqueOrThrow({ where: { id: conFalla.id } });
    assert(
      canceladaConPendiente.subscriptionStatus === 'CANCELED' &&
        canceladaConPendiente.pendingPreapprovalId === null,
      'Cancelar descarta también el cambio pendiente, para que no reactive la suscripción después'
    );

    // Una clínica en prueba que solo abrió el checkout también puede
    // arrepentirse: no hay suscripción vigente, pero sí una autorización viva.
    const soloPendiente = await nuevaClinica();
    mock.siguientePreapprovalId = 'preapproval-mp-solo-pendiente';
    await SubscriptionService.createCheckout({
      tenantId: soloPendiente.id,
      planSlug: 'clinica-pro',
      billingCycle: 'MONTHLY',
      payerEmail: 'admin@clinica.mx',
      backUrl: 'x',
      auditActor: ACTOR,
    });
    mock.enviados = [];
    await SubscriptionService.cancel(soloPendiente.id, ACTOR);
    const pruebaTrasCancelar = await db.tenant.findUniqueOrThrow({ where: { id: soloPendiente.id } });
    assert(
      pruebaTrasCancelar.pendingPreapprovalId === null &&
        pruebaTrasCancelar.subscriptionStatus === 'TRIALING' &&
        mock.enviados.some(
          (e) => e.method === 'PUT' && e.url.endsWith('/preapproval/preapproval-mp-solo-pendiente')
        ),
      'Cancelar un checkout pendiente lo cancela en Mercado Pago sin tocar la prueba en curso'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Cancelación: el periodo pagado se respeta');
    // ---------------------------------------------------------------------
    const enUnMes = new Date(Date.now() + 30 * 86_400_000);
    const cancelable = await nuevaClinica({
      planSlug: 'clinica-pro',
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: null,
      mpPreapprovalId: 'preapproval-mp-cancelable',
      billingCycle: 'MONTHLY',
      currentPeriodEnd: enUnMes,
    });
    mock.siguientePreapprovalId = 'preapproval-mp-cancelable';

    await SubscriptionService.cancel(cancelable.id, ACTOR);
    const cancelada = await db.tenant.findUniqueOrThrow({ where: { id: cancelable.id } });
    assert(cancelada.subscriptionStatus === 'CANCELED', 'La cancelación queda registrada');

    const estadoTrasCancelar = resolveTenantPlan(cancelada);
    assert(
      !estadoTrasCancelar.isSuspended && estadoTrasCancelar.limits.voiceEnabled,
      'Tras cancelar, el servicio sigue hasta el fin del periodo ya pagado'
    );

    const yaVencido = resolveTenantPlan(
      { ...cancelada, currentPeriodEnd: new Date(Date.now() - 86_400_000) }
    );
    assert(
      yaVencido.isSuspended,
      'Cuando el periodo pagado termina, la cuenta cancelada sí se suspende'
    );

    const morosoConPeriodo = resolveTenantPlan({
      planSlug: 'clinica-pro',
      subscriptionStatus: 'PAST_DUE',
      trialEndsAt: null,
      currentPeriodEnd: enUnMes,
    });
    assert(
      !morosoConPeriodo.isSuspended,
      'Un cobro fallido no corta el servicio mientras el periodo pagado siga vigente'
    );
    // ---------------------------------------------------------------------
    console.log('\n▶ Enrutamiento del webhook: dos flujos de dinero opuestos');
    // ---------------------------------------------------------------------
    // Por el mismo webhook entran los anticipos de pacientes (a favor de la
    // clínica) y las mensualidades (a favor de la plataforma). Confundirlos
    // acreditaría una cita con un cobro de suscripción, o al revés.
    const app = await buildServer({ logger: false });
    try {
      const enrutar = async (tipo: string, dataId: string) => {
        const ts = `${Math.floor(Date.now() / 1000)}`;
        const requestId = 'req-sub-test';
        const firma = computeMercadoPagoSignature({
          dataId,
          requestId,
          ts,
          secret: 'test-mp-webhook-secret',
        });
        return app.inject({
          method: 'POST',
          url: '/webhooks/mercadopago',
          headers: { 'x-signature': `ts=${ts},v1=${firma}`, 'x-request-id': requestId },
          payload: { type: tipo, data: { id: dataId } },
        });
      };

      mock.preapprovalStatus = 'authorized';
      const rutaPreapproval = await enrutar('subscription_preapproval', 'preapproval-mp-cancelable');
      assert(
        rutaPreapproval.statusCode === 200 &&
          rutaPreapproval.json().tipo === 'subscription_preapproval' &&
          rutaPreapproval.json().estado === 'ACTIVE',
        'Una notificación de suscripción va al cobro de la plataforma, no a un anticipo'
      );

      mock.preapprovalIdDelPago = 'preapproval-mp-cancelable';
      mock.pagoStatus = 'approved';
      const rutaCobro = await enrutar('subscription_authorized_payment', 'pago-webhook-001');
      assert(
        rutaCobro.statusCode === 200 &&
          rutaCobro.json().tipo === 'subscription_authorized_payment' &&
          rutaCobro.json().aplicado === true,
        'Un cobro de suscripción extiende el periodo por la vía correcta'
      );

      const sinFirma = await app.inject({
        method: 'POST',
        url: '/webhooks/mercadopago',
        payload: { type: 'subscription_preapproval', data: { id: 'preapproval-mp-cancelable' } },
      });
      assert(
        sinFirma.statusCode === 401,
        'Una notificación de suscripción sin firma se rechaza: nadie activa un plan sin pagar'
      );
    } finally {
      await app.close();
    }
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const id of creados) {
      await db.tenant.deleteMany({ where: { id } });
    }
    await db.$disconnect();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO SUSCRIPCIONES: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Error en la suite de suscripciones:', error);
  process.exit(1);
});
