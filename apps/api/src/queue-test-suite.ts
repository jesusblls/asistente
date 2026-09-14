import { db, encryptCredentials } from '@asistente/database';
import { buildServer } from './server.js';
import { computeMetaSignature } from './lib/webhookSecurity.js';
import { JobQueue } from './services/queue/queue.js';
import { drainQueue, enqueueVoiceFollowUp, jobQueue } from './services/queue/handlers.js';

/**
 * Suite de la cola durable de webhooks/outbox.
 *
 * Verifica el hallazgo I3/I11 de la auditoría: los webhooks deben responder de
 * inmediato (Meta reintenta si tardamos) y el trabajo pesado debe ejecutarse
 * fuera del request, con reintentos e idempotencia.
 */

process.env.JWT_SECRET ||= 'queue-test-secret-with-32-characters';
process.env.META_VERIFY_TOKEN ||= 'queue-test-verify-token';
process.env.META_APP_SECRET = 'queue-test-meta-secret';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'queue-test-mp-secret';
process.env.META_WHATSAPP_TOKEN = 'queue-test-wa-token';
process.env.META_PHONE_NUMBER_ID = 'queue-test-default-phone-id';
// Llave fija de prueba (32 bytes 'a' en base64): los fixtures de canal se
// guardan cifrados, como en producción, y el webhook los descifra al resolver.
process.env.CREDENTIALS_ENCRYPTION_KEY ||= 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';
// Un solo intento por ejecución del job: así se prueba el reintento de la cola
// y no el reintento interno del cliente de WhatsApp.
process.env.WHATSAPP_SEND_ATTEMPTS = '1';
process.env.WHATSAPP_RETRY_DELAY_MS = '1';
delete process.env.WEBHOOK_ALLOW_UNVERIFIED;

const RUN_ID = `queue-${Date.now()}`;
const CALLER_PHONE = '+525588990011';
const PHONE_NUMBER_ID = `pn-${RUN_ID}`;
const WAMID = `wamid.${RUN_ID}`;

interface MockState {
  waFailures: number;
  waCalls: number;
  sentTexts: string[];
}

const state: MockState = { waFailures: 0, waCalls: 0, sentTexts: [] };

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  if (url.includes('graph.facebook.com')) {
    state.waCalls += 1;

    if (state.waFailures > 0) {
      state.waFailures -= 1;
      return new Response(JSON.stringify({ error: { message: 'Meta caído' } }), { status: 500 });
    }

    try {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const text = body?.text?.body ?? body?.interactive?.body?.text;
      if (typeof text === 'string') state.sentTexts.push(text);
    } catch {
      // El cuerpo no es JSON válido: no es motivo para fallar la prueba.
    }

    return new Response(JSON.stringify({ messages: [{ id: 'wamid.sent' }] }), { status: 200 });
  }

  return new Response('{}', { status: 200 });
}) as typeof fetch;

