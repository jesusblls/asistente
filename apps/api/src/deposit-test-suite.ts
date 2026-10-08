import { appointmentSlotKey, db } from '@asistente/database';
import { buildServer } from './server.js';
import { drainQueue, jobQueue } from './services/queue/handlers.js';
import { sweepDeposits } from './services/deposits/depositSweeper.js';
import { computeDepositDeadline } from './services/deposits/depositPolicy.js';
import { computeMercadoPagoSignature } from './lib/webhookSecurity.js';

/**
 * Flujo completo del anticipo (No-Show Shield):
 *   confirmación con link → webhook (aprobado, duplicado, rechazado, otro tipo)
 *   → recordatorio único → liberación del horario al vencer.
 *
 * Sin MERCADOPAGO_ACCESS_TOKEN y fuera de producción, el link es el simulado
 * de desarrollo; WhatsApp va contra un fetch simulado que guarda cada texto.
 */
process.env.JWT_SECRET ||= 'deposit-test-secret-at-least-32-characters';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-deposit-secret';
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
process.env.META_WHATSAPP_TOKEN = 'test-wa-token';
process.env.META_PHONE_NUMBER_ID = 'test-phone-id';
process.env.WHATSAPP_SEND_ATTEMPTS = '1';

const sentTexts: string[] = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input.url);
  if (url.includes('graph.facebook.com')) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    sentTexts.push(body?.interactive?.body?.text ?? body?.text?.body ?? '');
    return new Response('{"messages":[{"id":"wamid.test"}]}', { status: 200 });
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof fetch;

const HOUR = 60 * 60 * 1000;

