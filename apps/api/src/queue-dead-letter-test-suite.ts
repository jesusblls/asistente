import { db, hashPassword } from '@asistente/database';
import { buildServer } from './server.js';
import { AUTH_COOKIE_NAME } from './lib/auth.js';
import { drainQueue, enqueueVoiceFollowUp } from './services/queue/handlers.js';
import { maskJobText } from './services/queue/queue.js';

/**
 * Suite de trabajos muertos (DEAD) de la cola durable.
 *
 * Antes, un trabajo que agotaba reintentos quedaba DEAD en silencio: un
 * META_INBOUND_MESSAGE muerto es un paciente sin respuesta y nadie se
 * enteraba. Aquí se verifica que (1) el gancho de descarte deja un log de
 * error estructurado sin PII, (2) solo un administrador de plataforma puede
 * listarlos, (3) el listado no expone teléfono ni texto del paciente y (4) el
 * reintento manual los devuelve a la cola, queda auditado y se procesan.
 */

process.env.JWT_SECRET ||= 'dead-letter-test-secret-at-least-32-chars';
process.env.META_VERIFY_TOKEN ||= 'dead-letter-test-meta-token';
process.env.META_APP_SECRET = 'dead-letter-test-meta-secret';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'dead-letter-test-mp-secret';
// Sin credenciales de Meta, WhatsAppService simula el envío: el seguimiento
// post-llamada reintentado puede completarse sin red.
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';

const RUN_ID = Date.now().toString(36);
const PLATFORM_EMAIL = `plataforma-${RUN_ID}@asistente.test`;
const CLINIC_EMAIL = `clinica-${RUN_ID}@asistente.test`;
const PASSWORD = 'ColaMuerta2026!Segura';
const PATIENT_PHONE = '+525511223344';
const PATIENT_TEXT = 'me duele muchisimo la muela del juicio';
const GHOST_TENANT = `ghost-tenant-${RUN_ID}`;

process.env.PLATFORM_ADMIN_EMAILS = PLATFORM_EMAIL;