async function runQueueTests() {
  console.log('📤 ========================================================');
  console.log('📤 SUITE DE COLA DURABLE (WEBHOOKS ASÍNCRONOS + OUTBOX)');
  console.log('📤 ========================================================\n');

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

  // Aislamiento: la cola es global; se parte de cero para que los conteos sean deterministas.
  await db.job.deleteMany({});

  // Reloj y azar controlados para que el backoff sea verificable.
  let clock = new Date('2026-09-13T18:00:00.000Z');
  const executions: string[] = [];

  const engineQueue = new JobQueue({
    workerId: 'queue-test-worker',
    baseBackoffMs: 1000,
    maxBackoffMs: 60_000,
    now: () => clock,
    random: () => 1,
    handlers: {
      META_INBOUND_MESSAGE: async (payload: any) => {
        executions.push(`ok:${payload.marker}`);
      },
      WHATSAPP_SEND: async (payload: any) => {
        if (payload.alwaysFail) throw new Error('fallo simulado');
        executions.push(`wa:${payload.marker}`);
      },
      VOICE_POST_CALL_FOLLOWUP: async (payload: any) => {
        executions.push(`voice:${payload.marker}`);
      },
    },
  });

  try {
    // ---------------------------------------------------------------
    console.log('🧱 1. Motor de la cola');
    const firstJobId = await engineQueue.enqueue({
      type: 'META_INBOUND_MESSAGE',
      payload: { marker: 'uno' },
      dedupeKey: `${RUN_ID}:uno`,
      tenantId: 'queue-test-tenant',
    });
    assert(typeof firstJobId === 'string', 'enqueue persiste el trabajo y devuelve su id');

    const stored = await db.job.findUnique({ where: { id: firstJobId! } });
    assert(
      stored?.status === 'PENDING' && stored.attempts === 0,
      'el trabajo nace en estado PENDING sin intentos consumidos'
    );

    const deduped = await engineQueue.enqueue({
      type: 'META_INBOUND_MESSAGE',
      payload: { marker: 'duplicado' },
      dedupeKey: `${RUN_ID}:uno`,
      tenantId: 'queue-test-tenant',
    });
    const dedupeCount = await db.job.count({ where: { dedupeKey: `${RUN_ID}:uno` } });
    assert(
      deduped === null && dedupeCount === 1,
      'dedupeKey impide encolar dos veces el mismo trabajo (idempotencia)'
    );

    const processed = await engineQueue.runOnce();
    const done = await db.job.findUnique({ where: { id: firstJobId! } });
    assert(
      processed === 1 && done?.status === 'DONE' && executions.includes('ok:uno'),
      'runOnce reclama y ejecuta el trabajo hasta marcarlo DONE'
    );

    const failingJobId = await engineQueue.enqueue({
      type: 'WHATSAPP_SEND',
      payload: { marker: 'falla', alwaysFail: true },
      dedupeKey: `${RUN_ID}:falla`,
      maxAttempts: 2,
      tenantId: 'queue-test-tenant',
    });
    await engineQueue.runOnce();

    const failing = await db.job.findUnique({ where: { id: failingJobId! } });
    assert(
      failing?.status === 'FAILED' &&
        failing.attempts === 1 &&
        failing.lastError?.includes('fallo simulado') === true,
      'un handler que falla deja el trabajo en FAILED con el motivo registrado'
    );
    assert(
      !!failing?.runAt && failing.runAt.getTime() > clock.getTime(),
      'el reintento se programa en el futuro (backoff exponencial)'
    );

    clock = new Date(clock.getTime() + 60 * 60 * 1000);
    await engineQueue.runOnce();
    const dead = await db.job.findUnique({ where: { id: failingJobId! } });
    assert(
      dead?.status === 'DEAD' && dead.attempts === 2,
      'agotados los intentos el trabajo pasa a DEAD (no se reintenta para siempre)'
    );

    const orphanJobId = await engineQueue.enqueue({
      type: 'VOICE_POST_CALL_FOLLOWUP',
      payload: { marker: 'sin-handler' },
      dedupeKey: `${RUN_ID}:sin-handler`,
      tenantId: 'queue-test-tenant',
    });
    const orphanQueue = new JobQueue({
      workerId: 'queue-test-worker-2',
      handlers: {},
      now: () => clock,
    });
    await orphanQueue.runOnce();
    const orphan = await db.job.findUnique({ where: { id: orphanJobId! } });
    assert(
      orphan?.status === 'DEAD' && orphan.lastError?.includes('Sin handler') === true,
      'un tipo de trabajo sin handler termina en DEAD en lugar de reintentarse sin fin'
    );

    const staleJobId = await engineQueue.enqueue({
      type: 'META_INBOUND_MESSAGE',
      payload: { marker: 'abandonado' },
      dedupeKey: `${RUN_ID}:abandonado`,
      tenantId: 'queue-test-tenant',
    });
    await db.job.update({
      where: { id: staleJobId! },
      data: {
        status: 'RUNNING',
        lockedAt: new Date(clock.getTime() - 10 * 60 * 1000),
        lockedBy: 'worker-muerto',
      },
    });
    const recovered = await engineQueue.recoverStaleJobs();
    const stale = await db.job.findUnique({ where: { id: staleJobId! } });
    assert(
      recovered >= 1 && stale?.status === 'FAILED' && stale.lockedAt === null,
      'los trabajos abandonados en RUNNING se recuperan (el proceso murió a mitad)'
    );

    // ---------------------------------------------------------------
    console.log('\n🏥 2. Clínica de prueba y mensaje entrante de Meta');
    const tenant = await db.tenant.create({
      data: {
        name: `Queue Test ${RUN_ID}`,
        slug: `queue-test-${RUN_ID}`,
        phoneE164: '+525588990000',
        address: 'CDMX',
        channelConfigs: {
          create: [
            {
              channelType: 'WHATSAPP',
              credentials: encryptCredentials(JSON.stringify({ phoneNumberId: PHONE_NUMBER_ID })),
            },
          ],
        },
        doctors: { create: [{ name: 'Dra. Queue', specialty: 'Odontología' }] },
        services: {
          create: [{ name: 'Consulta', durationMinutes: 30, priceMxn: 500, requiredDepositMxn: 0 }],
        },
      },
    });
    tenantId = tenant.id;

    const metaPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-test',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+525588990000',
                  phone_number_id: PHONE_NUMBER_ID,
                },
                contacts: [{ profile: { name: 'Paciente Queue' }, wa_id: '525588990011' }],
                messages: [
                  {
                    from: '525588990011',
                    id: WAMID,
                    timestamp: '1790000000',
                    type: 'text',
                    text: { body: 'Hola, ¿cuánto cuesta una limpieza dental?' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBody = Buffer.from(JSON.stringify(metaPayload));
    const signature = computeMetaSignature(rawBody, process.env.META_APP_SECRET!);

    const startedAt = Date.now();
    const webhookRes = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'x-hub-signature-256': signature },
      payload: metaPayload,
    });
    const elapsedMs = Date.now() - startedAt;

    assert(
      webhookRes.statusCode === 200 && webhookRes.json().status === 'received',
      'el webhook de Meta responde 200 encolando el turno'
    );
    assert(elapsedMs < 3000, `el webhook responde rápido, sin esperar al agente (${elapsedMs} ms)`);

    const patient = await db.patient.findFirst({
      where: { tenantId: tenant.id, phoneE164: CALLER_PHONE },
    });
    const conversation = await db.conversation.findFirst({
      where: { tenantId: tenant.id, patientId: patient?.id },
    });

    const inboundStored = await db.message.findFirst({
      where: { conversationId: conversation?.id, direction: 'INBOUND' },
    });
    assert(
      !!inboundStored && inboundStored.externalMessageId === WAMID,
      'el mensaje entrante queda persistido y visible de inmediato en la bandeja'
    );

    const outboundBeforeDrain = await db.message.count({
      where: { conversationId: conversation?.id, direction: 'OUTBOUND' },
    });
    assert(
      outboundBeforeDrain === 0 && state.waCalls === 0,
      'el agente NO se ejecuta dentro del request del webhook (trabajo diferido)'
    );

    const queuedJob = await db.job.findFirst({ where: { dedupeKey: `meta:${inboundStored?.id}` } });
    assert(
      queuedJob?.type === 'META_INBOUND_MESSAGE' && queuedJob.status === 'PENDING',
      'el turno queda encolado como trabajo META_INBOUND_MESSAGE'
    );

    // ---------------------------------------------------------------
    console.log('\n⚙️ 3. El worker procesa el turno y responde por WhatsApp');
    await drainQueue();

    const outboundAfterDrain = await db.message.findMany({
      where: { conversationId: conversation?.id, direction: 'OUTBOUND' },
    });
    assert(
      outboundAfterDrain.length >= 1 && outboundAfterDrain[0].senderRole === 'AI_AGENT',
      'tras drenar la cola existe la respuesta del agente en la conversación'
    );
    assert(state.waCalls >= 1, 'la respuesta se envió por WhatsApp desde el outbox');
    assert(
      outboundAfterDrain.every((message) => message.deliveryStatus === 'SENT'),
      'el mensaje saliente queda marcado como SENT (no PENDING) al confirmarse la entrega'
    );

    const firstReplyText = outboundAfterDrain[0].content;
    const outboundCountAfterFirstTurn = outboundAfterDrain.length;

    // ---------------------------------------------------------------
    console.log('\n🔁 4. Idempotencia y reintentos del turno');
    const retryPayload = {
      conversationId: conversation!.id,
      patientId: patient!.id,
      tenantId: tenant.id,
      inboundMessageId: inboundStored!.id,
      text: 'Hola, ¿cuánto cuesta una limpieza dental?',
      channel: 'WHATSAPP',
      phoneNumberId: PHONE_NUMBER_ID,
    };
    await jobQueue.enqueue({
      type: 'META_INBOUND_MESSAGE',
      payload: retryPayload,
      dedupeKey: `${RUN_ID}:reintento-manual`,
      tenantId: tenant.id,
    });
    await drainQueue();

    const outboundAfterRetry = await db.message.count({
      where: { conversationId: conversation?.id, direction: 'OUTBOUND' },
    });
    assert(
      outboundAfterRetry === outboundCountAfterFirstTurn,
      'reprocesar el mismo mensaje entrante no duplica la respuesta de la IA'
    );

    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'x-hub-signature-256': signature },
      payload: metaPayload,
    });
    const duplicateJobs = await db.job.count({ where: { dedupeKey: `meta:${inboundStored!.id}` } });
    assert(
      duplicateRes.statusCode === 200 &&
        duplicateRes.json().status === 'duplicate' &&
        duplicateJobs === 1,
      'el reenvío del mismo wamid por Meta se descarta sin encolar un segundo turno'
    );

    const ghostJobId = await jobQueue.enqueue({
      type: 'META_INBOUND_MESSAGE',
      tenantId: tenant.id,
      dedupeKey: `${RUN_ID}:fantasma`,
      payload: { ...retryPayload, conversationId: 'conversacion-inexistente' },
    });
    await drainQueue();
    const ghost = await db.job.findUnique({ where: { id: ghostJobId! } });
    assert(
      ghost?.status === 'DEAD' && ghost.attempts === 1,
      'un payload inválido se descarta de inmediato (error permanente) sin quemar reintentos'
    );

    // ---------------------------------------------------------------
    console.log('\n📨 5. Outbox: fallo de Meta y reintento');
    // Meta falla más veces de las que reintenta el cliente de WhatsApp, para
    // forzar que el job agote el intento y quede pendiente de reintento.
    state.waFailures = 10;
    const waCallsBefore = state.waCalls;

    const outboxMessage = await db.message.create({
      data: {
        conversationId: conversation!.id,
        tenantId: tenant.id,
        direction: 'OUTBOUND',
        senderRole: 'AI_AGENT',
        content: 'Mensaje de outbox en prueba',
        channel: 'WHATSAPP',
        deliveryStatus: 'PENDING',
      },
    });

    await jobQueue.enqueue({
      type: 'WHATSAPP_SEND',
      tenantId: tenant.id,
      dedupeKey: `${RUN_ID}:outbox-fallo`,
      payload: {
        kind: 'TEXT',
        toPhoneE164: CALLER_PHONE,
        text: 'Mensaje de outbox en prueba',
        phoneNumberId: PHONE_NUMBER_ID,
        messageId: outboxMessage.id,
      },
    });
    await drainQueue();

    const afterFailure = await db.message.findUnique({ where: { id: outboxMessage.id } });
    const failedJob = await db.job.findUnique({ where: { dedupeKey: `${RUN_ID}:outbox-fallo` } });
    assert(
      afterFailure?.deliveryStatus === 'PENDING' && failedJob?.status === 'FAILED',
      'si Meta falla, el mensaje NO se marca como enviado y el trabajo queda para reintento'
    );

    state.waFailures = 0;
    // Se adelanta el reloj del reintento para no esperar el backoff real.
    await db.job.updateMany({
      where: { dedupeKey: `${RUN_ID}:outbox-fallo` },
      data: { runAt: new Date(Date.now() - 1000) },
    });
    await drainQueue();

    const afterRetry = await db.message.findUnique({ where: { id: outboxMessage.id } });
    const recoveredJob = await db.job.findUnique({ where: { dedupeKey: `${RUN_ID}:outbox-fallo` } });
    assert(
      afterRetry?.deliveryStatus === 'SENT' && recoveredJob?.status === 'DONE',
      'el reintento entrega el mensaje y lo marca SENT'
    );
    assert(state.waCalls > waCallsBefore, 'hubo al menos una llamada real a la API de Meta');

    // Descarte definitivo: sin más reintentos, el mensaje debe quedar FAILED.
    state.waFailures = 10;
    const undeliverable = await db.message.create({
      data: {
        conversationId: conversation!.id,
        tenantId: tenant.id,
        direction: 'OUTBOUND',
        senderRole: 'AI_AGENT',
        content: 'Mensaje que nunca llegará',
        channel: 'WHATSAPP',
        deliveryStatus: 'PENDING',
      },
    });
    await jobQueue.enqueue({
      type: 'WHATSAPP_SEND',
      tenantId: tenant.id,
      dedupeKey: `${RUN_ID}:outbox-descartado`,
      maxAttempts: 1,
      payload: {
        kind: 'TEXT',
        toPhoneE164: CALLER_PHONE,
        text: 'Mensaje que nunca llegará',
        phoneNumberId: PHONE_NUMBER_ID,
        messageId: undeliverable.id,
      },
    });
    await drainQueue();
    state.waFailures = 0;

    const deadMessage = await db.message.findUnique({ where: { id: undeliverable.id } });
    const deadSendJob = await db.job.findUnique({
      where: { dedupeKey: `${RUN_ID}:outbox-descartado` },
    });
    assert(
      deadSendJob?.status === 'DEAD' && deadMessage?.deliveryStatus === 'FAILED',
      'al agotar los reintentos el mensaje se marca FAILED (nunca queda PENDING para siempre)'
    );

    // ---------------------------------------------------------------
    console.log('\n📞 6. Seguimiento post-llamada por el outbox');
    const followUpJobId = await enqueueVoiceFollowUp({
      tenantId: tenant.id,
      toPhoneE164: CALLER_PHONE,
      callSid: `CA${RUN_ID}`,
    });
    const followUpAgain = await enqueueVoiceFollowUp({
      tenantId: tenant.id,
      toPhoneE164: CALLER_PHONE,
      callSid: `CA${RUN_ID}`,
    });
    assert(
      typeof followUpJobId === 'string' && followUpAgain === null,
      'el seguimiento post-llamada se encola una sola vez por CallSid'
    );

    await drainQueue();
    const followUpJob = await db.job.findUnique({ where: { id: followUpJobId! } });
    assert(
      followUpJob?.status === 'DONE' &&
        state.sentTexts.some((text) => text.includes(tenant.name)),
      'el seguimiento se envía por WhatsApp con el nombre real de la clínica'
    );

    assert(
      firstReplyText.length > 0 && state.sentTexts.includes(firstReplyText),
      'el texto enviado por WhatsApp es exactamente la respuesta del agente'
    );

    const stats = await jobQueue.stats();
    assert(
      typeof stats.DONE === 'number' && stats.DEAD >= 2,
      'las métricas de la cola reportan trabajos completados y muertos'
    );
  } finally {
    globalThis.fetch = originalFetch;

    if (tenantId) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.message.deleteMany({ where: { tenantId } });
      await db.conversation.deleteMany({ where: { tenantId } });
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.service.deleteMany({ where: { tenantId } });
      await db.doctor.deleteMany({ where: { tenantId } });
      await db.channelConfig.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    // Trabajos del motor de pruebas (tenantId sintético).
    await db.job.deleteMany({ where: { tenantId: 'queue-test-tenant' } });
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO COLA: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runQueueTests().catch((error) => {
  console.error('Error en la suite de cola:', error);
  process.exit(1);
});
