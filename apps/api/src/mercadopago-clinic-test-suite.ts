import { randomBytes } from 'node:crypto';
import { appointmentSlotKey, db, hashPassword } from '@asistente/database';
import { DepositLinkUnavailableError, MercadoPagoService } from '@asistente/ai-agent';
import { buildServer } from './server.js';

process.env.JWT_SECRET ||= 'mp-clinic-test-secret-at-least-32-characters';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';
process.env.PUBLIC_API_HOST = 'api.clinica.test';
process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString('base64');

/**
 * Cobro de anticipos con la cuenta de Mercado Pago PROPIA de cada clínica.
 *
 * Cubre: conectar la cuenta (solo ADMIN, token nunca devuelto, solo México),
 * que el link de anticipo se cree con el token de la clínica y avise a su
 * URL, que el aviso por clínica consulte el pago con ese token y no acredite
 * citas de otra clínica, y que en producción no haya respaldo a la cuenta de
 * la plataforma.
 */
const HOUR = 60 * 60 * 1000;

async function runMercadoPagoClinicTests() {
  console.log('💳 ========================================================');
  console.log('💳 INICIANDO PRUEBAS DE MERCADO PAGO POR CLÍNICA');
  console.log('💳 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  const tenantIds: string[] = [];
  const suffix = Date.now().toString(36);
  const password = 'MercadoPagoPrueba2026!';
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  const tokenA = `APP_USR-${'1'.repeat(16)}-CLINICA-A-${'a'.repeat(20)}`;
  const tokenB = `APP_USR-${'2'.repeat(16)}-CLINICA-B-${'b'.repeat(20)}`;
  const tokenArgentina = `APP_USR-${'3'.repeat(16)}-ARGENTINA-${'c'.repeat(20)}`;
  const platformToken = `APP_USR-${'9'.repeat(16)}-PLATAFORMA-${'p'.repeat(20)}`;
  process.env.MERCADOPAGO_ACCESS_TOKEN = platformToken;

  const accounts: Record<string, { id: number; nickname: string; site_id: string }> = {
    [tokenA]: { id: 1001, nickname: 'CLINICA_A', site_id: 'MLM' },
    [tokenB]: { id: 2002, nickname: 'CLINICA_B', site_id: 'MLM' },
    [tokenArgentina]: { id: 3003, nickname: 'CLINICA_AR', site_id: 'MLA' },
  };
  // Pagos que "existen" en cada cuenta: id → referencia y monto.
  const payments: Record<string, { token: string; external_reference: string; amount: number }> = {};
  const calls: { url: string; auth: string; body: string }[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const auth = (new Headers(init?.headers).get('authorization') ?? '').replace('Bearer ', '');
    calls.push({ url, auth, body: String(init?.body ?? '') });

    if (url.endsWith('/users/me')) {
      const account = accounts[auth];
      return account
        ? new Response(JSON.stringify(account), { status: 200 })
        : new Response(JSON.stringify({ message: 'invalid_token' }), { status: 401 });
    }
    if (url.endsWith('/checkout/preferences')) {
      return new Response(
        JSON.stringify({ id: `pref-${calls.length}`, init_point: `https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-${calls.length}` }),
        { status: 201 }
      );
    }
    const paymentMatch = url.match(/\/v1\/payments\/([^/?]+)/);
    if (paymentMatch) {
      const payment = payments[decodeURIComponent(paymentMatch[1])];
      // Cada cuenta solo ve sus propios pagos.
      if (!payment || payment.token !== auth) return new Response('{}', { status: 404 });
      return new Response(
        JSON.stringify({ status: 'approved', external_reference: payment.external_reference, transaction_amount: payment.amount }),
        { status: 200 }
      );
    }
    if (url.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  async function createClinic(label: string, phone: string) {
    const admin = `mp-admin-${label}-${suffix}@asistente.test`;
    const staff = `mp-staff-${label}-${suffix}@asistente.test`;
    const tenant = await db.tenant.create({
      data: {
        name: `MP ${label} ${suffix}`,
        slug: `mp-${label}-${suffix}`,
        phoneE164: phone,
        users: {
          create: [
            { email: admin, name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword(password) },
            { email: staff, name: 'Recepción', role: 'RECEPTIONIST', passwordHash: await hashPassword(password) },
          ],
        },
        doctors: { create: [{ name: 'Dra. Pago', specialty: 'Odontología' }] },
        services: { create: [{ name: 'Blanqueamiento', durationMinutes: 60, priceMxn: 2500, requiredDepositMxn: 500 }] },
        patients: { create: [{ fullName: 'Paciente Pago', phoneE164: phone.replace('+5255', '+5233') }] },
      },
      include: { doctors: true, services: true, patients: true },
    });
    tenantIds.push(tenant.id);
    return { tenant, admin, staff };
  }

  async function bearer(email: string): Promise<Record<string, string>> {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    return { authorization: `Bearer ${JSON.parse(res.body).token}` };
  }

  let slot = 0;
  async function createAppointment(clinic: Awaited<ReturnType<typeof createClinic>>) {
    const startTime = new Date(Date.now() + 72 * HOUR + slot++ * HOUR);
    startTime.setUTCMinutes(0, 0, 0);
    const doctorId = clinic.tenant.doctors[0].id;
    return db.appointment.create({
      data: {
        tenantId: clinic.tenant.id,
        patientId: clinic.tenant.patients[0].id,
        doctorId,
        serviceId: clinic.tenant.services[0].id,
        startTime,
        endTime: new Date(startTime.getTime() + HOUR),
        status: 'CONFIRMED',
        slotKey: appointmentSlotKey({ doctorId, startTime, status: 'CONFIRMED' }),
        paymentStatus: 'DEPOSIT_PENDING',
        depositAmountMxn: 500,
      },
    });
  }

  try {
    const clinicA = await createClinic('a', '+525599003301');
    const clinicB = await createClinic('b', '+525599003302');
    const adminA = await bearer(clinicA.admin);
    const staffA = await bearer(clinicA.staff);

    console.log('🔌 1. Conectar la cuenta de la clínica');
    const initial = await app.inject({ method: 'GET', url: '/api/channels', headers: adminA });
    assert(
      initial.statusCode === 200 && initial.json().mercadoPago.configured === false && initial.json().mercadoPago.source === 'NONE',
      'Sin cuenta conectada, el panel lo dice (no finge la de la plataforma)'
    );

    const asStaff = await app.inject({ method: 'PUT', url: '/api/channels/mercadopago', headers: staffA, payload: { accessToken: tokenA } });
    assert(asStaff.statusCode === 403, 'Recepción no puede conectar la cuenta (solo ADMIN)');

    const badToken = await app.inject({
      method: 'PUT',
      url: '/api/channels/mercadopago',
      headers: adminA,
      payload: { accessToken: tokenArgentina },
    });
    assert(badToken.statusCode === 400, 'Una cuenta de otro país se rechaza (no cobra en pesos)');

    const saved = await app.inject({ method: 'PUT', url: '/api/channels/mercadopago', headers: adminA, payload: { accessToken: tokenA } });
    const savedBody = saved.json();
    assert(
      saved.statusCode === 200 &&
        savedBody.mercadoPago.configured === true &&
        savedBody.mercadoPago.userId === '1001' &&
        savedBody.mercadoPago.tokenLast4 === tokenA.slice(-4),
      'Se conecta la cuenta y se reconoce de quién es'
    );
    assert(!saved.body.includes(tokenA), 'La respuesta nunca incluye el token');

    const row = await db.channelConfig.findFirst({ where: { tenantId: clinicA.tenant.id, channelType: 'MERCADOPAGO' } });
    assert(Boolean(row) && !row!.credentials.includes(tokenA), 'El token se guarda cifrado');
    const audit = await db.auditLog.findFirst({
      where: { tenantId: clinicA.tenant.id, entityType: 'CHANNEL_CONFIG', metadata: { contains: 'MERCADOPAGO' } },
    });
    assert(Boolean(audit) && !JSON.stringify(audit).includes(tokenA), 'La conexión queda auditada sin el token');

    const tested = await app.inject({ method: 'POST', url: '/api/channels/mercadopago/test', headers: adminA });
    assert(tested.statusCode === 200 && tested.json().ok === true, 'Probar conexión verifica el token guardado');

    console.log('\n🔗 2. El link de anticipo se cobra a la cuenta de la clínica');
    const apptA = await createAppointment(clinicA);
    calls.length = 0;
    await MercadoPagoService.createDepositPreference({ appointmentId: apptA.id, tenantId: clinicA.tenant.id, amountMxn: 500 });
    const preferenceCall = calls.find((call) => call.url.endsWith('/checkout/preferences'));
    assert(preferenceCall?.auth === tokenA, 'La preferencia se crea con el token de la clínica, no el de la plataforma');
    assert(
      Boolean(preferenceCall?.body.includes(`https://api.clinica.test/webhooks/mercadopago/clinica/${clinicA.tenant.id}`)),
      'Mercado Pago avisa los pagos a la URL de esa clínica'
    );

    console.log('\n📬 3. Aviso de pago por clínica');
    payments['pago-a-1'] = { token: tokenA, external_reference: apptA.id, amount: 500 };
    const paid = await app.inject({
      method: 'POST',
      url: `/webhooks/mercadopago/clinica/${clinicA.tenant.id}`,
      payload: { type: 'payment', data: { id: 'pago-a-1' } },
    });
    const apptAAfter = await db.appointment.findUnique({ where: { id: apptA.id } });
    assert(paid.statusCode === 200 && apptAAfter?.paymentStatus === 'DEPOSIT_PAID', 'El pago consultado con el token de la clínica acredita su cita');
    const paymentLookup = calls.find((call) => call.url.includes('/v1/payments/pago-a-1'));
    assert(paymentLookup?.auth === tokenA, 'El pago se verifica en Mercado Pago con el token de la clínica');

    // Un aviso dirigido a la clínica A con un pago que la cuenta de A no tiene.
    const apptB = await createAppointment(clinicB);
    payments['pago-b-1'] = { token: tokenB, external_reference: apptB.id, amount: 500 };
    const foreign = await app.inject({
      method: 'POST',
      url: `/webhooks/mercadopago/clinica/${clinicA.tenant.id}`,
      payload: { type: 'payment', data: { id: 'pago-b-1' } },
    });
    const apptBAfter = await db.appointment.findUnique({ where: { id: apptB.id } });
    assert(
      foreign.statusCode === 200 && foreign.json().ignored === true && apptBAfter?.paymentStatus === 'DEPOSIT_PENDING',
      'Un pago que no es de la cuenta de la clínica no acredita nada'
    );

    // La cuenta de A "tiene" un pago que apunta a una cita de B: no se cruza.
    const apptB2 = await createAppointment(clinicB);
    payments['pago-cruzado'] = { token: tokenA, external_reference: apptB2.id, amount: 500 };
    const crossed = await app.inject({
      method: 'POST',
      url: `/webhooks/mercadopago/clinica/${clinicA.tenant.id}`,
      payload: { type: 'payment', data: { id: 'pago-cruzado' } },
    });
    const apptB2After = await db.appointment.findUnique({ where: { id: apptB2.id } });
    assert(
      crossed.json().reason === 'cita_de_otra_clinica' && apptB2After?.paymentStatus === 'DEPOSIT_PENDING',
      'Un pago de la cuenta de una clínica jamás acredita la cita de otra'
    );

    console.log('\n🚫 4. Producción sin cuenta de la clínica');
    process.env.NODE_ENV = 'production';
    let unavailable = false;
    try {
      await MercadoPagoService.createDepositPreference({ appointmentId: apptB.id, tenantId: clinicB.tenant.id, amountMxn: 500 });
    } catch (error) {
      unavailable = error instanceof DepositLinkUnavailableError;
    }
    process.env.NODE_ENV = originalNodeEnv;
    assert(unavailable, 'En producción, sin cuenta propia no hay link: el anticipo nunca cae en la cuenta de la plataforma');

    const removed = await app.inject({ method: 'DELETE', url: '/api/channels/mercadopago', headers: adminA });
    assert(removed.statusCode === 200 && removed.json().mercadoPago.configured === false, 'Desconectar la cuenta la quita');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    for (const tenantId of tenantIds) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE MERCADO PAGO POR CLÍNICA PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runMercadoPagoClinicTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