async function runDepositTests() {
  console.log('🛡️ ========================================================');
  console.log('🛡️ SUITE DE ANTICIPOS (NO-SHOW SHIELD: LINK, WEBHOOK, BARRIDO)');
  console.log('🛡️ ========================================================\n');

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

  const postWebhook = (payload: Record<string, unknown>) => {
    const dataId = String((payload.data as { id?: string } | undefined)?.id ?? '');
    const requestId = `req-deposit-${Math.random().toString(36).slice(2)}`;
    const ts = `${Math.floor(Date.now() / 1000)}`;
    const v1 = computeMercadoPagoSignature({
      dataId,
      requestId,
      ts,
      secret: process.env.MERCADOPAGO_WEBHOOK_SECRET!,
    });
    return app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago',
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
      payload,
    });
  };

  try {
    const suffix = Date.now().toString(36);
    const tenant = await db.tenant.create({
      data: {
        name: `Deposit Test ${suffix}`,
        slug: `deposit-test-${suffix}`,
        phoneE164: '+529900003001',
        doctors: { create: [{ name: 'Dra. Anticipo', specialty: 'Odontología' }] },
        services: {
          create: [{ name: 'Blanqueamiento LED', durationMinutes: 60, priceMxn: 2500, requiredDepositMxn: 500 }],
        },
        patients: { create: [{ fullName: 'Paciente Anticipo', phoneE164: '+529900003002' }] },
      },
      include: { doctors: true, services: true, patients: true },
    });
    tenantId = tenant.id;
    const doctorId = tenant.doctors[0].id;

    const createAppointment = (startTime: Date, createdAt = new Date()) =>
      db.appointment.create({
        data: {
          tenantId: tenant.id,
          patientId: tenant.patients[0].id,
          doctorId,
          serviceId: tenant.services[0].id,
          startTime,
          endTime: new Date(startTime.getTime() + HOUR),
          status: 'CONFIRMED',
          slotKey: appointmentSlotKey({ doctorId, startTime, status: 'CONFIRMED' }),
          paymentStatus: 'DEPOSIT_PENDING',
          depositAmountMxn: 500,
          createdAt,
        },
      });

    const confirm = async (appointmentId: string) => {
      await jobQueue.enqueue({
        type: 'WHATSAPP_SEND',
        tenantId: tenant.id,
        dedupeKey: `wa-confirm:${appointmentId}`,
        payload: { kind: 'APPOINTMENT_CONFIRMATION', appointmentId, tenantId: tenant.id },
      });
      await drainQueue();
    };

    // ---------------------------------------------------------------------
    console.log('🛡️ 1. Políticas de límite de pago');
    const now = new Date();
    const farDeadline = computeDepositDeadline({ bookedAt: now, startTime: new Date(now.getTime() + 72 * HOUR), now });
    const nearDeadline = computeDepositDeadline({ bookedAt: now, startTime: new Date(now.getTime() + 10 * HOUR), now });
    const sameDay = computeDepositDeadline({ bookedAt: now, startTime: new Date(now.getTime() + 2 * HOUR), now });
    const tooSoon = computeDepositDeadline({ bookedAt: now, startTime: new Date(now.getTime() + 30 * 60_000), now });
    assert(farDeadline?.getTime() === now.getTime() + 24 * HOUR, 'Cita lejana: se espera el pago 24 h después de agendar');
    assert(nearDeadline?.getTime() === now.getTime() + 7 * HOUR, 'Cita cercana: se libera 3 h antes de la cita');
    assert(sameDay?.getTime() === now.getTime() + HOUR, 'Urgencia del mismo día: el paciente tiene al menos 1 h para pagar');
    assert(tooSoon === null, 'Sin tiempo útil antes de la cita no se fija límite (no se cancela sola)');

    // ---------------------------------------------------------------------
    console.log('\n🛡️ 2. La confirmación de la cita incluye el link de pago');
    const start1 = new Date(Date.now() + 72 * HOUR);
    start1.setUTCMinutes(0, 0, 0);
    const appt1 = await createAppointment(start1);
    sentTexts.length = 0;
    await confirm(appt1.id);

    const appt1AfterConfirm = await db.appointment.findUnique({ where: { id: appt1.id } });
    const confirmation = sentTexts[0] ?? '';
    assert(
      Boolean(appt1AfterConfirm?.depositPaymentUrl) &&
        confirmation.includes(appt1AfterConfirm!.depositPaymentUrl!),
      'La confirmación por WhatsApp trae el link de Mercado Pago guardado en la cita'
    );
    assert(
      confirmation.includes('$500 MXN') && confirmation.includes('se liberará'),
      'La confirmación muestra el monto y avisa que el horario se libera si no se paga'
    );
    assert(
      appt1AfterConfirm?.depositDeadlineAt instanceof Date &&
        Math.abs(appt1AfterConfirm.depositDeadlineAt.getTime() - (appt1.createdAt.getTime() + 24 * HOUR)) < 1000,
      'La cita queda con límite de pago a 24 h de agendada'
    );

    // ---------------------------------------------------------------------
    console.log('\n🛡️ 3. Webhook de Mercado Pago');
    sentTexts.length = 0;
    const rejected = await postWebhook({
      type: 'payment',
      data: { id: 'pay-rechazado-1' },
      external_reference: appt1.id,
      status: 'rejected',
    });
    const afterRejected = await db.appointment.findUnique({ where: { id: appt1.id } });
    assert(
      rejected.statusCode === 200 && rejected.json().ignored === true && afterRejected?.paymentStatus === 'DEPOSIT_PENDING',
      'Pago rechazado: responde 200 (sin reintentos de Mercado Pago) y no acredita'
    );

    const otherType = await postWebhook({ type: 'merchant_order', data: { id: 'orden-1' } });
    assert(
      otherType.statusCode === 200 && otherType.json().ignored === true,
      'Notificación de otro tipo (merchant_order): responde 200 sin procesar'
    );

    const approved = await postWebhook({
      type: 'payment',
      data: { id: 'pay-aprobado-1' },
      external_reference: appt1.id,
      status: 'approved',
    });
    const duplicate = await postWebhook({
      type: 'payment',
      data: { id: 'pay-aprobado-1' },
      external_reference: appt1.id,
      status: 'approved',
    });
    await drainQueue();

    assert(
      approved.statusCode === 200 && approved.json().paymentStatus === 'DEPOSIT_PAID' && approved.json().duplicate === false,
      'Pago aprobado acredita el anticipo (DEPOSIT_PAID)'
    );
    assert(
      duplicate.statusCode === 200 && duplicate.json().duplicate === true,
      'La notificación duplicada responde 200 y se reconoce como duplicado'
    );
    const paidNotices = sentTexts.filter((text) => text.includes('Recibimos tu anticipo de $500 MXN'));
    assert(
      paidNotices.length === 1 && sentTexts.length === 1,
      'El paciente recibe un solo aviso "Recibimos tu anticipo" (distinto a la confirmación)'
    );
    const paidAudits = await db.auditLog.count({
      where: { tenantId: tenant.id, entityId: appt1.id, action: 'UPDATE', changes: { contains: 'DEPOSIT_PAID' } },
    });
    assert(paidAudits === 1, 'La acreditación se audita una sola vez aunque lleguen notificaciones duplicadas');

    // ---------------------------------------------------------------------
    console.log('\n🛡️ 4. Recordatorio único de pago');
    const start2 = new Date(Date.now() + 96 * HOUR);
    start2.setUTCMinutes(0, 0, 0);
    const appt2 = await createAppointment(start2, new Date(Date.now() - 13 * HOUR));
    await confirm(appt2.id);
    const appt2Confirmed = await db.appointment.findUnique({ where: { id: appt2.id } });
    sentTexts.length = 0;

    const sweepA = await sweepDeposits({ tenantId: tenant.id });
    const sweepB = await sweepDeposits({ tenantId: tenant.id });
    await drainQueue();
    const appt2AfterReminder = await db.appointment.findUnique({ where: { id: appt2.id } });
    assert(
      sweepA.reminded === 1 && sweepB.reminded === 0 && appt2AfterReminder?.depositReminderSentAt instanceof Date,
      'A la mitad del plazo se marca un único recordatorio aunque el barrido corra dos veces'
    );
    assert(
      sentTexts.length === 1 &&
        sentTexts[0].includes('te recordamos') &&
        sentTexts[0].includes(appt2Confirmed?.depositPaymentUrl ?? '__sin_link__'),
      'El recordatorio llega una vez y trae el link de pago'
    );
    assert(appt2AfterReminder?.status === 'CONFIRMED', 'Recordar no cancela la cita');

    // Confirmación que sale tarde (reintentos): el plazo mínimo de 1 h ya no
    // deja espacio para un recordatorio aparte; no se manda pegado a ella.
    const startLate = new Date(Date.now() + 150 * HOUR);
    startLate.setUTCMinutes(0, 0, 0);
    const lateConfirm = await createAppointment(startLate, new Date(Date.now() - 23.5 * HOUR));
    await confirm(lateConfirm.id);
    sentTexts.length = 0;
    const sweepLate = await sweepDeposits({ tenantId: tenant.id });
    await drainQueue();
    const lateAfter = await db.appointment.findUnique({ where: { id: lateConfirm.id } });
    assert(
      sweepLate.reminded === 0 &&
        sentTexts.length === 0 &&
        lateAfter?.depositReminderSentAt instanceof Date &&
        (lateAfter.depositDeadlineAt?.getTime() ?? 0) > Date.now() + 50 * 60_000,
      'Confirmación tardía: se garantiza 1 h para pagar y no se duplica el aviso con un recordatorio'
    );
    await db.appointment.update({ where: { id: lateConfirm.id }, data: { status: 'CANCELLED', slotKey: null } });

    // ---------------------------------------------------------------------
    console.log('\n🛡️ 5. Liberación del horario al vencer el anticipo');
    sentTexts.length = 0;
    const sweepExpired = await sweepDeposits({
      tenantId: tenant.id,
      now: new Date(appt2.createdAt.getTime() + 24 * HOUR + 60_000),
    });
    await drainQueue();
    const appt2Released = await db.appointment.findUnique({ where: { id: appt2.id } });
    assert(
      sweepExpired.released === 1 && appt2Released?.status === 'CANCELLED' && appt2Released.slotKey === null,
      'Anticipo vencido: la cita se cancela y su slotKey se libera'
    );

    const rebooked = await db.appointment.create({
      data: {
        tenantId: tenant.id,
        patientId: tenant.patients[0].id,
        doctorId,
        serviceId: tenant.services[0].id,
        startTime: start2,
        endTime: new Date(start2.getTime() + HOUR),
        status: 'CONFIRMED',
        slotKey: appointmentSlotKey({ doctorId, startTime: start2, status: 'CONFIRMED' }),
      },
    });
    assert(Boolean(rebooked.id), 'El mismo horario se puede volver a agendar tras liberarse');

    const expiredAudit = await db.auditLog.findFirst({
      where: { tenantId: tenant.id, entityId: appt2.id, actorType: 'SYSTEM', metadata: { contains: 'DEPOSIT_EXPIRED' } },
    });
    assert(Boolean(expiredAudit), 'La liberación queda auditada como SYSTEM (evento DEPOSIT_EXPIRED)');
    assert(
      sentTexts.length === 1 && sentTexts[0].includes('liberamos tu horario'),
      'El paciente recibe aviso de que su horario se liberó'
    );

    // Una cita de recepción (sin link automático, sin límite) jamás se cancela sola.
    const start3 = new Date(Date.now() + 120 * HOUR);
    start3.setUTCMinutes(0, 0, 0);
    const manual = await createAppointment(start3, new Date(Date.now() - 48 * HOUR));
    await sweepDeposits({ tenantId: tenant.id, now: new Date(Date.now() + 100 * HOUR) });
    const manualAfter = await db.appointment.findUnique({ where: { id: manual.id } });
    assert(manualAfter?.status === 'CONFIRMED', 'Una cita sin límite de pago (agendada por recepción) no se cancela sola');

    // Pago que llega después de liberar: se acredita, pero el aviso lo explica.
    sentTexts.length = 0;
    const latePayment = await postWebhook({
      type: 'payment',
      data: { id: 'pay-tardio-1' },
      external_reference: appt2.id,
      status: 'approved',
    });
    await drainQueue();
    assert(
      latePayment.statusCode === 200 &&
        sentTexts.length === 1 &&
        sentTexts[0].includes('ya se había liberado'),
      'Un pago tardío sobre un horario liberado avisa al paciente que recepción lo contactará'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (tenantId) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.doctor.deleteMany({ where: { tenantId } });
      await db.service.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO ANTICIPOS: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runDepositTests()
  .catch((error) => {
    console.error('Error en la suite de anticipos:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
