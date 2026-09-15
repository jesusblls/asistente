import { db } from '@asistente/database';
import { buildServer } from './server.js';
import { computeMetaSignature, computeTwilioSignature } from './lib/webhookSecurity.js';
import { drainQueue } from './services/queue/handlers.js';

// Entorno determinista para las pruebas.
process.env.JWT_SECRET ||= 'api-integration-test-secret-32-chars-min';
process.env.META_VERIFY_TOKEN ||= 'asistente_mexico_secret_2026';
process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-webhook-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';

async function runApiIntegrationTests() {
  console.log('🚀 ========================================================');
  console.log('🚀 INICIANDO PRUEBAS DE INTEGRACIÓN E2E DE LA API REST/WS');
  console.log('🚀 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  let tenantIdForCleanup: string | null = null;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  try {
    const tenant = await db.tenant.findFirst({ where: { slug: 'dental-polanco' } });
    if (!tenant) throw new Error('Tenant demo no encontrado; ejecuta npm run db:seed');
    tenantIdForCleanup = tenant.id;

    // Las sesiones se revalidan contra la base de datos, así que el usuario del
    // token tiene que existir y estar activo.
    const testUser = await db.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'api-test@asistente.mx' } },
      update: { isActive: true, role: 'ADMIN' },
      create: {
        tenantId: tenant.id,
        email: 'api-test@asistente.mx',
        name: 'API Test',
        role: 'ADMIN',
        passwordHash: 'scrypt$00$00',
      },
    });

    const token = app.jwt.sign({
      userId: testUser.id,
      tenantId: tenant.id,
      role: 'ADMIN',
      email: testUser.email,
    });
    const authHeaders = { authorization: `Bearer ${token}` };

    // 1. Healthcheck
    console.log('📡 1. Verificación de Healthcheck');
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    assert(healthRes.statusCode === 200 && healthRes.json().status === 'ok', 'Healthcheck responde 200 OK');

    // 2. Protección de rutas administrativas
    console.log('\n🔒 2. Protección de rutas administrativas');
    const unauthorized = await app.inject({ method: 'GET', url: '/api/tenants' });
    assert(unauthorized.statusCode === 401, 'GET /api/tenants sin token responde 401');

    // 3. Verificación de Webhook de Meta (challenge)
    console.log('\n📡 3. Verificación de Webhook de Meta (Handshake)');
    const verifyRes = await app.inject({
      method: 'GET',
      url: `/webhooks/meta?hub.mode=subscribe&hub.verify_token=${process.env.META_VERIFY_TOKEN}&hub.challenge=CHALLENGE_CODE_12345`,
    });
    assert(
      verifyRes.statusCode === 200 && verifyRes.body === 'CHALLENGE_CODE_12345',
      'Retorna challenge al validar token oficial'
    );

    // 4. Mensaje entrante firmado por Meta
    console.log('\n💬 4. Simulación de Mensaje Entrante por WhatsApp Cloud API');
    const metaPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: tenant.phoneE164.replace(/\+/g, ''),
                  phone_number_id: 'TEST_PHONE_NUMBER_ID',
                },
                contacts: [{ profile: { name: 'Mariana Hernández' }, wa_id: '525512349988' }],
                messages: [
                  {
                    from: '525512349988',
                    id: `wamid.test.${Date.now()}`,
                    timestamp: '1725800000',
                    text: { body: 'Hola, ¿dónde están ubicados y cuánto cuesta la limpieza dental?' },
                    type: 'text',
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    const metaRawBody = Buffer.from(JSON.stringify(metaPayload));
    const metaSignature = computeMetaSignature(metaRawBody, process.env.META_APP_SECRET!);

    const invalidSignatureRes = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'x-hub-signature-256': 'sha256=invalid' },
      payload: metaPayload,
    });
    assert(invalidSignatureRes.statusCode === 401, 'Webhook de Meta con firma inválida responde 401');

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'x-hub-signature-256': metaSignature },
      payload: metaPayload,
    });
    assert(webhookRes.statusCode === 200, 'Webhook de Meta firmado se procesa con respuesta 200');

    // El webhook solo encola; el turno del agente y el envío por WhatsApp corren
    // en el worker de la cola. En la prueba se drena de forma determinista.
    await drainQueue();

    // 5. Conversación visible en el panel
    console.log('\n💬 5. Verificación de Conversación en Panel de Recepción');
    const conversationsRes = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: authHeaders,
    });
    const conversations = conversationsRes.json();
    const marianaConversation = conversations.find(
      (conversation: any) => conversation.patient?.fullName === 'Mariana Hernández'
    );
    assert(!!marianaConversation, 'Conversación de Mariana Hernández creada y visible en la bandeja');

    // 6. Takeover y respuesta humana
    console.log('\n👤 6. Modo Copiloto e Intervención Humana');
    if (marianaConversation) {
      const takeoverRes = await app.inject({
        method: 'POST',
        url: `/api/conversations/${marianaConversation.id}/takeover`,
        headers: authHeaders,
        payload: { isHandedOver: true },
      });
      assert(
        takeoverRes.json().isHandedOverToHuman === true,
        'Recepcionista pausa IA y toma control de la conversación'
      );

      const replyRes = await app.inject({
        method: 'POST',
        url: `/api/conversations/${marianaConversation.id}/reply`,
        headers: authHeaders,
        payload: {
          text: 'Hola Mariana, te escribe Brenda de recepción. Estamos en Av. Horacio 1520 en Polanco y la limpieza cuesta $850 MXN.',
          staffName: 'Brenda Recepción',
        },
      });
      assert(replyRes.statusCode === 200, 'Recepcionista envía mensaje manual al paciente exitosamente');
    }

    // 7. Webhook de Twilio firmado
    console.log('\n📞 7. Verificación de Webhook Telefónico Twilio Voice');
    const voiceUrl = 'https://api.clinicasonrisas.mx/voice/incoming';
    const voiceBody = {
      To: tenant.phoneE164,
      From: '+525512349988',
      CallSid: 'CA_test_voice_123',
    };
    const voiceSignature = computeTwilioSignature(voiceUrl, voiceBody, process.env.TWILIO_AUTH_TOKEN!);

    const badVoice = await app.inject({
      method: 'POST',
      url: '/voice/incoming',
      headers: {
        host: 'api.clinicasonrisas.mx',
        'x-forwarded-proto': 'https',
        'x-twilio-signature': 'invalid',
      },
      payload: voiceBody,
    });
    assert(badVoice.statusCode === 401, 'Webhook de Twilio con firma inválida responde 401');

    const voiceRes = await app.inject({
      method: 'POST',
      url: '/voice/incoming',
      headers: {
        host: 'api.clinicasonrisas.mx',
        'x-forwarded-proto': 'https',
        'x-twilio-signature': voiceSignature,
      },
      payload: voiceBody,
    });
    assert(
      voiceRes.statusCode === 200 &&
        voiceRes.body.includes('<Stream url="wss://api.clinicasonrisas.mx/voice/stream"') &&
        voiceRes.body.includes(`<Parameter name="tenantId" value="${tenant.id}" />`) &&
        voiceRes.body.includes('Polly.Mia-Neural'),
      'Twilio Voice retorna TwiML con stream WebSocket y tenant correcto'
    );
  } finally {
    // Limpieza de datos generados por la prueba.
    if (tenantIdForCleanup) {
      await db.job.deleteMany({ where: { tenantId: tenantIdForCleanup } });
      await db.message.deleteMany({ where: { tenantId: tenantIdForCleanup, senderRole: 'PATIENT', content: { contains: 'dónde están ubicados' } } });
      await db.conversation.deleteMany({ where: { tenantId: tenantIdForCleanup, patient: { phoneE164: '+525512349988' } } });
      await db.patient.deleteMany({ where: { tenantId: tenantIdForCleanup, phoneE164: '+525512349988' } });
      // El usuario ADMIN de la prueba (arriba, vía upsert) también es dato de
      // prueba: sin esto queda para siempre en la clínica demo real, visible
      // en el selector de personal de la Bitácora de Auditoría.
      await db.user.deleteMany({ where: { tenantId: tenantIdForCleanup, email: 'api-test@asistente.mx' } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO INTEGRACIÓN API: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runApiIntegrationTests().catch((err) => {
  console.error('Error en pruebas API:', err);
  process.exit(1);
});
