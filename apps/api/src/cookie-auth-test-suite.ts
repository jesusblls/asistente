import { db, hashPassword } from '@asistente/database';
import { buildServer } from './server.js';
import { AUTH_COOKIE_NAME } from './lib/auth.js';

process.env.JWT_SECRET ||= 'cookie-auth-test-secret-at-least-32-chars';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';

async function runCookieAuthTests() {
  console.log('🍪 ========================================================');
  console.log('🍪 INICIANDO PRUEBAS DE SESIÓN HTTPONLY Y LOGOUT');
  console.log('🍪 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  let tenantId: string | null = null;
  const suffix = Date.now().toString(36);
  const email = `cookie-test-${suffix}@asistente.test`;
  const password = 'CookieAuthPass2026!';

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
    const tenant = await db.tenant.create({
      data: {
        name: `Cookie Test Clinic ${suffix}`,
        slug: `cookie-test-${suffix}`,
        phoneE164: '+525599001122',
        users: {
          create: [
            {
              email,
              name: 'Cookie User',
              role: 'ADMIN',
              passwordHash: await hashPassword(password),
            },
          ],
        },
      },
    });
    tenantId = tenant.id;

    // 1. Login con credenciales válidas emite Set-Cookie httpOnly
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });
    assert(loginRes.statusCode === 200, 'POST /auth/login responde 200');

    const setCookieHeader = loginRes.headers['set-cookie'];
    const setCookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : String(setCookieHeader);
    assert(setCookieStr.includes(AUTH_COOKIE_NAME), 'Set-Cookie contiene asistente_session');
    assert(/httponly/i.test(setCookieStr), 'Set-Cookie tiene bandera HttpOnly');
    assert(/samesite=lax/i.test(setCookieStr), 'Set-Cookie tiene SameSite=Lax');

    const cookieMatch = setCookieStr.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
    const sessionToken = cookieMatch ? cookieMatch[1] : '';
    assert(Boolean(sessionToken), 'Token extraído de la cookie asistente_session');

    // 2. Acceso a /auth/me usando la cookie httpOnly
    const meWithCookieRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${sessionToken}`,
      },
    });
    assert(meWithCookieRes.statusCode === 200, 'GET /auth/me autentica exitosamente con cookie');
    const meBody = JSON.parse(meWithCookieRes.body);
    assert(meBody.user?.email === email, 'GET /auth/me retorna los datos del usuario correcto');

    // 3. Acceso sin cookie ni header responde 401
    const meWithoutAuthRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    assert(meWithoutAuthRes.statusCode === 401, 'GET /auth/me sin autenticación responde 401');

    // 4. Acceso con cookie inválida responde 401
    const meWithBadCookieRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=token_invalido_totalmente`,
      },
    });
    assert(meWithBadCookieRes.statusCode === 401, 'GET /auth/me con cookie alterada responde 401');

    // 5. Retrocompatibilidad: Acceso con encabezado Authorization Bearer sigue funcionando
    const meWithBearerRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });
    assert(meWithBearerRes.statusCode === 200, 'GET /auth/me con Authorization: Bearer mantiene compatibilidad');

    // 6. Logout limpia la cookie y registra en auditoría
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${sessionToken}`,
      },
    });
    assert(logoutRes.statusCode === 200, 'POST /auth/logout responde 200');
    const logoutSetCookie = String(logoutRes.headers['set-cookie'] || '');
    assert(
      logoutSetCookie.includes(`${AUTH_COOKIE_NAME}=`) &&
        (logoutSetCookie.includes('Max-Age=0') || logoutSetCookie.includes('Expires=')),
      'POST /auth/logout instruye al navegador limpiar la cookie asistente_session'
    );

    // Verificar rastro de auditoría de LOGOUT
    const auditRow = await db.auditLog.findFirst({
      where: {
        tenantId,
        actorEmail: email,
        action: 'LOGOUT',
      },
    });
    assert(Boolean(auditRow), 'Evento LOGOUT registrado en AuditLog');
  } finally {
    if (tenantId) {
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE COOKIE AUTH PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runCookieAuthTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
