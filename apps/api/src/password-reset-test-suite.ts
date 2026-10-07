import { db, hashPassword } from '@asistente/database';
import { buildServer } from './server.js';
import { AUTH_COOKIE_NAME } from './lib/auth.js';
import type { OutgoingEmail } from './services/emailService.js';

process.env.JWT_SECRET ||= 'password-reset-test-secret-at-least-32-chars';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';
process.env.APP_PUBLIC_URL = 'https://panel.test';

async function runPasswordResetTests() {
  console.log('🔑 ========================================================');
  console.log('🔑 INICIANDO PRUEBAS DE RECUPERACIÓN DE CONTRASEÑA');
  console.log('🔑 ========================================================\n');

  const outbox: OutgoingEmail[] = [];
  const app = await buildServer({
    logger: false,
    sendEmail: async (email) => {
      outbox.push(email);
    },
  });
  await app.ready();

  let passed = 0;
  let failed = 0;
  let tenantId: string | null = null;
  const suffix = Date.now().toString(36);
  const email = `reset-test-${suffix}@asistente.test`;
  const oldPassword = 'ContrasenaVieja2026!';
  const newPassword = 'ContrasenaNueva2026!';

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  const tokenFrom = (message: OutgoingEmail | undefined) =>
    message?.text.match(/\/restablecer#token=([A-Za-z0-9_-]+)/)?.[1] ?? '';

  const login = (password: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });

  try {
    const tenant = await db.tenant.create({
      data: {
        name: `Reset Test Clinic ${suffix}`,
        slug: `reset-test-${suffix}`,
        phoneE164: '+525599001133',
        users: {
          create: [{ email, name: 'Reset User', role: 'ADMIN', passwordHash: await hashPassword(oldPassword) }],
        },
      },
    });
    tenantId = tenant.id;

    const oldLogin = await login(oldPassword);
    const oldSession = String(oldLogin.headers['set-cookie'] ?? '').match(
      new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`)
    )?.[1];
    assert(Boolean(oldSession), 'Sesión previa abierta con la contraseña vieja');

    // 1. Correo inexistente: misma respuesta, ningún correo enviado.
    const unknownRes = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: `nadie-${suffix}@asistente.test` },
    });
    const knownRes = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: email.toUpperCase() },
    });
    assert(
      unknownRes.statusCode === 200 && knownRes.statusCode === 200 && unknownRes.body === knownRes.body,
      'Correo existente e inexistente reciben respuesta idéntica'
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert(outbox.length === 1 && outbox[0].to === email, 'Solo se envía correo al usuario existente');

    const token = tokenFrom(outbox[0]);
    assert(token.length >= 40, 'El correo trae el enlace con token');
    assert(
      outbox[0].text.includes('https://panel.test/restablecer#token='),
      'El token viaja en el fragmento (#), no en la query'
    );

    const stored = await db.passwordResetToken.findFirst({ where: { user: { email } } });
    assert(Boolean(stored) && stored!.tokenHash !== token, 'La base guarda el hash, no el token');

    // 2. Una segunda petición inmediata no inunda el buzón.
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });
    await new Promise((resolve) => setImmediate(resolve));
    assert(outbox.length === 1, 'Pausa de 60 s entre enlaces al mismo correo');

    // 3. Contraseña corta y token falso se rechazan.
    const shortRes = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token, password: 'corta' },
    });
    assert(shortRes.statusCode === 400, 'Contraseña de menos de 10 caracteres responde 400');

    const forgedRes = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'token-inventado', password: newPassword },
    });
    assert(forgedRes.statusCode === 400, 'Token inventado responde 400');

    // 4. Restablecer con el token válido.
    const resetRes = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token, password: newPassword },
    });
    assert(resetRes.statusCode === 200, 'POST /auth/reset-password con token válido responde 200');

    const reuseRes = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token, password: 'OtraContrasena2026!' },
    });
    assert(reuseRes.statusCode === 400, 'El enlace no se puede usar dos veces');

    assert((await login(oldPassword)).statusCode === 401, 'La contraseña vieja ya no entra');

    // `iat` va en segundos: la sesión nueva debe emitirse en un segundo
    // posterior al restablecimiento para probar el corte de forma honesta.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const newLogin = await login(newPassword);
    assert(newLogin.statusCode === 200, 'La contraseña nueva entra');

    const staleMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${oldSession}` },
    });
    assert(staleMe.statusCode === 401, 'La sesión abierta antes del restablecimiento queda invalidada');

    const freshMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${JSON.parse(newLogin.body).token}` },
    });
    assert(freshMe.statusCode === 200, 'La sesión nueva sí funciona');

    // 5. Enlace vencido.
    await db.passwordResetToken.deleteMany({ where: { user: { email } } });
    outbox.length = 0;
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });
    await new Promise((resolve) => setImmediate(resolve));
    const expiredToken = tokenFrom(outbox[0]);
    await db.passwordResetToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredRes = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: expiredToken, password: 'OtraContrasena2026!' },
    });
    assert(expiredRes.statusCode === 400, 'Enlace vencido responde 400');

    const audits = await db.auditLog.findMany({
      where: { tenantId, action: { in: ['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET'] } },
      select: { action: true },
    });
    assert(
      audits.some((row) => row.action === 'PASSWORD_RESET_REQUESTED') &&
        audits.some((row) => row.action === 'PASSWORD_RESET'),
      'Solicitud y restablecimiento quedan en AuditLog'
    );
  } finally {
    if (tenantId) {
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE RECUPERACIÓN PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runPasswordResetTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
