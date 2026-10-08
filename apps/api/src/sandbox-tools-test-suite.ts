/**
 * Suite de las herramientas de sandbox: `+ Citas Demo` (seed) y `Limpiar`
 * (reset).
 *
 * `Limpiar` borra TODAS las citas, conversaciones y mensajes de la clínica,
 * no solo los de prueba. Antes lo podía disparar cualquier ADMIN de clínica
 * desde un botón que decía "datos de prueba"; aquí se fija que solo un
 * administrador de plataforma (`PLATFORM_ADMIN_EMAILS`) puede usar ambas
 * rutas, y que `/auth/me` le dice al panel quién lo es.
 */
import { db, hashPassword } from '@asistente/database';
import { buildServer } from './server.js';
import { AUTH_COOKIE_NAME } from './lib/auth.js';
import { isPlatformAdmin } from './lib/platformAdmin.js';

process.env.JWT_SECRET ||= 'sandbox-tools-test-secret-at-least-32-chars';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const platformEmail = `plataforma-${suffix}@asistente.test`;
const clinicAdminEmail = `admin-clinica-${suffix}@asistente.test`;
const receptionEmail = `recepcion-${suffix}@asistente.test`;
const password = 'SandboxTools2026!';

process.env.PLATFORM_ADMIN_EMAILS = `otro@asistente.test, ${platformEmail.toUpperCase()}`;

async function runSandboxToolsTests() {
  console.log('\n🧪 SUITE DE HERRAMIENTAS DE SANDBOX (SEED / RESET)\n');

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

  const app = await buildServer({ logger: false });
  await app.ready();

  async function login(email: string): Promise<Record<string, string>> {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    if (res.statusCode !== 200) throw new Error(`Login de ${email} respondió ${res.statusCode}`);
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    const token = raw.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`))?.[1] ?? '';
    return { cookie: `${AUTH_COOKIE_NAME}=${token}` };
  }

  const counts = async () => ({
    appointments: await db.appointment.count({ where: { tenantId: tenantId! } }),
    conversations: await db.conversation.count({ where: { tenantId: tenantId! } }),
    messages: await db.message.count({ where: { tenantId: tenantId! } }),
  });

  try {
    const passwordHash = await hashPassword(password);
    const tenant = await db.tenant.create({
      data: {
        name: `Clínica Sandbox ${suffix}`,
        slug: `clinica-sandbox-${suffix}`,
        phoneE164: '+525599004455',
        users: {
          create: [
            { email: platformEmail, name: 'Operador Plataforma', role: 'ADMIN', passwordHash },
            { email: clinicAdminEmail, name: 'Directora Clínica', role: 'ADMIN', passwordHash },
            { email: receptionEmail, name: 'Recepción', role: 'RECEPTIONIST', passwordHash },
          ],
        },
        doctors: { create: [{ name: 'Dra. Sandbox', specialty: 'Odontología General' }] },
        services: {
          create: [{ name: 'Valoración', durationMinutes: 30, priceMxn: 500, requiredDepositMxn: 0 }],
        },
      },
    });
    tenantId = tenant.id;

    const platform = await login(platformEmail);
    const clinicAdmin = await login(clinicAdminEmail);
    const reception = await login(receptionEmail);

    // ------------------------------------------------------------------
    console.log('▶ /auth/me expone isPlatformAdmin');
    const mePlatform = (await app.inject({ method: 'GET', url: '/auth/me', headers: platform })).json();
    const meClinic = (await app.inject({ method: 'GET', url: '/auth/me', headers: clinicAdmin })).json();
    const meReception = (await app.inject({ method: 'GET', url: '/auth/me', headers: reception })).json();
    assert(mePlatform.isPlatformAdmin === true, 'Un correo de PLATFORM_ADMIN_EMAILS (sin importar mayúsculas) es administrador de plataforma');
    assert(meClinic.isPlatformAdmin === false, 'El ADMIN de la clínica no es administrador de plataforma');
    assert(meReception.isPlatformAdmin === false, 'Recepción no es administrador de plataforma');

    // ------------------------------------------------------------------
    console.log('\n▶ + Citas Demo');
    const seedClinic = await app.inject({ method: 'POST', url: `/api/tenants/${tenant.id}/seed`, headers: clinicAdmin });
    const seedReception = await app.inject({ method: 'POST', url: `/api/tenants/${tenant.id}/seed`, headers: reception });
    assert(seedClinic.statusCode === 403, 'El ADMIN de clínica no puede sembrar datos de prueba (403)');
    assert(seedReception.statusCode === 403, 'Recepción no puede sembrar datos de prueba (403)');
    assert((await counts()).appointments === 0, 'Un seed rechazado no escribe nada');

    const seedPlatform = await app.inject({ method: 'POST', url: `/api/tenants/${tenant.id}/seed`, headers: platform });
    assert(seedPlatform.statusCode === 200 && seedPlatform.json().created === 4, 'El administrador de plataforma siembra 4 citas (200)');

    // ------------------------------------------------------------------
    console.log('\n▶ Limpiar');
    const before = await counts();
    const resetClinic = await app.inject({ method: 'DELETE', url: `/api/tenants/${tenant.id}/reset`, headers: clinicAdmin });
    const resetReception = await app.inject({ method: 'DELETE', url: `/api/tenants/${tenant.id}/reset`, headers: reception });
    assert(resetClinic.statusCode === 403, 'El ADMIN de clínica no puede borrar el historial (403)');
    assert(resetReception.statusCode === 403, 'Recepción no puede borrar el historial (403)');
    const afterRejected = await counts();
    assert(
      afterRejected.appointments === before.appointments &&
        afterRejected.conversations === before.conversations &&
        afterRejected.messages === before.messages,
      'Un reset rechazado deja intactas citas, conversaciones y mensajes'
    );

    const resetPlatform = await app.inject({ method: 'DELETE', url: `/api/tenants/${tenant.id}/reset`, headers: platform });
    const body = resetPlatform.json();
    assert(resetPlatform.statusCode === 200, 'El administrador de plataforma limpia la clínica (200)');
    assert(
      body.deleted?.appointments === before.appointments && body.deleted?.messages === before.messages,
      'La respuesta reporta cuántos registros se borraron'
    );
    const afterReset = await counts();
    assert(afterReset.appointments === 0 && afterReset.messages === 0, 'Tras el reset la clínica queda sin historial');

    // ------------------------------------------------------------------
    console.log('\n▶ Sin PLATFORM_ADMIN_EMAILS');
    const originalList = process.env.PLATFORM_ADMIN_EMAILS;
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.PLATFORM_ADMIN_EMAILS;
      process.env.NODE_ENV = 'production';
      assert(
        !isPlatformAdmin({ email: platformEmail, role: 'ADMIN' }),
        'En producción sin lista nadie es administrador de plataforma (falla cerrado)'
      );
      process.env.NODE_ENV = 'development';
      assert(
        isPlatformAdmin({ email: clinicAdminEmail, role: 'ADMIN' }) &&
          !isPlatformAdmin({ email: receptionEmail, role: 'RECEPTIONIST' }),
        'En desarrollo sin lista cualquier ADMIN lo es, pero nunca otro rol'
      );
    } finally {
      process.env.PLATFORM_ADMIN_EMAILS = originalList;
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  } finally {
    if (tenantId) {
      await db.message.deleteMany({ where: { tenantId } });
      await db.conversation.deleteMany({ where: { tenantId } });
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO SANDBOX: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runSandboxToolsTests()
  .catch((error) => {
    console.error('Error en la suite de sandbox:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
