import { appointmentSlotKey, db, hashPassword } from '@asistente/database';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { buildServer } from './server.js';

process.env.JWT_SECRET ||= 'summary-test-secret-at-least-32-characters';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';

/**
 * Resumen del día (`GET /api/summary/today`): cifras correctas, cortes de día
 * en la zona horaria de la clínica y aislamiento entre clínicas.
 */
const HOUR = 60 * 60 * 1000;
const TZ = 'America/Mexico_City';

async function runSummaryTests() {
  console.log('☀️ ========================================================');
  console.log('☀️ INICIANDO PRUEBAS DEL RESUMEN DEL DÍA');
  console.log('☀️ ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

  let passed = 0;
  let failed = 0;
  const tenantIds: string[] = [];
  const suffix = Date.now().toString(36);
  const password = 'ResumenPrueba2026!';

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
    const email = `resumen-${suffix}@asistente.test`;
    const tenant = await db.tenant.create({
      data: {
        name: `Resumen ${suffix}`,
        slug: `resumen-${suffix}`,
        phoneE164: '+525599004401',
        users: { create: [{ email, name: 'Dra. Resumen', role: 'ADMIN', passwordHash: await hashPassword(password) }] },
        doctors: { create: [{ name: 'Dr. Agenda', specialty: 'Odontología' }] },
        services: { create: [{ name: 'Limpieza', durationMinutes: 30 }] },
        patients: {
          create: [
            { fullName: 'Paciente Nuevo', phoneE164: '+525511110001' },
            { fullName: 'Paciente Frecuente', phoneE164: '+525511110002' },
          ],
        },
      },
      include: { doctors: true, services: true, patients: true },
    });
    tenantIds.push(tenant.id);
    const other = await db.tenant.create({
      data: { name: `Otra ${suffix}`, slug: `resumen-otra-${suffix}`, phoneE164: '+525599004402' },
    });
    tenantIds.push(other.id);

    const [nuevo, frecuente] = tenant.patients;
    const doctorId = tenant.doctors[0].id;
    let minute = 0;
    const make = (startTime: Date, extra: Record<string, unknown> = {}) => {
      // Minuto distinto por cita para no chocar con el candado de horario.
      const start = new Date(startTime.getTime() + minute++ * 60_000);
      return db.appointment.create({
        data: {
          tenantId: tenant.id,
          patientId: nuevo.id,
          doctorId,
          serviceId: tenant.services[0].id,
          startTime: start,
          endTime: new Date(start.getTime() + 30 * 60_000),
          status: 'CONFIRMED',
          slotKey: appointmentSlotKey({ doctorId, startTime: start, status: 'CONFIRMED' }),
          ...extra,
        },
      });
    };

    // Límites del día de HOY en la CDMX, no del servidor.
    const now = new Date();
    const localToday = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
    const todayStart = fromZonedTime(`${localToday}T00:00:00`, TZ);
    // A medio camino entre ahora y la medianoche: siempre es hoy y en el
    // futuro, corra la prueba a la hora que corra (menos los 10 min de margen).
    const todayEnd = fromZonedTime(`${formatInTimeZone(new Date(todayStart.getTime() + 30 * HOUR), TZ, 'yyyy-MM-dd')}T00:00:00`, TZ);
    const laterToday = new Date(now.getTime() + (todayEnd.getTime() - now.getTime()) / 2 - 10 * 60_000);
    const tomorrowNoon = new Date(todayStart.getTime() + 36 * HOUR);

    // Hoy: una de paciente nuevo, una de paciente frecuente (con historial) y una cancelada.
    await make(new Date(todayStart.getTime() - 30 * 24 * HOUR), { patientId: frecuente.id, status: 'COMPLETED', slotKey: null });
    await make(laterToday, { paymentStatus: 'DEPOSIT_PENDING', depositAmountMxn: 300 });
    await make(laterToday, { patientId: frecuente.id });
    await make(laterToday, { status: 'CANCELLED', slotKey: null });
    // Justo antes de la medianoche de la CDMX de ayer: no es de hoy.
    await make(new Date(todayStart.getTime() - 30 * 60_000), { patientId: frecuente.id, status: 'COMPLETED', slotKey: null });
    // Una cita pasada cancelada no es historial: sigue siendo primera visita.
    await make(new Date(todayStart.getTime() - 10 * 24 * HOUR), { status: 'CANCELLED', slotKey: null });
    await make(tomorrowNoon, { paymentStatus: 'DEPOSIT_PENDING', depositAmountMxn: 200 });

    await db.conversation.create({
      data: { tenantId: tenant.id, patientId: nuevo.id, channel: 'WHATSAPP', externalChannelId: `wa-${suffix}`, isHandedOverToHuman: true },
    });

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    const headers = { authorization: `Bearer ${JSON.parse(login.body).token}` };

    const res = await app.inject({ method: 'GET', url: '/api/summary/today', headers });
    const body = res.json();
    assert(res.statusCode === 200, 'GET /api/summary/today responde 200');
    assert(body.date === localToday, 'El día se corta en la hora de la clínica (CDMX)');
    assert(body.today.total === 2, `Cuenta las citas de hoy sin canceladas ni las de ayer (obtenido: ${body.today.total})`);
    assert(
      body.today.firstVisits.length === 1 && body.today.firstVisits[0].patientName === 'Paciente Nuevo',
      'Marca como primera visita solo al paciente sin historial'
    );
    assert(body.tomorrow.total === 1, 'Cuenta las citas de mañana');
    assert(
      body.deposits.pendingCount === 2 && body.deposits.pendingAmountMxn === 500,
      'Suma los anticipos pendientes de citas futuras'
    );
    assert(body.inbox.waitingForStaff === 1, 'Cuenta los chats que esperan a recepción');
    assert(Boolean(body.today.next?.patientName), 'Indica la próxima cita del día');

    const foreign = await app.inject({ method: 'GET', url: `/api/summary/today?tenantId=${other.id}`, headers });
    assert(foreign.statusCode === 403, 'No se puede pedir el resumen de otra clínica');
  } finally {
    for (const tenantId of tenantIds) {
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DEL RESUMEN PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runSummaryTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
