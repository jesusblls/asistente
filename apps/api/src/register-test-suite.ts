import { db } from '@asistente/database';
import { LEGAL_VERSION } from '@asistente/shared-types';
import { buildServer } from './server.js';

process.env.JWT_SECRET ||= 'register-test-secret-at-least-32-chars-long';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';

async function runRegisterTests() {
  console.log('📝 ========================================================');
  console.log('📝 INICIANDO PRUEBAS DE REGISTRO Y ACEPTACIÓN LEGAL');
  console.log('📝 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  const suffix = Date.now().toString(36);
  const email = `registro-${suffix}@asistente.test`;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  const base = {
    clinicName: `Clínica Registro ${suffix}`,
    phoneE164: '55 1234 5678',
    adminName: 'Persona Registro',
    email,
    password: 'RegistroSeguro2026!',
  };

  try {
    const missing = await app.inject({ method: 'POST', url: '/auth/register', payload: base });
    assert(missing.statusCode === 400, 'Sin aceptar los documentos legales responde 400');

    const stale = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...base, acceptedLegalVersion: '2000-01-01' },
    });
    assert(
      stale.statusCode === 400 && JSON.parse(stale.body).error.includes('vigentes'),
      'Aceptar una versión vieja responde 400 y pide recargar'
    );

    const created = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...base, acceptedLegalVersion: LEGAL_VERSION },
    });
    assert(created.statusCode === 201, 'Con la versión vigente la cuenta se crea (201)');

    const tenantId = created.statusCode === 201 ? JSON.parse(created.body).tenant.id : null;
    const audit = tenantId
      ? await db.auditLog.findFirst({ where: { tenantId, action: 'CREATE', entityType: 'TENANT' } })
      : null;
    assert(
      Boolean(audit?.metadata && JSON.parse(audit.metadata).acceptedLegalVersion === LEGAL_VERSION),
      'La versión aceptada queda en la auditoría del alta'
    );
  } finally {
    await db.tenant.deleteMany({ where: { users: { some: { email } } } });
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE REGISTRO PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runRegisterTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
