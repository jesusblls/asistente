import { db } from '@asistente/database';
import { runReminderSweep } from './services/reminders/reminderService.js';

/**
 * Pruebas del barrido de recordatorios de cita (24 h y 2 h).
 *
 * Se invoca `runReminderSweep(now)` directamente con un reloj fijo: así la
 * prueba no depende de la hora real ni del intervalo del barrido. Solo se
 * cuentan trabajos y banderas de la clínica de prueba, porque la base se
 * comparte con otras suites y con el entorno de desarrollo.
 */

process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';
// Fuera de la ventana de 24 h solo sale con plantilla aprobada; la mayoría de
// estos pacientes no ha escrito, así que se configura una para las pruebas
// generales y se quita en la sección que prueba la ventana.
process.env.WHATSAPP_REMINDER_TEMPLATE = 'recordatorio_cita';

const HOUR = 60 * 60 * 1000;

async function runReminderTests() {
  console.log('⏰ ========================================================');
  console.log('⏰ INICIANDO PRUEBAS DE RECORDATORIOS DE CITA');
  console.log('⏰ ========================================================\n');

  let passed = 0;
  let failed = 0;
  const tenantIds: string[] = [];
  const suffix = Date.now().toString(36);

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  // Un reloj lejano en el futuro: ninguna cita real de otras suites o del
  // entorno de desarrollo cae en estas ventanas, así que los conteos son exactos.
  const now = new Date('2031-03-10T15:00:00.000Z');

  const remindersFor = (appointmentId: string) =>
    db.job.findMany({
      where: { type: 'WHATSAPP_SEND', dedupeKey: { startsWith: `reminder-` }, payload: { contains: appointmentId } },
    });

  try {
    const tenant = await db.tenant.create({
      data: {
        name: `Clínica Recordatorios ${suffix}`,
        slug: `reminders-test-${suffix}`,
        phoneE164: '+525599001144',
        address: 'Av. Presidente Masaryk 111, Polanco',
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: null,
      },
    });
    tenantIds.push(tenant.id);

    const suspended = await db.tenant.create({
      data: {
        name: `Clínica Suspendida ${suffix}`,
        slug: `reminders-suspended-${suffix}`,
        phoneE164: '+525599001145',
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(now.getTime() - 24 * HOUR),
      },
    });
    tenantIds.push(suspended.id);

    const makeFixtures = async (tenantId: string, phone: string) => {
      const doctor = await db.doctor.create({
        data: { tenantId, name: 'Dra. Ana López', specialty: 'Endodoncia' },
      });
      const service = await db.service.create({
        data: { tenantId, name: 'Limpieza con ultrasonido', durationMinutes: 30 },
      });
      const patient = await db.patient.create({
        data: { tenantId, fullName: 'Paciente Recordatorio', phoneE164: phone },
      });
      return { doctor, service, patient };
    };

    const main = await makeFixtures(tenant.id, '+528128651819');
    const noPhonePatient = await db.patient.create({
      data: { tenantId: tenant.id, fullName: 'Sin Teléfono', phoneE164: '' },
    });
    const conversation = await db.conversation.create({
      data: {
        tenantId: tenant.id,
        patientId: main.patient.id,
        channel: 'WHATSAPP',
        externalChannelId: `wa-${suffix}`,
      },
    });

    let slot = 0;
    const createAppointment = (
      offsetMs: number,
      overrides: {
        status?: string;
        patientId?: string;
        tenantId?: string;
        fixtures?: typeof main;
        createdAt?: Date;
      } = {}
    ) => {
      const fixtures = overrides.fixtures ?? main;
      // Minuto distinto por cita para no chocar con el candado `slotKey`.
      const startTime = new Date(now.getTime() + offsetMs + slot++ * 60_000);
      return db.appointment.create({
        data: {
          tenantId: overrides.tenantId ?? tenant.id,
          patientId: overrides.patientId ?? fixtures.patient.id,
          doctorId: fixtures.doctor.id,
          serviceId: fixtures.service.id,
          startTime,
          endTime: new Date(startTime.getTime() + 30 * 60_000),
          status: overrides.status ?? 'CONFIRMED',
          ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
        },
      });
    };

    const in20h = await createAppointment(20 * HOUR);
    const in90m = await createAppointment(90 * 60_000);
    const in30h = await createAppointment(30 * HOUR);
    const past = await createAppointment(-3 * HOUR);
    const cancelled = await createAppointment(20 * HOUR, { status: 'CANCELLED' });
    const completed = await createAppointment(90 * 60_000, { status: 'COMPLETED' });
    const noPhone = await createAppointment(20 * HOUR, { patientId: noPhonePatient.id });
    // Agendada hace 10 min para dentro de 90 min: la confirmación acaba de salir.
    const freshBooking = await createAppointment(90 * 60_000, {
      createdAt: new Date(now.getTime() - 10 * 60_000),
    });
    // Paciente cuyo chat está en manos de recepción (takeover).
    const takeoverPatient = await db.patient.create({
      data: { tenantId: tenant.id, fullName: 'Paciente Takeover', phoneE164: '+523312345678' },
    });
    await db.conversation.create({
      data: {
        tenantId: tenant.id,
        patientId: takeoverPatient.id,
        channel: 'WHATSAPP',
        externalChannelId: `wa-takeover-${suffix}`,
        isHandedOverToHuman: true,
      },
    });
    const takeover = await createAppointment(20 * HOUR, { patientId: takeoverPatient.id });
    const suspendedFixtures = await makeFixtures(suspended.id, '+525512345678');
    const suspendedAppt = await createAppointment(20 * HOUR, {
      tenantId: suspended.id,
      fixtures: suspendedFixtures,
    });

    // 1. Primer barrido.
    const first = await runReminderSweep(now);
    assert(first.sent24h === 1, `Un recordatorio de 24 h encolado (obtenido: ${first.sent24h})`);
    assert(first.sent2h === 1, `Un recordatorio de 2 h encolado (obtenido: ${first.sent2h})`);

    const jobs20h = await remindersFor(in20h.id);
    assert(jobs20h.length === 1, 'La cita a 20 h tiene exactamente un trabajo WHATSAPP_SEND');
    const payload = JSON.parse(jobs20h[0]?.payload ?? '{}') as {
      kind?: string;
      toPhoneE164?: string;
      text?: string;
      messageId?: string;
    };
    assert(payload.kind === 'TEXT' && payload.toPhoneE164 === '+528128651819', 'Payload TEXT al teléfono del paciente');
    assert(
      Boolean(payload.text?.includes(tenant.name) && payload.text.includes('Dra. Ana López') && payload.text.includes('Limpieza con ultrasonido')),
      'El texto incluye clínica, doctor y servicio'
    );
    // 2031-03-11T11:00Z = 05:00 en CDMX (sin horario de verano desde 2022).
    assert(Boolean(payload.text?.includes('5:00')), 'La hora se muestra en horario de la Ciudad de México');
    assert(Boolean(payload.text?.includes('Confirmo')), 'El texto pide confirmar o reagendar');
    assert(jobs20h[0]?.tenantId === tenant.id, 'El trabajo queda ligado a la clínica correcta');

    const reminderMessage = payload.messageId
      ? await db.message.findFirst({ where: { id: payload.messageId, tenantId: tenant.id } })
      : null;
    assert(
      reminderMessage?.conversationId === conversation.id && reminderMessage.senderRole === 'SYSTEM',
      'El recordatorio queda registrado en la bandeja del paciente'
    );

    const refreshed20h = await db.appointment.findUnique({ where: { id: in20h.id } });
    assert(refreshed20h?.reminderSent24h === true && refreshed20h.reminderSent2h === false, 'Cita a 20 h: solo bandera de 24 h');

    const refreshed90m = await db.appointment.findUnique({ where: { id: in90m.id } });
    assert(refreshed90m?.reminderSent2h === true, 'Cita a 90 min: bandera de 2 h marcada');
    assert(refreshed90m?.reminderSent24h === false, 'Cita creada dentro de las 2 h no recibe el de 24 h');
    assert((await remindersFor(in90m.id)).length === 1, 'Cita a 90 min: un solo trabajo (el de 2 h)');

    for (const [label, appt] of [
      ['a 30 h (fuera de ventana)', in30h],
      ['pasada', past],
      ['cancelada', cancelled],
      ['completada', completed],
      ['de paciente sin teléfono', noPhone],
      ['de clínica suspendida', suspendedAppt],
      ['agendada dentro de la ventana', freshBooking],
      ['con chat en modo humano', takeover],
    ] as const) {
      const jobs = await remindersFor(appt.id);
      const row = await db.appointment.findUnique({ where: { id: appt.id } });
      assert(
        jobs.length === 0 && row?.reminderSent24h === false && row.reminderSent2h === false,
        `Cita ${label}: sin recordatorio`
      );
    }

    const audit = await db.auditLog.findFirst({
      where: { tenantId: tenant.id, entityType: 'APPOINTMENT', entityId: in20h.id, actorType: 'SYSTEM' },
    });
    assert(Boolean(audit?.changes?.includes('reminderSent24h')), 'El cambio de bandera queda auditado');

    // 2. Idempotencia: el mismo barrido otra vez no repite nada.
    const second = await runReminderSweep(now);
    assert(second.sent24h === 0 && second.sent2h === 0, 'Segundo barrido no encola recordatorios repetidos');

    // 3. Barridos concurrentes (dos instancias de la API): uno solo gana cada cita.
    const concurrent = await createAppointment(10 * HOUR);
    const results = await Promise.all([runReminderSweep(now), runReminderSweep(now)]);
    const totalConcurrent = results.reduce((sum, r) => sum + r.sent24h, 0);
    assert(totalConcurrent === 1, `Barridos simultáneos encolan una sola vez (obtenido: ${totalConcurrent})`);
    assert((await remindersFor(concurrent.id)).length === 1, 'Un solo trabajo para la cita en carrera');

    // 4. Al avanzar el reloj, la cita a 20 h entra en la ventana de 2 h:
    //    recibe el de 2 h una sola vez y no repite el de 24 h.
    const later = new Date(now.getTime() + 19 * HOUR);
    const third = await runReminderSweep(later);
    const jobsAfter = await remindersFor(in20h.id);
    assert(jobsAfter.length === 2, 'La cita a 20 h acumula exactamente 24 h + 2 h');
    assert(third.sent2h >= 1, 'El recordatorio de 2 h sale cuando la cita entra en su ventana');
    const fourth = await runReminderSweep(later);
    assert(fourth.sent2h === 0 && fourth.sent24h === 0, 'El de 2 h tampoco se repite');

    // 5. Reagendar (lo que hace el PATCH de citas: nuevo horario y banderas en
    //    false) produce un recordatorio nuevo sin chocar con el anterior.
    const movedStart = new Date(now.getTime() + 22 * HOUR);
    await db.appointment.update({
      where: { id: in20h.id },
      data: {
        startTime: movedStart,
        endTime: new Date(movedStart.getTime() + 30 * 60_000),
        reminderSent24h: false,
        reminderSent2h: false,
      },
    });
    await runReminderSweep(now);
    assert((await remindersFor(in20h.id)).length === 3, 'La cita reagendada recibe su propio recordatorio de 24 h');

    // Ventana de 24 h de WhatsApp.
    const payloadOf = async (appointmentId: string) => {
      const [job] = await remindersFor(appointmentId);
      return job ? (JSON.parse(job.payload) as { template?: { name: string; bodyParameters: string[]; quickReplyPayloads?: string[] } }) : null;
    };

    const outsidePayload = await payloadOf(in90m.id);
    assert(
      outsidePayload?.template?.name === 'recordatorio_cita' &&
        outsidePayload.template.bodyParameters.length === 4 &&
        outsidePayload.template.quickReplyPayloads?.[0] === `confirm_${in90m.id}`,
      'Sin mensaje reciente del paciente, el recordatorio sale con la plantilla aprobada'
    );

    const recentPatient = await db.patient.create({
      data: { tenantId: tenant.id, fullName: 'Paciente Reciente', phoneE164: '+525587654321' },
    });
    const recentConversation = await db.conversation.create({
      data: { tenantId: tenant.id, patientId: recentPatient.id, channel: 'WHATSAPP', externalChannelId: `wa-recent-${suffix}` },
    });
    await db.message.create({
      data: {
        conversationId: recentConversation.id,
        tenantId: tenant.id,
        direction: 'INBOUND',
        senderRole: 'PATIENT',
        content: 'Hola',
        channel: 'WHATSAPP',
        createdAt: new Date(now.getTime() - HOUR),
      },
    });
    const recentAppt = await createAppointment(20 * HOUR, { patientId: recentPatient.id });
    await runReminderSweep(now);
    const insidePayload = await payloadOf(recentAppt.id);
    assert(
      insidePayload !== null && insidePayload.template === undefined,
      'Si el paciente escribió en las últimas 24 h, sale como texto libre (sin plantilla)'
    );

    delete process.env.WHATSAPP_REMINDER_TEMPLATE;
    const silentPatient = await db.patient.create({
      data: { tenantId: tenant.id, fullName: 'Paciente Sin Chat', phoneE164: '+525511223399' },
    });
    const silentAppt = await createAppointment(20 * HOUR, { patientId: silentPatient.id });
    await runReminderSweep(now);
    const silentAfter = await db.appointment.findUnique({ where: { id: silentAppt.id } });
    assert(
      (await remindersFor(silentAppt.id)).length === 0 && silentAfter?.reminderSent24h === false,
      'Sin plantilla ni ventana abierta no se encola nada (Meta lo rechazaría) y la cita no se marca'
    );
    process.env.WHATSAPP_REMINDER_TEMPLATE = 'recordatorio_cita';
  } catch (error) {
    console.error('Error inesperado en la suite de recordatorios:', error);
    failed++;
  } finally {
    for (const tenantId of tenantIds) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.message.deleteMany({ where: { tenantId } });
      await db.conversation.deleteMany({ where: { tenantId } });
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.doctor.deleteMany({ where: { tenantId } });
      await db.service.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
  }

  console.log(`\n⏰ Resultado: ${passed} aprobadas, ${failed} fallidas\n`);
  if (failed > 0) process.exit(1);
}

runReminderTests()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
