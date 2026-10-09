import { db, encryptCredentials } from '@asistente/database';
import { buildServer } from './server.js';
import { computeMetaSignature } from './lib/webhookSecurity.js';
import { drainQueue, setHandoverAlertEmailSender } from './services/queue/handlers.js';
import type { OutgoingEmail } from './services/emailService.js';

/**
 * Suite del canal de WhatsApp de punta a punta (webhook -> cola -> respuesta).
 *
 * Cubre los huecos que dejaba el webhook de Meta:
 *  a) la IA cede a recepción (emergencia o transferencia) y deja de contestar;
 *  b) Meta manda lotes con varios mensajes y todos se procesan;
 *  c) los botones de la confirmación actúan sobre SU cita, no sobre "la próxima";
 *  d) un número sin clínica responde 200 para que Meta no reintente;
 *  e) una clínica suspendida guarda el mensaje pero la IA no contesta.
 */

process.env.JWT_SECRET ||= 'wa-inbound-test-secret-with-32-chars!';
process.env.META_VERIFY_TOKEN ||= 'wa-inbound-test-verify-token';
process.env.META_APP_SECRET = 'wa-inbound-test-meta-secret';
process.env.META_WHATSAPP_TOKEN = 'wa-inbound-test-token';
process.env.META_PHONE_NUMBER_ID = 'wa-inbound-default-phone-id';
process.env.CREDENTIALS_ENCRYPTION_KEY ||= 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';
process.env.WHATSAPP_SEND_ATTEMPTS = '1';
process.env.WHATSAPP_RETRY_DELAY_MS = '1';
// Motor de respuestas local y determinista: la suite no depende de DeepSeek.
delete process.env.DEEPSEEK_API_KEY;
delete process.env.WEBHOOK_ALLOW_UNVERIFIED;

const RUN_ID = `wain-${Date.now()}`;
const DIGITS = String(Date.now()).slice(-8);
const ACTIVE_PHONE_ID = `pn-${RUN_ID}-activa`;
const SUSPENDED_PHONE_ID = `pn-${RUN_ID}-suspendida`;

const sentTexts: string[] = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('graph.facebook.com')) {
    try {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const text = body?.text?.body ?? body?.interactive?.body?.text;
      if (typeof text === 'string') sentTexts.push(text);
    } catch {
      // Cuerpo no JSON: irrelevante para la prueba.
    }
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.sent' }] }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
}) as typeof fetch;

let wamidCounter = 0;
function nextWamid(): string {
  wamidCounter += 1;
  return `wamid.${RUN_ID}.${wamidCounter}`;
}

function textMessage(from: string, body: string) {
  return { from, id: nextWamid(), timestamp: '1790000000', type: 'text', text: { body } };
}

function buttonMessage(from: string, buttonId: string, title: string) {
  return {
    from,
    id: nextWamid(),
    timestamp: '1790000000',
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: buttonId, title } },
  };
}

function change(phoneNumberId: string, messages: unknown[], contacts: unknown[] = []) {
  return {
    field: 'messages',
    value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '+520000000000', phone_number_id: phoneNumberId },
      contacts,
      messages,
    },
  };
}

function metaPayload(changes: unknown[], extraEntries: unknown[] = []) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-test', changes }, ...extraEntries],
  };
}

