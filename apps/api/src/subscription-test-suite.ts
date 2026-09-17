/**
 * Suite de suscripciones recurrentes con Mercado Pago.
 *
 * No hay credenciales de Mercado Pago en este entorno, así que se sustituye
 * `fetch` y se ejercitan los caminos reales del servicio contra respuestas
 * representativas de su API. Lo que se protege aquí es dinero: que se cobre el
 * importe anunciado, que un reenvío del webhook no regale un mes, y que
 * cancelar no corte un servicio ya pagado.
 */
import { db, resolveTenantPlan } from '@asistente/database';
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
  /** Cuerpos enviados a Mercado Pago, para poder inspeccionarlos. */
  enviados: { url: string; method: string; body: Record<string, unknown> | null }[];
}

const mock: EstadoMock = {
  preapprovalStatus: 'authorized',
  pagoStatus: 'approved',
  preapprovalIdDelPago: '',
  montoPago: 3499,
  siguientePreapprovalId: 'preapproval-mp-123',
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
      const nuevoStatus = body?.status === 'authorized' ? 'authorized' : 'cancelled';
      mock.preapprovalStatus = nuevoStatus;
      return new Response(JSON.stringify({ id: mock.siguientePreapprovalId, status: nuevoStatus }), {
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
      trasCheckout.mpPreapprovalId === 'preapproval-mp-123' &&
        trasCheckout.planSlug === 'clinica-pro',
      'Se guarda la referencia de la suscripción y el plan pretendido'
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
    const activa = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    assert(
      estado === 'ACTIVE' && activa.subscriptionStatus === 'ACTIVE',
      'Una suscripción autorizada deja la clínica activa'
    );
    assert(
      activa.trialEndsAt === null,
      'Al activarse se limpia la prueba, para que no la vuelva a suspender al vencer'
    );

    mock.preapprovalStatus = 'paused';
    await SubscriptionService.syncFromPreapproval('preapproval-mp-123');
    const pausada = await db.tenant.findUniqueOrThrow({ where: { id: clinica.id } });
    assert(pausada.subscriptionStatus === 'PAST_DUE', 'Una suscripción pausada marca pago vencido');

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
      'Un cobro aprobado reactiva la clínica y fija hasta cuándo está pagada'
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

    // ---------------------------------------------------------------------
    console.log('\n▶ Morosidad, período de gracia (3 días) y Dunning');
    // ---------------------------------------------------------------------
    assert(
      trasRechazo.subscriptionStatus === 'PAST_DUE',
      'Un cobro rechazado marca el estatus en PAST_DUE'
    );
    assert(
      trasRechazo.pastDueSince !== null,
      'Se registra la fecha exacta de entrada en morosidad (pastDueSince)'
    );
    assert(
      trasRechazo.gracePeriodEndsAt !== null,
      'Se otorga un período de gracia de 3 días naturales (gracePeriodEndsAt)'
    );
    const diasGracia = Math.round(
      (trasRechazo.gracePeriodEndsAt!.getTime() - Date.now()) / 86_400_000
    );
    assert(
      diasGracia >= 2 && diasGracia <= 4,
      `El período de gracia es de aproximadamente 3 días (otorgó ${diasGracia} días)`
    );
    assert(
      trasRechazo.lastPaymentError !== null,
      'Se almacena el motivo legible del rechazo bancario'
    );

    // Verificamos registro en SubscriptionCharge
    const cargos = await SubscriptionService.getChargesHistory(clinica.id);
    assert(cargos.length >= 2, 'El historial de cargos registra tanto cobros aprobados como fallidos');
    const cargoRechazado = cargos.find((c) => c.status === 'REJECTED');
    assert(
      cargoRechazado !== undefined && cargoRechazado.mpPaymentId === 'pago-003',
      'El cargo rechazado queda registrado con su ID de Mercado Pago y status REJECTED'
    );

    // En período de gracia, la clínica NO se suspende (IA y telefonía siguen activas)
    const estadoEnGracia = resolveTenantPlan(trasRechazo);
    assert(
      !estadoEnGracia.isSuspended && estadoEnGracia.graceDaysLeft !== null && estadoEnGracia.graceDaysLeft > 0,
      'Durante el período de gracia la clínica NO está suspendida (protege a pacientes y citas)'
    );

    // Al expirar el período de gracia (4 días después), la clínica sí se suspende
    const estadoGraciaVencida = resolveTenantPlan({
      ...trasRechazo,
      gracePeriodEndsAt: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    });
    assert(
      estadoGraciaVencida.isSuspended,
      'Al vencer el período de gracia, la clínica morosa sí se suspende'
    );

    // Reintento de cobro
    mock.preapprovalStatus = 'authorized';
    mock.siguientePreapprovalId = 'preapproval-mp-123';
    const reintento = await SubscriptionService.retryPayment(clinica.id, ACTOR);
    assert(
      reintento.reintentado === true,
      'El reintento de cobro solicita la reactivación a Mercado Pago'
    );

    // HealthCheck periódico de dunning
    const health = await SubscriptionService.runHealthCheck();
    assert(typeof health.procesadas === 'number', 'El healthcheck de dunning escanea y procesa clínicas');

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