async function runDeadLetterTests() {
  console.log('🪦 ========================================================');
  console.log('🪦 SUITE DE TRABAJOS MUERTOS (DEAD) DE LA COLA');
  console.log('🪦 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  let tenantId: string | null = null;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  async function sessionCookie(email: string): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } });
    const token = String(res.headers['set-cookie'] ?? '').match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`))?.[1];
    if (!token) throw new Error(`No se pudo iniciar sesión con ${email} (${res.statusCode})`);
    return `${AUTH_COOKIE_NAME}=${token}`;
  }

  try {
    const passwordHash = await hashPassword(PASSWORD);
    const tenant = await db.tenant.create({
      data: {
        name: `Cola Muerta Clinic ${RUN_ID}`,
        slug: `cola-muerta-${RUN_ID}`,
        phoneE164: '+525599004455',
        users: {
          create: [
            { email: PLATFORM_EMAIL, name: 'Plataforma', role: 'ADMIN', passwordHash },
            { email: CLINIC_EMAIL, name: 'Admin Clínica', role: 'ADMIN', passwordHash },
          ],
        },
      },
    });
    tenantId = tenant.id;

    const platformCookie = await sessionCookie(PLATFORM_EMAIL);
    const clinicCookie = await sessionCookie(CLINIC_EMAIL);

    // 1. El gancho de descarte registra en nivel error, con ids y sin PII.
    const ghostJobId = await enqueueVoiceFollowUp({
      tenantId: GHOST_TENANT,
      toPhoneE164: PATIENT_PHONE,
      callSid: `CA-dead-${RUN_ID}`,
    });

    const captured: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      captured.push(String(chunk));
      return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stderr.write;
    try {
      await drainQueue();
    } finally {
      process.stderr.write = originalWrite;
    }

    const ghostJob = ghostJobId ? await db.job.findUnique({ where: { id: ghostJobId } }) : null;
    assert(ghostJob?.status === 'DEAD', 'Un error permanente deja el trabajo en DEAD');

    const deadLine = captured
      .flatMap((chunk) => chunk.split('\n'))
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.msg === 'Trabajo descartado definitivamente (DEAD)' && entry?.jobId === ghostJobId);

    assert(Boolean(deadLine), 'El gancho de descarte emite un log estructurado para cualquier tipo');
    assert(deadLine?.level === 'error', 'El log de descarte es de nivel error');
    assert(
      deadLine?.type === 'VOICE_POST_CALL_FOLLOWUP' && deadLine?.tenantId === GHOST_TENANT,
      'El log de descarte incluye tipo y clínica'
    );
    assert(
      !JSON.stringify(deadLine ?? {}).includes(PATIENT_PHONE.slice(1)),
      'El log de descarte no incluye el teléfono del paciente'
    );

    const maskedError = maskJobText(
      'Meta 2026-10-08 12:00:01 phone_number_id 123456789012345 rechazó +52 55 1122 3344 y ana@clinica.mx'
    );
    assert(
      Boolean(maskedError) &&
        maskedError!.includes('2026-10-08') &&
        maskedError!.includes('123456789012345') &&
        !maskedError!.includes('1122 3344') &&
        !maskedError!.includes('ana@'),
      'maskJobText enmascara teléfonos y correos sin destrozar fechas ni ids de Meta'
    );

    // 2. Trabajos DEAD sembrados para la clínica de prueba.
    const now = Date.now();
    const inbound = await db.job.create({
      data: {
        type: 'META_INBOUND_MESSAGE',
        tenantId: tenant.id,
        status: 'DEAD',
        attempts: 5,
        maxAttempts: 5,
        payload: JSON.stringify({
          conversationId: `conv-${RUN_ID}`,
          patientId: `pat-${RUN_ID}`,
          tenantId: tenant.id,
          inboundMessageId: `msg-${RUN_ID}`,
          text: PATIENT_TEXT,
          channel: 'WHATSAPP',
        }),
        lastError: `Agente sin respuesta para ${PATIENT_PHONE}`,
        updatedAt: new Date(now - 2000),
      },
    });
    const send = await db.job.create({
      data: {
        type: 'WHATSAPP_SEND',
        tenantId: tenant.id,
        status: 'DEAD',
        attempts: 5,
        maxAttempts: 5,
        payload: JSON.stringify({ kind: 'TEXT', toPhoneE164: PATIENT_PHONE, text: PATIENT_TEXT }),
        lastError: 'Meta caído',
        updatedAt: new Date(now - 1000),
      },
    });
    const followUp = await db.job.create({
      data: {
        type: 'VOICE_POST_CALL_FOLLOWUP',
        tenantId: tenant.id,
        status: 'DEAD',
        attempts: 5,
        maxAttempts: 5,
        payload: JSON.stringify({ tenantId: tenant.id, toPhoneE164: PATIENT_PHONE }),
        lastError: 'Meta no aceptó el seguimiento post-llamada',
      },
    });

    // 3. Control de acceso.
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/queue/dead' });
    assert(anonymous.statusCode === 401, 'Sin sesión, el listado responde 401');

    const clinicList = await app.inject({
      method: 'GET',
      url: '/api/admin/queue/dead',
      headers: { cookie: clinicCookie },
    });
    assert(clinicList.statusCode === 403, 'El ADMIN de una clínica (no de plataforma) recibe 403');

    const clinicRetry = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${followUp.id}/retry`,
      headers: { cookie: clinicCookie },
    });
    assert(clinicRetry.statusCode === 403, 'El ADMIN de una clínica no puede reintentar (403)');

    // 4. Listado redactado y filtrado.
    const list = await app.inject({
      method: 'GET',
      url: `/api/admin/queue/dead?tenantId=${tenant.id}`,
      headers: { cookie: platformCookie },
    });
    const listBody = list.json() as {
      items: Array<Record<string, unknown> & { refs: Record<string, string> }>;
      total: number;
      nextCursor: string | null;
    };
    assert(list.statusCode === 200, 'El administrador de plataforma lista trabajos DEAD');
    assert(listBody.total === 3 && listBody.items.length === 3, 'El filtro por clínica devuelve sus 3 trabajos');
    assert(listBody.items[0]?.id === followUp.id, 'Orden: el más recientemente descartado primero');
    assert(
      !list.body.includes(PATIENT_TEXT) && !list.body.includes(PATIENT_PHONE.slice(1)),
      'El listado no expone texto ni teléfono del paciente'
    );
    assert(!list.body.includes('"payload"'), 'El listado no devuelve el payload crudo');
    const inboundItem = listBody.items.find((item) => item.id === inbound.id);
    assert(
      inboundItem?.refs.conversationId === `conv-${RUN_ID}` && inboundItem?.tenantName === tenant.name,
      'El listado incluye identificadores útiles y el nombre de la clínica'
    );
    const sendItem = listBody.items.find((item) => item.id === send.id);
    assert(
      typeof sendItem?.refs.toPhoneMasked === 'string' && sendItem.refs.toPhoneMasked.endsWith('344'),
      'El destinatario se muestra enmascarado'
    );

    const byType = await app.inject({
      method: 'GET',
      url: `/api/admin/queue/dead?tenantId=${tenant.id}&type=WHATSAPP_SEND`,
      headers: { cookie: platformCookie },
    });
    const byTypeBody = byType.json() as { items: Array<{ id: string }> };
    assert(
      byTypeBody.items.length === 1 && byTypeBody.items[0].id === send.id,
      'El filtro por tipo funciona'
    );

    const badType = await app.inject({
      method: 'GET',
      url: '/api/admin/queue/dead?type=INVENTADO',
      headers: { cookie: platformCookie },
    });
    assert(badType.statusCode === 400, 'Un tipo inexistente responde 400');

    const page1 = await app.inject({
      method: 'GET',
      url: `/api/admin/queue/dead?tenantId=${tenant.id}&limit=2`,
      headers: { cookie: platformCookie },
    });
    const page1Body = page1.json() as { items: Array<{ id: string }>; nextCursor: string | null };
    const page2 = await app.inject({
      method: 'GET',
      url: `/api/admin/queue/dead?tenantId=${tenant.id}&limit=2&cursor=${page1Body.nextCursor}`,
      headers: { cookie: platformCookie },
    });
    const page2Body = page2.json() as { items: Array<{ id: string }>; nextCursor: string | null };
    assert(
      page1Body.items.length === 2 &&
        Boolean(page1Body.nextCursor) &&
        page2Body.items.length === 1 &&
        page2Body.items[0].id === inbound.id &&
        page2Body.nextCursor === null,
      'La paginación por cursor recorre todos los trabajos sin repetir'
    );

    // 5. Reintento manual.
    const missing = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/no-existe-${RUN_ID}/retry`,
      headers: { cookie: platformCookie },
    });
    assert(missing.statusCode === 404, 'Reintentar un trabajo inexistente responde 404');

    const retry = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${followUp.id}/retry`,
      headers: { cookie: platformCookie },
    });
    assert(retry.statusCode === 200, 'El administrador de plataforma reintenta un trabajo DEAD');

    const requeued = await db.job.findUnique({ where: { id: followUp.id } });
    assert(
      requeued?.status === 'PENDING' && requeued.attempts === 0 && requeued.runAt.getTime() <= Date.now(),
      'El trabajo vuelve a PENDING con intentos en cero y listo para correr'
    );

    const retryAgain = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${followUp.id}/retry`,
      headers: { cookie: platformCookie },
    });
    assert(retryAgain.statusCode === 409, 'Reintentar un trabajo que ya no está DEAD responde 409');

    const auditRow = await db.auditLog.findFirst({
      where: { tenantId: tenant.id, entityType: 'JOB', entityId: followUp.id, action: 'UPDATE' },
    });
    assert(
      Boolean(auditRow) && auditRow?.actorEmail === PLATFORM_EMAIL,
      'El reintento queda auditado en la clínica dueña del trabajo'
    );

    // 6. Takeover: no se reenvía una respuesta de la IA a una conversación que
    // recepción ya tomó (CLAUDE.md § 1.5).
    const patient = await db.patient.create({
      data: { tenantId: tenant.id, fullName: 'Paciente Takeover', phoneE164: PATIENT_PHONE },
    });
    const conversation = await db.conversation.create({
      data: {
        tenantId: tenant.id,
        patientId: patient.id,
        channel: 'WHATSAPP',
        externalChannelId: PATIENT_PHONE,
        isHandedOverToHuman: true,
      },
    });
    const aiMessage = await db.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        senderRole: 'AI_AGENT',
        content: 'Respuesta de la IA',
        channel: 'WHATSAPP',
        deliveryStatus: 'FAILED',
      },
    });
    const aiSend = await db.job.create({
      data: {
        type: 'WHATSAPP_SEND',
        tenantId: tenant.id,
        status: 'DEAD',
        attempts: 5,
        maxAttempts: 5,
        payload: JSON.stringify({
          kind: 'TEXT',
          toPhoneE164: PATIENT_PHONE,
          text: 'Respuesta de la IA',
          messageId: aiMessage.id,
        }),
      },
    });
    const takeoverRetry = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${aiSend.id}/retry`,
      headers: { cookie: platformCookie },
    });
    const aiSendAfter = await db.job.findUnique({ where: { id: aiSend.id } });
    assert(
      takeoverRetry.statusCode === 409 && aiSendAfter?.status === 'DEAD',
      'No se reintenta una respuesta de la IA si la conversación está en modo humano'
    );

    await drainQueue();
    const processed = await db.job.findUnique({ where: { id: followUp.id } });
    assert(
      processed?.status === 'DONE' && processed.lastError === null,
      'El trabajo reintentado lo procesa el worker y termina DONE'
    );
  } finally {
    await db.job.deleteMany({ where: { tenantId: { in: [tenantId ?? '', GHOST_TENANT] } } });
    if (tenantId) await db.tenant.deleteMany({ where: { id: tenantId } });
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE TRABAJOS MUERTOS PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runDeadLetterTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
