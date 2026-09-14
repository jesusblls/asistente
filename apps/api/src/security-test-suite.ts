import { db } from '@asistente/database';
import { SchedulerService } from '@asistente/ai-agent';
import { buildServer } from './server.js';
import {
  computeMercadoPagoSignature,
  computeMetaSignature,
  computeTwilioSignature,
} from './lib/webhookSecurity.js';

process.env.JWT_SECRET ||= 'security-test-secret-with-32-characters';
process.env.META_VERIFY_TOKEN ||= 'security-test-verify-token';
process.env.META_APP_SECRET = 'security-test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'security-test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'security-test-mp-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';
delete process.env.WEBHOOK_ALLOW_UNVERIFIED;

interface TestTenant {
  id: string;
  doctorId: string;
  serviceId: string;
  userId: string;
}

async function createTestTenant(suffix: string, phone: string): Promise<TestTenant> {
  const tenant = await db.tenant.create({
    data: {
      name: `Security Test ${suffix}`,
      slug: `security-test-${suffix}`,
      phoneE164: phone,
      address: 'CDMX',
      doctors: {
        create: [
          {
            name: `Doctor ${suffix}`,
            specialty: 'Odontología',
            availabilityRules: JSON.stringify({
              days: {
                0: [{ start: '09:00', end: '18:00' }],
                1: [{ start: '09:00', end: '18:00' }],
                2: [{ start: '09:00', end: '18:00' }],
                3: [{ start: '09:00', end: '18:00' }],
                4: [{ start: '09:00', end: '18:00' }],
                5: [{ start: '09:00', end: '18:00' }],
                6: [{ start: '09:00', end: '18:00' }],
              },
              slotDurationMinutes: 30,
              bufferBetweenAppointmentsMinutes: 0,
            }),
          },
        ],
      },
      services: {
        create: [
          {
            name: `Servicio ${suffix}`,
            durationMinutes: 30,
            priceMxn: 500,
            requiredDepositMxn: 200,
          },
        ],
      },
      // El usuario debe existir de verdad: desde que las sesiones se revalidan
      // contra la base de datos, un token con un userId inventado ya no vale.
      users: {
        create: [
          {
            email: `security-${suffix}@test.mx`,
            name: `Admin ${suffix}`,
            role: 'ADMIN',
            passwordHash: 'scrypt$00$00',
          },
        ],
      },
    },
    include: { doctors: true, services: true, users: true },
  });

  return {
    id: tenant.id,
    doctorId: tenant.doctors[0].id,
    serviceId: tenant.services[0].id,
    userId: tenant.users[0].id,
  };
}

async function findAvailableSlot(tenantId: string, serviceId: string) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
    const slots = await SchedulerService.getAvailableSlots({
      tenantId,
      targetDateStr: dateStr,
      serviceId,
    });
    if (slots.length > 0) return slots[0];
  }
  throw new Error('No hay disponibilidad para las pruebas de seguridad');
}

