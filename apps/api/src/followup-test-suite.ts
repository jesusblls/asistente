import { db } from '@asistente/database';
import { recordSurveyAnswer, runFollowUpSweep } from './services/followups/followupService.js';

/**
 * Encuesta post-cita e invitación a revisión periódica.
 *
 * Reloj fijo en el futuro: ninguna cita de otras suites o del entorno de
 * desarrollo cae en estas ventanas, así que los conteos son exactos.
 */
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';
// Ninguno de estos pacientes escribió en las últimas 24 h: sin plantilla
// aprobada, WhatsApp rechazaría el mensaje. Se configuran para las pruebas.
process.env.WHATSAPP_SURVEY_TEMPLATE = 'encuesta_cita';
process.env.WHATSAPP_RECALL_TEMPLATE = 'revision_periodica';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function runFollowUpTests() {
  console.log('💬 ========================================================');
  console.log('💬 INICIANDO PRUEBAS DE ENCUESTA Y REVISIÓN PERIÓDICA');
  console.log('💬 ========================================================\n');

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

  const now = new Date('2032-05-10T18:00:00.000Z');
  const jobsFor = (key: string) => db.job.findMany({ where: { dedupeKey: { startsWith: key } } });

  try {
    const tenant = await db.tenant.create({
      data: {
        name: `Seguimiento ${suffix}`,
        slug: `seguimiento-${suffix}`,
        phoneE164: '+525599005501',
        subscriptionStatus: 'ACTIVE',
        doctors: { create: [{ name: 'Dra. Seguimiento', specialty: 'Odontología' }] },
        services: { create: [{ name: 'Limpieza', durationMinutes: 30 }] },
      },
      include: { doctors: true, services: true },
    });
    tenantIds.push(tenant.id);
    const noRecall = await db.tenant.create({
      data: { name: `Sin revisión ${suffix}`, slug: `sin-revision-${suffix}`, phoneE164: '+525599005502', subscriptionStatus: 'ACTIVE', recallMonths: null, surveyEnabled: false },
      include: { doctors: true, services: true },
    });
    tenantIds.push(noRecall.id);
    const noRecallDoctor = await db.doctor.create({ data: { tenantId: noRecall.id, name: 'Dr. X', specialty: 'General' } });
    const noRecallService = await db.service.create({ data: { tenantId: noRecall.id, name: 'Consulta', durationMinutes: 30 } });

    const patient = (tenantId: string, name: string, phone: string) =>
      db.patient.create({ data: { tenantId, fullName: name, phoneE164: phone } });
    const appointment = (
      tenantId: string,
      patientId: string,
      doctorId: string,
      serviceId: string,
      endTime: Date,
      status = 'COMPLETED'
    ) =>
      db.appointment.create({
        data: {
          tenantId,
          patientId,
          doctorId,
          serviceId,
          startTime: new Date(endTime.getTime() - 30 * 60_000),
          endTime,
          status,
        },
      });

    const doctorId = tenant.doctors[0].id;
    const serviceId = tenant.services[0].id;

    console.log('⭐ 1. Encuesta después de la cita');
    const surveyed = await patient(tenant.id, 'Ana Encuesta', '+525511220001');
    const recentDone = await appointment(tenant.id, surveyed.id, doctorId, serviceId, new Date(now.getTime() - 3 * HOUR));
    const tooFresh = await appointment(tenant.id, surveyed.id, doctorId, serviceId, new Date(now.getTime() - 30 * 60_000));
    const notCompleted = await appointment(tenant.id, surveyed.id, doctorId, serviceId, new Date(now.getTime() - 5 * HOUR), 'NO_SHOW');
    const otherClinicPatient = await patient(noRecall.id, 'Sin Encuesta', '+525511220009');
    const disabledClinic = await appointment(noRecall.id, otherClinicPatient.id, noRecallDoctor.id, noRecallService.id, new Date(now.getTime() - 3 * HOUR));

    const first = await runFollowUpSweep(now);
    const surveyJob = (await jobsFor(`survey:${recentDone.id}`))[0];
    const surveyPayload = surveyJob ? JSON.parse(surveyJob.payload) : null;
    assert(Boolean(surveyJob), 'Una cita completada hace 3 h recibe la encuesta');
    assert(
      surveyPayload?.template?.name === 'encuesta_cita' &&
        surveyPayload.template.quickReplyPayloads?.[2] === `survey_${recentDone.id}_1`,
      'Fuera de la ventana de 24 h sale con la plantilla y sus tres botones'
    );
    assert((await jobsFor(`survey:${tooFresh.id}`)).length === 0, 'No se encuesta a quien salió hace menos de 2 h');
    assert((await jobsFor(`survey:${notCompleted.id}`)).length === 0, 'No se encuesta a quien no llegó (NO_SHOW)');
    assert((await jobsFor(`survey:${disabledClinic.id}`)).length === 0, 'No se encuesta en una clínica que la apagó');

    console.log('\n📝 2. Respuesta de la encuesta');
    const answer = await recordSurveyAnswer({ tenantId: tenant.id, patientId: surveyed.id, appointmentId: recentDone.id, score: 1 });
    const answered = await db.appointment.findUnique({ where: { id: recentDone.id } });
    assert(answered?.surveyScore === 1 && answer.lowScore, 'Se guarda la calificación y una baja se marca para recepción');
    const again = await recordSurveyAnswer({ tenantId: tenant.id, patientId: surveyed.id, appointmentId: recentDone.id, score: 3 });
    const stillOne = await db.appointment.findUnique({ where: { id: recentDone.id } });
    assert(stillOne?.surveyScore === 1 && !again.lowScore, 'Solo cuenta la primera respuesta');
    const intruder = await patient(tenant.id, 'Otro Paciente', '+525511220002');
    await recordSurveyAnswer({ tenantId: tenant.id, patientId: intruder.id, appointmentId: tooFresh.id, score: 3 });
    const untouched = await db.appointment.findUnique({ where: { id: tooFresh.id } });
    assert(untouched?.surveyScore === null, 'Nadie califica la cita de otro paciente');

    console.log('\n🦷 3. Invitación a revisión periódica');
    const due = await patient(tenant.id, 'Luis Revisión', '+525511220003');
    await appointment(tenant.id, due.id, doctorId, serviceId, new Date(now.getTime() - 200 * DAY));
    const booked = await patient(tenant.id, 'Rosa Agendada', '+525511220004');
    await appointment(tenant.id, booked.id, doctorId, serviceId, new Date(now.getTime() - 200 * DAY));
    await appointment(tenant.id, booked.id, doctorId, serviceId, new Date(now.getTime() + 5 * DAY), 'CONFIRMED');
    const recent = await patient(tenant.id, 'Pepe Reciente', '+525511220005');
    await appointment(tenant.id, recent.id, doctorId, serviceId, new Date(now.getTime() - 60 * DAY));
    const lost = await patient(tenant.id, 'Toño Perdido', '+525511220006');
    await appointment(tenant.id, lost.id, doctorId, serviceId, new Date(now.getTime() - 800 * DAY));
    const disabledPatient = await patient(noRecall.id, 'Sin Revisión', '+525511220007');
    await appointment(noRecall.id, disabledPatient.id, noRecallDoctor.id, noRecallService.id, new Date(now.getTime() - 200 * DAY));

    const sweep = await runFollowUpSweep(now);
    const recallJobs = await jobsFor(`recall:${due.id}`);
    assert(recallJobs.length === 1, 'Quien no ha vuelto en 6 meses y no tiene cita recibe la invitación');
    assert(
      JSON.parse(recallJobs[0]?.payload ?? '{}').template?.name === 'revision_periodica',
      'La invitación sale con su plantilla fuera de la ventana de 24 h'
    );
    assert((await jobsFor(`recall:${booked.id}`)).length === 0, 'Quien ya tiene cita en agenda no recibe invitación');
    assert((await jobsFor(`recall:${recent.id}`)).length === 0, 'Quien vino hace 2 meses no recibe invitación');
    assert((await jobsFor(`recall:${lost.id}`)).length === 0, 'No se persigue a quien dejó de venir hace más de un año extra');
    assert((await jobsFor(`recall:${disabledPatient.id}`)).length === 0, 'No se invita en una clínica que la apagó');
    assert(sweep.recalls === 1 && first.surveys === 1, 'Los contadores del barrido cuadran');

    const second = await runFollowUpSweep(now);
    assert(second.recalls === 0 && second.surveys === 0, 'Un segundo barrido no repite nada');

    console.log('\n🙊 4. Sin plantilla y sin ventana no se intenta');
    delete process.env.WHATSAPP_RECALL_TEMPLATE;
    const silent = await patient(tenant.id, 'Sin Plantilla', '+525511220008');
    await appointment(tenant.id, silent.id, doctorId, serviceId, new Date(now.getTime() - 200 * DAY));
    await runFollowUpSweep(now);
    const silentAfter = await db.patient.findUnique({ where: { id: silent.id } });
    assert(
      (await jobsFor(`recall:${silent.id}`)).length === 0 && silentAfter?.recallSentAt === null,
      'Sin plantilla aprobada no se encola (Meta lo rechazaría) y el paciente no se marca'
    );
    process.env.WHATSAPP_RECALL_TEMPLATE = 'revision_periodica';
  } catch (error) {
    console.error('Error inesperado en la suite de seguimiento:', error);
    failed++;
  } finally {
    for (const tenantId of tenantIds) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
  }

  console.log(`\n💬 Resultado: ${passed} aprobadas, ${failed} fallidas\n`);
  if (failed > 0) process.exit(1);
}

runFollowUpTests()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
