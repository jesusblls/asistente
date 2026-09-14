import { db } from '@asistente/database';
import { MercadoPagoService } from '@asistente/ai-agent';

process.env.MERCADOPAGO_ACCESS_TOKEN = 'test-mp-access-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-webhook-secret';
process.env.META_WHATSAPP_TOKEN = 'test-wa-token';
process.env.META_PHONE_NUMBER_ID = 'test-phone-id';
process.env.WHATSAPP_SEND_ATTEMPTS = '3';
process.env.WHATSAPP_RETRY_DELAY_MS = '1';

interface MockState {
  appointmentId: string;
  paymentAmount: number;
  paymentStatus: string;
  waPlan: boolean[];
  waCalls: number;
}

const state: MockState = {
  appointmentId: '',
  paymentAmount: 200,
  paymentStatus: 'approved',
  waPlan: [],
  waCalls: 0,
};

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input.url);

  if (url.includes('/checkout/preferences')) {
    return new Response(
      JSON.stringify({
        id: 'pref-real-123',
        init_point: 'https://www.mercadopago.com.mx/checkout/real-preference',
        sandbox_init_point: 'https://sandbox.mercadopago.com.mx/checkout/real-preference',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  if (url.includes('/v1/payments/')) {
    return new Response(
      JSON.stringify({
        status: state.paymentStatus,
        external_reference: state.appointmentId,
        transaction_amount: state.paymentAmount,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  if (url.includes('graph.facebook.com')) {
    const planIndex = state.waCalls;
    state.waCalls += 1;
    const shouldSucceed = state.waPlan[planIndex] ?? false;
    return new Response(shouldSucceed ? '{"ok":true}' : '{"error":"simulated failure"}', {
      status: shouldSucceed ? 200 : 500,
    });
  }

  return originalFetch(input as RequestInfo, init);
}) as typeof fetch;

async function runPaymentTests() {
  console.log('💳 ========================================================');
  console.log('💳 SUITE DE PAGOS Y NOTIFICACIONES (MERCADO PAGO / WHATSAPP)');
  console.log('💳 ========================================================\n');

  let passed = 0;
  let failed = 0;
  let tenantId: string | null = null;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed += 1;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed += 1;
    }
  }

  try {
    const suffix = Date.now().toString(36);
    const tenant = await db.tenant.create({
      data: {
        name: `Payment Test ${suffix}`,
        slug: `payment-test-${suffix}`,
        phoneE164: '+529900002001',
        doctors: { create: [{ name: 'Doctor Pago', specialty: 'Odontología' }] },
        services: {
          create: [
            {
              name: 'Servicio Pago',
              durationMinutes: 30,
              priceMxn: 500,
              requiredDepositMxn: 200,
            },
          ],
        },
        patients: {
          create: [{ fullName: 'Paciente Pago', phoneE164: '+529900002002' }],
        },
      },
      include: { doctors: true, services: true, patients: true },
    });
    tenantId = tenant.id;

    const startTime = new Date(Date.now() + 86_400_000);
    const appointment = await db.appointment.create({
      data: {
        tenantId: tenant.id,
        patientId: tenant.patients[0].id,
        doctorId: tenant.doctors[0].id,
        serviceId: tenant.services[0].id,
        startTime,
        endTime: new Date(startTime.getTime() + 30 * 60_000),
        status: 'CONFIRMED',
        paymentStatus: 'DEPOSIT_PENDING',
        depositAmountMxn: 200,
      },
    });
    state.appointmentId = appointment.id;

    console.log('💳 1. Preferencia de pago contra la API de Mercado Pago');
    const preference = await MercadoPagoService.createDepositPreference({
      appointmentId: appointment.id,
      tenantId: tenant.id,
      amountMxn: 200,
    });
    assert(
      preference.preferenceId === 'pref-real-123' &&
        preference.initPoint === 'https://www.mercadopago.com.mx/checkout/real-preference',
      'Se usa la preferencia real devuelta por la API (no un link fabricado)'
    );

    const storedAfterPreference = await db.appointment.findUnique({ where: { id: appointment.id } });
    assert(
      storedAfterPreference?.paymentReferenceId === 'pref-real-123' &&
        storedAfterPreference?.paymentStatus === 'DEPOSIT_PENDING',
      'La cita guarda el preferenceId real y queda en DEPOSIT_PENDING'
    );

    console.log('\n💳 2. Verificación del pago contra la API antes de acreditar');
    const paid = await MercadoPagoService.processPaymentWebhook({ data: { id: 'pay-real-123' } });
    assert(paid.paymentStatus === 'DEPOSIT_PAID', 'Pago aprobado con monto correcto acredita el anticipo');

    await db.appointment.update({
      where: { id: appointment.id },
      data: { paymentStatus: 'DEPOSIT_PENDING' },
    });
    state.paymentAmount = 999;
    let amountMismatchRejected = false;
    try {
      await MercadoPagoService.processPaymentWebhook({ data: { id: 'pay-real-124' } });
    } catch {
      amountMismatchRejected = true;
    }
    const stillPending = await db.appointment.findUnique({ where: { id: appointment.id } });
    assert(
      amountMismatchRejected && stillPending?.paymentStatus === 'DEPOSIT_PENDING',
      'Un pago con monto distinto al anticipo se rechaza y la cita no se acredita'
    );

    state.paymentStatus = 'rejected';
    let rejectedStatusBlocked = false;
    try {
      await MercadoPagoService.processPaymentWebhook({ data: { id: 'pay-real-125' } });
    } catch {
      rejectedStatusBlocked = true;
    }
    assert(rejectedStatusBlocked, 'Un pago no aprobado no acredita el anticipo');
    state.paymentStatus = 'approved';

    console.log('\n💬 3. Reintentos de envío de WhatsApp');
    const { WhatsAppService } = await import('./services/whatsappService.js');

    state.waPlan = [false, true];
    state.waCalls = 0;
    const retrySucceeded = await WhatsAppService.sendMessage({
      toPhoneE164: '+529900002002',
      text: 'Mensaje de prueba con reintento',
    });
    assert(
      retrySucceeded && state.waCalls === 2,
      'WhatsApp reintenta tras un fallo 500 y termina en éxito'
    );

    state.waPlan = [false, false, false];
    state.waCalls = 0;
    const retryExhausted = await WhatsAppService.sendMessage({
      toPhoneE164: '+529900002002',
      text: 'Mensaje de prueba que falla siempre',
    });
    assert(
      retryExhausted === false && state.waCalls === 3,
      'WhatsApp agota los 3 intentos y reporta false (no marca como enviado)'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (tenantId) {
      await db.message.deleteMany({ where: { tenantId } });
      await db.conversation.deleteMany({ where: { tenantId } });
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.doctor.deleteMany({ where: { tenantId } });
      await db.service.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO PAGOS: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runPaymentTests().catch((error) => {
  console.error('Error en la suite de pagos:', error);
  process.exit(1);
});