async function runSecurityTests() {
  console.log('🔐 ========================================================');
  console.log('🔐 SUITE DE REGRESIÓN DE SEGURIDAD (BLOQUE CRÍTICO)');
  console.log('🔐 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  const createdTenants: string[] = [];

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
    const tenantA = await createTestTenant(`a-${suffix}`, '+529900001001');
    const tenantB = await createTestTenant(`b-${suffix}`, '+529900001002');
    createdTenants.push(tenantA.id, tenantB.id);

    const tokenA = app.jwt.sign({
      userId: tenantA.userId,
      tenantId: tenantA.id,
      role: 'ADMIN',
      email: 'security-a@test.mx',
    });
    const tokenB = app.jwt.sign({
      userId: tenantB.userId,
      tenantId: tenantB.id,
      role: 'ADMIN',
      email: 'security-b@test.mx',
    });
    const authA = { authorization: `Bearer ${tokenA}` };
    const authB = { authorization: `Bearer ${tokenB}` };

    console.log('🔒 1. Autenticación obligatoria en rutas administrativas');
    for (const url of [
      '/api/tenants',
      '/api/appointments',
      '/api/conversations',
      '/api/availability?date=2026-09-14',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      assert(response.statusCode === 401, `GET ${url} sin token responde 401`);
    }

    const unauthorizedWrite = await app.inject({
      method: 'POST',
      url: '/api/appointments',
      payload: { tenantId: tenantA.id },
    });
    assert(unauthorizedWrite.statusCode === 401, 'POST /api/appointments sin token responde 401');

    console.log('\n🏢 2. Aislamiento multi-tenant en lectura');
    const ownList = await app.inject({ method: 'GET', url: '/api/appointments', headers: authA });
    assert(ownList.statusCode === 200, 'La clínica A consulta sus propias citas');

    const crossRead = await app.inject({
      method: 'GET',
      url: `/api/appointments?tenantId=${tenantB.id}`,
      headers: authA,
    });
    assert(crossRead.statusCode === 403, 'Clínica A no puede leer citas de la clínica B (403)');

    const ownConversationsB = await app.inject({
      method: 'GET',
      url: `/api/conversations?tenantId=${tenantB.id}`,
      headers: authB,
    });
    assert(ownConversationsB.statusCode === 200, 'La clínica B consulta sus propias conversaciones');

    const crossTenantConversations = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: authA,
    });
    const crossTenantRows = crossTenantConversations.json() as Array<{ tenantId: string }>;
    assert(
      crossTenantRows.every((row) => row.tenantId === tenantA.id),
      'GET /api/conversations solo devuelve filas del tenant autenticado'
    );

    console.log('\n✍️ 3. Aislamiento multi-tenant en escritura');
    const crossWrite = await app.inject({
      method: 'POST',
      url: '/api/appointments',
      headers: authA,
      payload: {
        tenantId: tenantB.id,
        patientName: 'Intruso Cross Tenant',
        patientPhone: '5512340000',
        doctorId: tenantB.doctorId,
        serviceId: tenantB.serviceId,
        startTimeIso: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    assert(crossWrite.statusCode === 403, 'Clínica A no puede agendar en la clínica B (403)');

    const slotA = await findAvailableSlot(tenantA.id, tenantA.serviceId);
    let crossTenantServiceRejected = false;
    try {
      await SchedulerService.bookAppointment({
        tenantId: tenantA.id,
        patientFullName: 'Intruso Servicio Ajeno',
        patientPhone: '+529900001003',
        doctorId: tenantA.doctorId,
        serviceId: tenantB.serviceId,
        startTimeIso: slotA.startTimeIso,
      });
    } catch {
      crossTenantServiceRejected = true;
    }
    assert(crossTenantServiceRejected, 'SchedulerService rechaza un servicio de otra clínica');

    let crossTenantDoctorRejected = false;
    try {
      await SchedulerService.bookAppointment({
        tenantId: tenantA.id,
        patientFullName: 'Intruso Doctor Ajeno',
        patientPhone: '+529900001004',
        doctorId: tenantB.doctorId,
        serviceId: tenantA.serviceId,
        startTimeIso: slotA.startTimeIso,
      });
    } catch {
      crossTenantDoctorRejected = true;
    }
    assert(crossTenantDoctorRejected, 'SchedulerService rechaza un doctor de otra clínica');

    console.log('\n📞 4. Normalización telefónica E.164');
    const normalizedAppointment = await SchedulerService.bookAppointment({
      tenantId: tenantA.id,
      patientFullName: 'Paciente Telefono Crudo',
      patientPhone: '5512340000',
      doctorId: slotA.doctorId,
      serviceId: tenantA.serviceId,
      startTimeIso: slotA.startTimeIso,
    });
    assert(
      normalizedAppointment.patient.phoneE164 === '+525512340000',
      'bookAppointment normaliza 5512340000 a +525512340000'
    );

    const invalidPhoneRejected = await app.inject({
      method: 'POST',
      url: '/api/appointments',
      headers: authA,
      payload: {
        tenantId: tenantA.id,
        patientName: 'Paciente Teléfono Inválido',
        patientPhone: '123',
        doctorId: tenantA.doctorId,
        serviceId: tenantA.serviceId,
        startTimeIso: slotA.startTimeIso,
      },
    });
    assert(invalidPhoneRejected.statusCode === 400, 'Teléfono inválido se rechaza con 400');

    console.log('\n🪝 5. Verificación de firmas de webhooks');
    const metaPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: '529900001001', phone_number_id: 'PID' },
                contacts: [{ profile: { name: 'Paciente Firma' }, wa_id: '525500000001' }],
                messages: [
                  { from: '525500000001', id: 'wamid.sig.test', type: 'text', text: { body: 'Hola' } },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const metaNoSignature = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      payload: metaPayload,
    });
    assert(metaNoSignature.statusCode === 401, 'Webhook Meta sin firma responde 401');

    const metaBadSignature = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      payload: metaPayload,
    });
    assert(metaBadSignature.statusCode === 401, 'Webhook Meta con firma inválida responde 401');

    const metaGoodSignature = computeMetaSignature(
      Buffer.from(JSON.stringify(metaPayload)),
      process.env.META_APP_SECRET!
    );
    const metaGood = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'x-hub-signature-256': metaGoodSignature },
      payload: metaPayload,
    });
    assert(metaGood.statusCode === 200, 'Webhook Meta con firma válida se procesa (200)');

    const voiceBody = { To: '+529900001001', From: '+529900001099', CallSid: 'CA_security_test' };
    const voiceUrl = 'https://security.test/voice/incoming';
    const voiceSignature = computeTwilioSignature(voiceUrl, voiceBody, process.env.TWILIO_AUTH_TOKEN!);

    const twilioBad = await app.inject({
      method: 'POST',
      url: '/voice/incoming',
      headers: { host: 'security.test', 'x-forwarded-proto': 'https', 'x-twilio-signature': 'bad' },
      payload: voiceBody,
    });
    assert(twilioBad.statusCode === 401, 'Webhook Twilio con firma inválida responde 401');

    const twilioGood = await app.inject({
      method: 'POST',
      url: '/voice/incoming',
      headers: {
        host: 'security.test',
        'x-forwarded-proto': 'https',
        'x-twilio-signature': voiceSignature,
      },
      payload: voiceBody,
    });
    assert(twilioGood.statusCode === 200, 'Webhook Twilio con firma válida responde TwiML');

    const depositAppointment = await SchedulerService.bookAppointment({
      tenantId: tenantA.id,
      patientFullName: 'Paciente Pago',
      patientPhone: '+529900001005',
      doctorId: tenantA.doctorId,
      serviceId: tenantA.serviceId,
      startTimeIso: (await findAvailableSlot(tenantA.id, tenantA.serviceId)).startTimeIso,
    });

    const paymentId = `mp-pay-${Date.now()}`;
    const requestId = 'req-security-test';
    const ts = `${Math.floor(Date.now() / 1000)}`;
    const mpSignature = computeMercadoPagoSignature({
      dataId: paymentId,
      requestId,
      ts,
      secret: process.env.MERCADOPAGO_WEBHOOK_SECRET!,
    });

    const mpBad = await app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago',
      headers: { 'x-signature': 'ts=1,v1=bad', 'x-request-id': requestId },
      payload: { data: { id: paymentId }, external_reference: depositAppointment.id },
    });
    assert(mpBad.statusCode === 401, 'Webhook Mercado Pago con firma inválida responde 401');

    const mpGood = await app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago',
      headers: { 'x-signature': `ts=${ts},v1=${mpSignature}`, 'x-request-id': requestId },
      payload: { data: { id: paymentId }, external_reference: depositAppointment.id },
    });
    assert(
      mpGood.statusCode === 200 && mpGood.json().paymentStatus === 'DEPOSIT_PAID',
      'Webhook Mercado Pago con firma válida acredita el anticipo'
    );

    const outOfHoursStart = new Date();
    outOfHoursStart.setDate(outOfHoursStart.getDate() + 1);
    outOfHoursStart.setHours(3, 0, 0, 0);
    const outOfHoursPatch = await app.inject({
      method: 'PATCH',
      url: `/api/appointments/${depositAppointment.id}`,
      headers: authA,
      payload: { startTime: outOfHoursStart.toISOString() },
    });
    assert(outOfHoursPatch.statusCode === 400, 'Reprogramar fuera del horario del doctor se rechaza (400)');

    console.log('\n🌱 6. Seed idempotente del sandbox');
    const appointmentsBeforeSeed = await db.appointment.count({ where: { tenantId: tenantA.id } });
    const seedFirst = await app.inject({
      method: 'POST',
      url: `/api/tenants/${tenantA.id}/seed`,
      headers: authA,
    });
    const seedSecond = await app.inject({
      method: 'POST',
      url: `/api/tenants/${tenantA.id}/seed`,
      headers: authA,
    });
    const seededAppointments = await db.appointment.count({ where: { tenantId: tenantA.id } });

    assert(
      seedFirst.statusCode === 200 && seedSecond.statusCode === 200,
      'Dos clics en “+ Citas Demo” responden 200 (sin error 500)'
    );
    assert(
      seedSecond.json().skipped >= 4 && seededAppointments === appointmentsBeforeSeed + 4,
      'El segundo seed no duplica citas (solo agrega las 4 iniciales)'
    );
  } finally {
    for (const tenantId of createdTenants) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.message.deleteMany({ where: { tenantId } });
      await db.conversation.deleteMany({ where: { tenantId } });
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.doctor.deleteMany({ where: { tenantId } });
      await db.service.deleteMany({ where: { tenantId } });
      await db.user.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO SEGURIDAD: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runSecurityTests().catch((error) => {
  console.error('Error en la suite de seguridad:', error);
  process.exit(1);
});
