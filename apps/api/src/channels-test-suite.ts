import { randomBytes } from 'node:crypto';
import { db, hashPassword, isEncryptedCredential } from '@asistente/database';
import { buildServer } from './server.js';
import { WhatsAppService } from './services/whatsappService.js';
import { drainQueue, jobQueue } from './services/queue/handlers.js';

process.env.JWT_SECRET ||= 'channels-test-secret-at-least-32-characters';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
// Sin número global: así se prueba que el envío sale con el número de la clínica.
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';
process.env.WHATSAPP_SEND_ATTEMPTS = '1';
process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString('base64');

/**
 * Número propio de WhatsApp por clínica (`/api/channels`).
 *
 * Cubre: alta/edición/baja, que nunca se filtre el token, aislamiento entre
 * clínicas, permisos (solo ADMIN), que el envío use las credenciales de la
 * clínica y que en producción sin credenciales el mensaje quede FAILED.
 */
async function runChannelTests() {
  console.log('📱 ========================================================');
  console.log('📱 INICIANDO PRUEBAS DE CANALES (WHATSAPP POR CLÍNICA)');
  console.log('📱 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  const tenantIds: string[] = [];
  const suffix = Date.now().toString(36);
  const password = 'CanalesPrueba2026!';
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

  async function createClinic(label: string, phone: string) {
    const admin = `admin-${label}-${suffix}@asistente.test`;
    const staff = `staff-${label}-${suffix}@asistente.test`;
    const tenant = await db.tenant.create({
      data: {
        name: `Canales ${label} ${suffix}`,
        slug: `canales-${label}-${suffix}`,
        phoneE164: phone,
        users: {
          create: [
            { email: admin, name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword(password) },
            { email: staff, name: 'Recepción', role: 'RECEPTIONIST', passwordHash: await hashPassword(password) },
          ],
        },
      },
    });
    tenantIds.push(tenant.id);
    return { tenant, admin, staff };
  }

  async function bearer(email: string): Promise<Record<string, string>> {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    return { authorization: `Bearer ${JSON.parse(res.body).token}` };
  }

  const tokenA = `EAAG${'a'.repeat(40)}SECRETA1234`;
  const tokenB = `EAAG${'b'.repeat(40)}SECRETB5678`;
  const platformToken = `EAAG${'p'.repeat(40)}PLATAFORMA99`;

  // Meta simulado: cada token solo controla su propio número.
  const owners: Record<string, string> = {
    [tokenA]: '111222333444',
    [tokenB]: '555666777888',
    [platformToken]: '900000000001',
  };
  const calls: { url: string; auth: string }[] = [];
  let graphMode: 'normal' | 'unauthorized' | 'offline' = 'normal';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('authorization') ?? '';
    calls.push({ url, auth });
    if (graphMode === 'offline') throw new Error('sin red');
    if (url.includes('/messages')) {
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 });
    }
    if (graphMode === 'unauthorized') {
      return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 401 });
    }
    const id = url.split('/').pop()!.split('?')[0];
    const owned = owners[auth.replace('Bearer ', '')] === id;
    return owned
      ? new Response(
          JSON.stringify({ display_phone_number: '+52 55 9900 2201', verified_name: 'Clínica A', quality_rating: 'GREEN' }),
          { status: 200 }
        )
      : new Response(JSON.stringify({ error: { message: 'Unsupported get request' } }), { status: 400 });
  }) as typeof fetch;

  try {
    const clinicA = await createClinic('a', '+525599002201');
    const clinicB = await createClinic('b', '+525599002202');
    const adminA = await bearer(clinicA.admin);
    const staffA = await bearer(clinicA.staff);
    const adminB = await bearer(clinicB.admin);

    console.log('🔐 1. Permisos');
    const staffGet = await app.inject({ method: 'GET', url: '/api/channels', headers: staffA });
    const staffPut = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: staffA,
      payload: { phoneNumberId: '111222333444', accessToken: tokenA, displayPhoneNumber: '+525599002201' },
    });
    assert(staffGet.statusCode === 403 && staffPut.statusCode === 403, 'Un usuario no ADMIN recibe 403');
    const anon = await app.inject({ method: 'GET', url: '/api/channels' });
    assert(anon.statusCode === 401, 'Sin sesión responde 401');

    console.log('\n📝 2. Alta y estado');
    const empty = JSON.parse((await app.inject({ method: 'GET', url: '/api/channels', headers: adminA })).body);
    assert(
      empty.whatsapp.configured === false && empty.whatsapp.source === 'NONE',
      'Sin número propio ni global, el estado es NONE (no "conectado")'
    );

    const firstWithoutToken = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminA,
      payload: { phoneNumberId: '111222333444', displayPhoneNumber: '+525599002201' },
    });
    assert(firstWithoutToken.statusCode === 400, 'La primera vez el token es obligatorio');

    const badId = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminA,
      payload: { phoneNumberId: 'abc-123', accessToken: tokenA, displayPhoneNumber: '+525599002201' },
    });
    assert(badId.statusCode === 400, 'Phone Number ID con letras se rechaza');

    const putA = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminA,
      payload: {
        phoneNumberId: '111222333444',
        accessToken: tokenA,
        displayPhoneNumber: '55 9900 2201',
        wabaId: '999888777',
      },
    });
    const putABody = JSON.parse(putA.body);
    assert(putA.statusCode === 200 && putABody.whatsapp.configured === true, 'PUT guarda el número de la clínica');
    assert(putABody.whatsapp.source === 'CLINIC', 'El origen del envío pasa a ser el número propio');
    assert(putABody.whatsapp.displayPhoneNumber === '+525599002201', 'El número visible se normaliza a E.164');
    assert(putABody.whatsapp.tokenLast4 === '1234', 'Solo se expone el final del token');
    assert(putABody.verification?.ok === true, 'El número se verifica con Meta al guardarlo');
    assert(!putA.body.includes(tokenA) && !putA.body.includes('aaaaaaaa'), 'La respuesta del PUT no trae el token');

    const getA = await app.inject({ method: 'GET', url: '/api/channels', headers: adminA });
    assert(!getA.body.includes(tokenA) && !getA.body.includes('accessToken'), 'GET /api/channels no filtra el token');

    const row = await db.channelConfig.findFirst({ where: { tenantId: clinicA.tenant.id, channelType: 'WHATSAPP' } });
    assert(Boolean(row) && isEncryptedCredential(row!.credentials) && !row!.credentials.includes(tokenA), 'El token queda cifrado en la base');

    const audit = await db.auditLog.findFirst({
      where: { tenantId: clinicA.tenant.id, entityType: 'CHANNEL_CONFIG', action: 'CREATE' },
    });
    assert(Boolean(audit) && !JSON.stringify(audit).includes(tokenA), 'El alta queda en auditoría sin el token');

    // Editar sin token conserva el guardado.
    const keepToken = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminA,
      payload: { phoneNumberId: '111222333444', displayPhoneNumber: '+525599002299', accessToken: '' },
    });
    const keepBody = JSON.parse(keepToken.body);
    assert(
      keepToken.statusCode === 200 && keepBody.whatsapp.tokenLast4 === '1234' && keepBody.whatsapp.displayPhoneNumber === '+525599002299',
      'Editar sin token conserva el token guardado'
    );

    console.log('\n🏥 3. Aislamiento entre clínicas');
    const getB = JSON.parse((await app.inject({ method: 'GET', url: '/api/channels', headers: adminB })).body);
    assert(getB.whatsapp.configured === false && getB.whatsapp.phoneNumberId === null, 'La clínica B no ve el número de A');

    const stealB = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminB,
      payload: { phoneNumberId: '111222333444', accessToken: tokenB, displayPhoneNumber: '+525599002202' },
    });
    assert(stealB.statusCode === 409, 'B no puede registrar el Phone Number ID de A (409)');

    process.env.NODE_ENV = 'production';
    process.env.META_PHONE_NUMBER_ID = '900000000001';
    const stealProd = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminB,
      payload: { phoneNumberId: '123123123123', accessToken: tokenB, displayPhoneNumber: '+525599002202' },
    });
    const platformProd = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminB,
      payload: { phoneNumberId: '900000000001', accessToken: tokenB, displayPhoneNumber: '+525599002202' },
    });
    process.env.NODE_ENV = originalNodeEnv;
    process.env.META_PHONE_NUMBER_ID = '';
    assert(stealProd.statusCode === 400, 'En producción no se guarda un número que el token no controla');
    assert(platformProd.statusCode === 409, 'Nadie puede reclamar el número compartido de la plataforma');

    const putB = await app.inject({
      method: 'PUT',
      url: '/api/channels/whatsapp',
      headers: adminB,
      payload: { phoneNumberId: '555666777888', accessToken: tokenB, displayPhoneNumber: '+525599002202' },
    });
    assert(putB.statusCode === 200, 'B registra su propio número');

    console.log('\n📤 4. El envío usa las credenciales de la clínica');
    calls.length = 0;

    const sentA = await WhatsAppService.sendMessage({
      tenantId: clinicA.tenant.id,
      toPhoneE164: '+525511112222',
      text: 'Hola desde A',
    });
    const sentB = await WhatsAppService.sendMessage({
      tenantId: clinicB.tenant.id,
      toPhoneE164: '+525511113333',
      text: 'Hola desde B',
    });
    assert(
      sentA && calls[0]?.url.includes('/111222333444/messages') && calls[0]?.auth === `Bearer ${tokenA}`,
      'Clínica A envía con su Phone Number ID y su token'
    );
    assert(
      sentB && calls[1]?.url.includes('/555666777888/messages') && calls[1]?.auth === `Bearer ${tokenB}`,
      'Clínica B envía con su Phone Number ID y su token'
    );

    // El paciente escribió al número compartido: se le contesta desde ese número.
    process.env.META_WHATSAPP_TOKEN = platformToken;
    calls.length = 0;
    await WhatsAppService.sendMessage({
      tenantId: clinicA.tenant.id,
      phoneNumberId: '900000000001',
      toPhoneE164: '+525511112222',
      text: 'Respuesta al número compartido',
    });
    process.env.META_WHATSAPP_TOKEN = '';
    assert(
      calls[0]?.url.includes('/900000000001/messages') && calls[0]?.auth === `Bearer ${platformToken}`,
      'Si el paciente escribió a otro número, la respuesta sale de ese mismo número'
    );

    console.log('\n🧪 5. Probar conexión');
    calls.length = 0;
    const testOk = JSON.parse(
      (await app.inject({ method: 'POST', url: '/api/channels/whatsapp/test', headers: adminA })).body
    );
    assert(
      testOk.ok === true && testOk.verifiedName === 'Clínica A' && calls[0]?.url.includes('/111222333444?'),
      'Probar conexión consulta a Meta el número de la clínica'
    );
    graphMode = 'unauthorized';
    const testBad = JSON.parse(
      (await app.inject({ method: 'POST', url: '/api/channels/whatsapp/test', headers: adminA })).body
    );
    assert(testBad.ok === false && testBad.reason === 'UNAUTHORIZED', 'Token rechazado por Meta se reporta como UNAUTHORIZED');
    graphMode = 'offline';
    const testOffline = JSON.parse(
      (await app.inject({ method: 'POST', url: '/api/channels/whatsapp/test', headers: adminA })).body
    );
    assert(testOffline.ok === false && testOffline.reason === 'NETWORK', 'Sin red se informa en vez de fallar');
    const staffTest = await app.inject({ method: 'POST', url: '/api/channels/whatsapp/test', headers: staffA });
    assert(staffTest.statusCode === 403, 'Probar conexión también exige ADMIN');
    graphMode = 'normal';

    console.log('\n🗑️ 6. Baja');
    const delA = await app.inject({ method: 'DELETE', url: '/api/channels/whatsapp', headers: adminA });
    assert(delA.statusCode === 200 && JSON.parse(delA.body).whatsapp.configured === false, 'DELETE quita el número de A');
    const stillB = await db.channelConfig.count({ where: { tenantId: clinicB.tenant.id } });
    assert(stillB === 1, 'Borrar el de A no toca el de B');
    const delAgain = await app.inject({ method: 'DELETE', url: '/api/channels/whatsapp', headers: adminA });
    assert(delAgain.statusCode === 404, 'Borrar de nuevo responde 404');

    console.log('\n🚫 7. Producción sin credenciales no marca SENT');
    process.env.NODE_ENV = 'production';
    const prodSend = await WhatsAppService.sendMessage({
      tenantId: clinicA.tenant.id,
      toPhoneE164: '+525511112222',
      text: 'No debe simularse',
    });
    assert(prodSend === false, 'sendMessage devuelve false en producción sin credenciales');

    const patient = await db.patient.create({
      data: { tenantId: clinicA.tenant.id, fullName: 'Paciente Canal', phoneE164: '+525511112222' },
    });
    const conversation = await db.conversation.create({
      data: {
        tenantId: clinicA.tenant.id,
        patientId: patient.id,
        channel: 'WHATSAPP',
        externalChannelId: `wa-${suffix}`,
      },
    });
    const replyRes = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversation.id}/reply`,
      headers: adminA,
      payload: { text: 'Respuesta manual' },
    });

    // Un envío por la cola sin credenciales no debe gastar reintentos: ninguno
    // va a funcionar, y mientras tanto el mensaje se vería "en camino".
    const queuedId = await jobQueue.enqueue({
      type: 'WHATSAPP_SEND',
      tenantId: clinicA.tenant.id,
      dedupeKey: `wa-sin-credenciales:${suffix}`,
      payload: { kind: 'TEXT', toPhoneE164: '+525511112222', text: 'Desde la cola' },
    });
    await drainQueue();
    const queuedJob = queuedId ? await db.job.findUnique({ where: { id: queuedId } }) : null;
    process.env.NODE_ENV = originalNodeEnv;
    assert(
      queuedJob?.status === 'DEAD' && queuedJob.attempts === 1,
      'En producción sin credenciales, el trabajo de la cola falla al primer intento'
    );
    if (queuedId) await db.job.deleteMany({ where: { id: queuedId } });
    assert(
      replyRes.statusCode === 200 && JSON.parse(replyRes.body).deliveryStatus === 'FAILED',
      'La respuesta manual queda FAILED, no SENT'
    );

    const devSend = await WhatsAppService.sendMessage({
      tenantId: clinicA.tenant.id,
      toPhoneE164: '+525511112222',
      text: 'Simulación de desarrollo',
    });
    assert(devSend === true, 'En desarrollo se conserva la simulación');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    for (const id of tenantIds) {
      await db.tenant.deleteMany({ where: { id } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE CANALES PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runChannelTests()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