async function runSuite() {
  console.log('💬 ========================================================');
  console.log('💬 SUITE WHATSAPP: LOTES, TRASPASO A RECEPCIÓN, BOTONES Y SUSPENSIÓN');
  console.log('💬 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  const tenantIds: string[] = [];

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  async function postMeta(payload: unknown) {
    const rawBody = Buffer.from(JSON.stringify(payload));
    return app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'x-hub-signature-256': computeMetaSignature(rawBody, process.env.META_APP_SECRET!) },
      payload: payload as Record<string, unknown>,
    });
  }

  async function conversationOf(tenantId: string, waId: string) {
    const patient = await db.patient.findFirst({ where: { tenantId, phoneE164: `+${waId}` } });
    if (!patient) return null;
    return db.conversation.findFirst({
      where: { tenantId, patientId: patient.id, channel: 'WHATSAPP' },
      include: { patient: true },
    });
  }

  try {
    const tenant = await db.tenant.create({
      data: {
        name: `WA Inbound ${RUN_ID}`,
        slug: `wa-inbound-${RUN_ID}`,
        phoneE164: `+5291${DIGITS}`,
        address: 'Av. Masaryk 100, Polanco, CDMX',
        channelConfigs: {
          create: [
            {
              channelType: 'WHATSAPP',
              credentials: encryptCredentials(JSON.stringify({ phoneNumberId: ACTIVE_PHONE_ID })),
            },
          ],
        },
        doctors: { create: [{ name: 'Dra. Lote', specialty: 'Odontología General' }] },
        services: {
          create: [{ name: 'Limpieza Dental', durationMinutes: 45, priceMxn: 850, requiredDepositMxn: 0 }],
        },
      },
      include: { doctors: true, services: true },
    });
    tenantIds.push(tenant.id);

    const suspended = await db.tenant.create({
      data: {
        name: `WA Suspendida ${RUN_ID}`,
        slug: `wa-suspendida-${RUN_ID}`,
        phoneE164: `+5292${DIGITS}`,
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        channelConfigs: {
          create: [
            {
              channelType: 'WHATSAPP',
              credentials: encryptCredentials(JSON.stringify({ phoneNumberId: SUSPENDED_PHONE_ID })),
            },
          ],
        },
      },
    });
    tenantIds.push(suspended.id);

    const waA = `5255${DIGITS}`;
    const waB = `5256${DIGITS}`;

    // ---------------------------------------------------------------
    console.log('📦 b) Lotes de Meta: varias entradas, cambios y mensajes');
    const batch = metaPayload(
      [
        change(
          ACTIVE_PHONE_ID,
          [textMessage(waA, 'Hola, buenas tardes'), textMessage(waB, '¿Dónde están ubicados?')],
          [
            { profile: { name: 'Ana Lote' }, wa_id: waA },
            { profile: { name: 'Beto Lote' }, wa_id: waB },
          ]
        ),
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: ACTIVE_PHONE_ID },
            statuses: [{ id: 'wamid.algo', status: 'delivered' }],
          },
        },
      ],
      [{ id: 'waba-test', changes: [change(ACTIVE_PHONE_ID, [textMessage(waA, '¿Cuánto cuesta la limpieza?')])] }]
    );

    const batchRes = await postMeta(batch);
    const batchBody = batchRes.json();
    assert(
      batchRes.statusCode === 200 &&
        batchBody.status === 'batch' &&
        batchBody.results?.length === 3 &&
        batchBody.results.every((r: { status: string }) => r.status === 'received'),
      'un POST con varias entradas y mensajes procesa los tres mensajes (no solo el primero)'
    );

    const convA = await conversationOf(tenant.id, waA);
    const convB = await conversationOf(tenant.id, waB);
    const inboundA = await db.message.count({ where: { conversationId: convA?.id, direction: 'INBOUND' } });
    const inboundB = await db.message.count({ where: { conversationId: convB?.id, direction: 'INBOUND' } });
    assert(inboundA === 2 && inboundB === 1, 'los tres mensajes quedan guardados en su conversación');
    assert(
      convA?.patient.fullName === 'Ana Lote' && convB?.patient.fullName === 'Beto Lote',
      'cada remitente del lote toma su propio nombre de contacto (no el del primero)'
    );

    const batchJobs = await db.job.count({ where: { tenantId: tenant.id, type: 'META_INBOUND_MESSAGE' } });
    assert(batchJobs === 3, 'se encola un turno por mensaje');

    const replayRes = await postMeta(batch);
    assert(
      replayRes.statusCode === 200 &&
        replayRes.json().results?.every((r: { status: string }) => r.status === 'duplicate'),
      'el reenvío del mismo lote se descarta mensaje por mensaje (idempotencia por wamid)'
    );

    // Éxito parcial: el mensaje se guardó pero su turno no llegó a la cola.
    const lostInbound = await db.message.findFirst({
      where: { conversationId: convB?.id, direction: 'INBOUND' },
    });
    await db.job.deleteMany({ where: { dedupeKey: `meta:${lostInbound?.id}` } });
    await postMeta(batch);
    const requeued = await db.job.count({ where: { dedupeKey: `meta:${lostInbound?.id}` } });
    assert(requeued === 1, 'el reenvío de Meta reencola el turno de un mensaje guardado sin trabajo');

    await drainQueue();
    const outboundA = await db.message.count({ where: { conversationId: convA?.id, direction: 'OUTBOUND' } });
    const outboundB = await db.message.count({ where: { conversationId: convB?.id, direction: 'OUTBOUND' } });
    assert(
      outboundA === 2 && outboundB === 1,
      'cada mensaje de la ráfaga recibe su respuesta (el segundo no se da por contestado con la del primero)'
    );

    const statusesOnly = await postMeta(
      metaPayload([
        {
          field: 'messages',
          value: { metadata: { phone_number_id: ACTIVE_PHONE_ID }, statuses: [{ status: 'read' }] },
        },
      ])
    );
    assert(
      statusesOnly.statusCode === 200 && statusesOnly.json().status === 'ignored',
      'las notificaciones de estado (statuses) se aceptan con 200 sin crear mensajes'
    );

    // ---------------------------------------------------------------
    console.log('\n📵 d) Número de WhatsApp sin clínica');
    const waGhost = `5257${DIGITS}`;
    const unknownRes = await postMeta(
      metaPayload([change(`pn-${RUN_ID}-inexistente`, [textMessage(waGhost, 'Hola')])])
    );
    const ghostPatients = await db.patient.count({ where: { phoneE164: `+${waGhost}` } });
    assert(
      unknownRes.statusCode === 200 && unknownRes.json().status === 'unknown_number' && ghostPatients === 0,
      'un número sin clínica responde 200 (Meta no reintenta) y no crea expedientes'
    );

    // ---------------------------------------------------------------
    console.log('\n🚨 a) Emergencia vital: respuesta 911 y traspaso a recepción');
    const waE = `5258${DIGITS}`;
    const sentBefore = sentTexts.length;
    // Personal de la clínica: recepción y dirección reciben la alerta; el
    // doctor no (no atiende la bandeja).
    const alertEmails: OutgoingEmail[] = [];
    setHandoverAlertEmailSender(async (email) => {
      alertEmails.push(email);
    });
    await db.user.createMany({
      data: [
        { tenantId: tenant.id, email: `admin-${RUN_ID}@asistente.test`, name: 'Admin', role: 'ADMIN', passwordHash: 'x' },
        { tenantId: tenant.id, email: `recep-${RUN_ID}@asistente.test`, name: 'Recepción', role: 'RECEPTIONIST', passwordHash: 'x' },
        { tenantId: tenant.id, email: `doc-${RUN_ID}@asistente.test`, name: 'Doctor', role: 'DOCTOR', passwordHash: 'x' },
      ],
    });
    await postMeta(
      metaPayload([change(ACTIVE_PHONE_ID, [textMessage(waE, 'Ayuda, no puedo respirar')])])
    );
    await drainQueue();

    const convE = await conversationOf(tenant.id, waE);
    const emergencyReply = await db.message.findFirst({
      where: { conversationId: convE?.id, direction: 'OUTBOUND' },
    });
    assert(convE?.isHandedOverToHuman === true, 'la conversación queda en modo humano (isHandedOverToHuman)');
    assert(
      !!emergencyReply?.content.includes('911') &&
        sentTexts.slice(sentBefore).some((text) => text.includes('911')),
      'la indicación del 911 se guarda y SÍ se envía por WhatsApp'
    );

    const handoverAudit = await db.auditLog.findFirst({
      where: { tenantId: tenant.id, entityType: 'CONVERSATION', entityId: convE?.id },
    });
    const handoverMeta = JSON.parse(handoverAudit?.metadata ?? '{}');
    const handoverChanges = JSON.parse(handoverAudit?.changes ?? '{}');
    assert(
      handoverAudit?.actorType === 'AI_AGENT' &&
        handoverAudit.action === 'UPDATE' &&
        handoverChanges.isHandedOverToHuman?.before === false &&
        handoverChanges.isHandedOverToHuman?.after === true &&
        handoverMeta.reason === 'CRITICAL_EMERGENCY',
      'el traspaso queda auditado (AI_AGENT, UPDATE, false→true, motivo CRITICAL_EMERGENCY)'
    );

    const alertRecipients = alertEmails.map((email) => email.to).sort();
    assert(
      alertRecipients.length === 2 &&
        alertRecipients.every((to) => to.startsWith('admin-') || to.startsWith('recep-')) &&
        alertEmails.every((email) => email.subject.includes('emergencia')),
      'el traspaso por emergencia avisa por correo a dirección y recepción (no al doctor)'
    );
    assert(
      alertEmails.every((email) => !email.text.includes(waE) && !email.text.includes('respirar')),
      'el correo de alerta no lleva el teléfono ni el texto del paciente'
    );
    setHandoverAlertEmailSender(null);

    const followUp = await postMeta(
      metaPayload([change(ACTIVE_PHONE_ID, [textMessage(waE, '¿Siguen ahí?')])])
    );
    await drainQueue();
    const outboundE = await db.message.count({ where: { conversationId: convE?.id, direction: 'OUTBOUND' } });
    assert(
      followUp.json().status === 'handed_over' && outboundE === 1,
      'tras el traspaso la IA ya no contesta los mensajes siguientes'
    );

    const waU = `5253${DIGITS}`;
    await postMeta(
      metaPayload([
        change(ACTIVE_PHONE_ID, [textMessage(waU, 'Tengo un dolor insoportable de muela y la cara hinchada')]),
      ])
    );
    await drainQueue();
    const convU = await conversationOf(tenant.id, waU);
    const urgentReplies = await db.message.count({ where: { conversationId: convU?.id, direction: 'OUTBOUND' } });
    assert(
      urgentReplies === 1 && convU?.isHandedOverToHuman === false,
      'una urgencia dental aguda se atiende pero NO silencia a la IA (el paciente debe poder decir "sí")'
    );

    // ---------------------------------------------------------------
    console.log('\n🔘 c) Botones de confirmación ligados a su cita');
    const waC = `5259${DIGITS}`;
    const patientC = await db.patient.create({
      data: { tenantId: tenant.id, fullName: 'Carla Botones', phoneE164: `+${waC}`, whatsappId: waC },
    });
    const otherPatient = await db.patient.create({
      data: { tenantId: tenant.id, fullName: 'Otro Paciente', phoneE164: `+5250${DIGITS}` },
    });
    const doctor = tenant.doctors[0];
    const service = tenant.services[0];
    const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const appointmentData = (patientId: string, days: number) => ({
      tenantId: tenant.id,
      patientId,
      doctorId: doctor.id,
      serviceId: service.id,
      startTime: inDays(days),
      endTime: new Date(inDays(days).getTime() + 45 * 60 * 1000),
      status: 'PENDING',
    });
    const sooner = await db.appointment.create({ data: appointmentData(patientC.id, 2) });
    const later = await db.appointment.create({ data: appointmentData(patientC.id, 9) });
    const foreign = await db.appointment.create({ data: appointmentData(otherPatient.id, 3) });

    await postMeta(
      metaPayload([change(ACTIVE_PHONE_ID, [buttonMessage(waC, `confirm_${later.id}`, 'Confirmar Asistencia')])])
    );
    await drainQueue();

    const laterAfter = await db.appointment.findUnique({ where: { id: later.id } });
    const soonerAfter = await db.appointment.findUnique({ where: { id: sooner.id } });
    assert(
      laterAfter?.status === 'CONFIRMED' && soonerAfter?.status === 'PENDING',
      'el botón confirma la cita del mensaje, no la más próxima del paciente'
    );
    const confirmAudit = await db.auditLog.findFirst({
      where: { tenantId: tenant.id, entityType: 'APPOINTMENT', entityId: later.id },
    });
    assert(
      confirmAudit?.actorType === 'AI_AGENT' && JSON.parse(confirmAudit.changes ?? '{}').status?.after === 'CONFIRMED',
      'la confirmación por botón queda auditada'
    );

    await postMeta(
      metaPayload([change(ACTIVE_PHONE_ID, [buttonMessage(waC, `confirm_${foreign.id}`, 'Confirmar Asistencia')])])
    );
    await drainQueue();
    const foreignAfter = await db.appointment.findUnique({ where: { id: foreign.id } });
    const convC = await conversationOf(tenant.id, waC);
    const lastReplyC = await db.message.findFirst({
      where: { conversationId: convC?.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
    });
    assert(
      foreignAfter?.status === 'PENDING' && !!lastReplyC?.content.includes('ya no está vigente'),
      'un botón con la cita de otro paciente no la toca y responde que no está vigente'
    );

    await postMeta(
      metaPayload([change(ACTIVE_PHONE_ID, [buttonMessage(waC, `reschedule_${later.id}`, 'Reagendar Cita')])])
    );
    const rescheduleJob = await db.job.findFirst({
      where: { tenantId: tenant.id, type: 'META_INBOUND_MESSAGE' },
      orderBy: { createdAt: 'desc' },
    });
    const reschedulePayload = JSON.parse(rescheduleJob?.payload ?? '{}') as {
      buttonAction?: { kind: string; appointmentId: string };
    };
    assert(
      reschedulePayload?.buttonAction?.kind === 'RESCHEDULE' &&
        reschedulePayload.buttonAction.appointmentId === later.id,
      'el botón de reagendar conserva el id de la cita hasta el turno del agente'
    );
    await drainQueue();
    const repliesC = await db.message.count({ where: { conversationId: convC?.id, direction: 'OUTBOUND' } });
    assert(repliesC === 3, 'el botón de reagendar recibe respuesta');

    // Botón de respuesta rápida de una plantilla (type "button", id en payload).
    const templateTarget = await db.appointment.create({ data: appointmentData(patientC.id, 12) });
    await postMeta(
      metaPayload([
        change(ACTIVE_PHONE_ID, [
          {
            from: waC,
            id: nextWamid(),
            timestamp: '1790000000',
            type: 'button',
            button: { payload: `confirm_${templateTarget.id}`, text: 'Confirmar' },
          },
        ]),
      ])
    );
    await drainQueue();
    const templateAfter = await db.appointment.findUnique({ where: { id: templateTarget.id } });
    const soonerStill = await db.appointment.findUnique({ where: { id: sooner.id } });
    assert(
      templateAfter?.status === 'CONFIRMED' && soonerStill?.status === 'PENDING',
      'el botón de plantilla (type "button") también confirma su cita exacta'
    );

    // ---------------------------------------------------------------
    console.log('\n⏸️ e) Clínica suspendida');
    const waS = `5251${DIGITS}`;
    const suspendedSent = sentTexts.length;
    const suspendedRes = await postMeta(
      metaPayload([change(SUSPENDED_PHONE_ID, [textMessage(waS, 'Quiero agendar una limpieza')])])
    );
    await drainQueue();
    const convS = await conversationOf(suspended.id, waS);
    const inboundS = await db.message.count({ where: { conversationId: convS?.id, direction: 'INBOUND' } });
    const outboundS = await db.message.count({ where: { conversationId: convS?.id, direction: 'OUTBOUND' } });
    assert(
      suspendedRes.statusCode === 200 && inboundS === 1,
      'el mensaje a una clínica suspendida se guarda (recepción lo ve en la bandeja)'
    );
    assert(
      outboundS === 0 && sentTexts.length === suspendedSent,
      'la IA no contesta ni envía nada en nombre de una clínica suspendida'
    );

    await postMeta(
      metaPayload([change(SUSPENDED_PHONE_ID, [textMessage(waS, 'Me desmayé y no puedo respirar')])])
    );
    await drainQueue();
    const convSAfter = await db.conversation.findUnique({ where: { id: convS!.id } });
    const emergencyS = await db.message.findFirst({
      where: { conversationId: convS?.id, direction: 'OUTBOUND' },
    });
    assert(
      !!emergencyS?.content.includes('911') && convSAfter?.isHandedOverToHuman === true,
      'aun suspendida, una emergencia vital recibe la indicación del 911 y pasa a recepción'
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const tenantId of tenantIds) {
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
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO WHATSAPP: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runSuite()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error en la suite de WhatsApp:', error);
    process.exit(1);
  });
