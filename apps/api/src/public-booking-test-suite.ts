import { db } from '@asistente/database';
import { buildServer } from './server.js';

process.env.JWT_SECRET ||= 'public-booking-test-secret-at-least-32-chars';
process.env.META_VERIFY_TOKEN ||= 'test-meta-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';

/**
 * Portal público de citas (`/api/public/clinics/:slug`): qué se publica, qué
 * no, y que agendar sin sesión respete todas las reglas.
 */
const DAY = 24 * 60 * 60 * 1000;

async function runPublicBookingTests() {
  console.log('🌐 ========================================================');
  console.log('🌐 INICIANDO PRUEBAS DEL PORTAL PÚBLICO DE CITAS');
  console.log('🌐 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

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

  // Siguiente día hábil (martes a jueves) a ≥ 3 días, en fecha de la CDMX.
  const nextWeekday = () => {
    const d = new Date(Date.now() + 3 * DAY);
    while (![2, 3, 4].includes(d.getUTCDay())) d.setTime(d.getTime() + DAY);
    return d.toISOString().slice(0, 10);
  };

  const makeClinic = (label: string, extra: Record<string, unknown> = {}) =>
    db.tenant.create({
      data: {
        name: `Portal ${label} ${suffix}`,
        slug: `portal-${label}-${suffix}`,
        phoneE164: '+525599006601',
        subscriptionStatus: 'ACTIVE',
        onboardingCompletedAt: new Date(),
        doctors: { create: [{ name: `Dra. Portal ${label}`, specialty: 'Odontología' }] },
        services: { create: [{ name: 'Limpieza', durationMinutes: 30, priceMxn: 800 }] },
        ...extra,
      },
      include: { doctors: true, services: true },
    });

  try {
    const clinic = await makeClinic('a');
    tenantIds.push(clinic.id);
    const other = await makeClinic('b');
    tenantIds.push(other.id);
    const off = await makeClinic('off', { publicBookingEnabled: false });
    tenantIds.push(off.id);
    const unfinished = await makeClinic('unfinished', { onboardingCompletedAt: null });
    tenantIds.push(unfinished.id);
    const existing = await db.patient.create({
      data: { tenantId: clinic.id, fullName: 'Nombre Real', phoneE164: '+525522223333' },
    });

    console.log('🔎 1. Qué se publica');
    const catalog = await app.inject({ method: 'GET', url: `/api/public/clinics/${clinic.slug}` });
    const body = catalog.json();
    assert(catalog.statusCode === 200 && body.services.length === 1 && body.doctors.length === 1, 'El catálogo público trae servicios y doctores');
    assert(!catalog.body.includes('Nombre Real') && !catalog.body.includes('5522223333'), 'El catálogo no expone pacientes');
    for (const [slug, title] of [
      [`no-existe-${suffix}`, 'Un slug inexistente responde 404'],
      [off.slug, 'Una clínica con el portal apagado responde 404'],
      [unfinished.slug, 'Una clínica sin onboarding terminado responde 404'],
    ]) {
      const res = await app.inject({ method: 'GET', url: `/api/public/clinics/${slug}` });
      assert(res.statusCode === 404, title);
    }

    console.log('\n🕐 2. Horarios libres');
    const date = nextWeekday();
    const slotsRes = await app.inject({
      method: 'GET',
      url: `/api/public/clinics/${clinic.slug}/slots?date=${date}&serviceId=${clinic.services[0].id}`,
    });
    const slots = slotsRes.json().slots as { doctorId: string; startTime: string }[];
    assert(slotsRes.statusCode === 200 && slots.length > 0, 'Devuelve horarios libres del día');
    const tooFar = await app.inject({
      method: 'GET',
      url: `/api/public/clinics/${clinic.slug}/slots?date=2099-01-01&serviceId=${clinic.services[0].id}`,
    });
    assert(tooFar.statusCode === 400, 'No deja consultar fechas lejanas');

    console.log('\n📝 3. Agendar sin sesión');
    const base = {
      serviceId: clinic.services[0].id,
      doctorId: clinic.doctors[0].id,
      startTime: slots[0].startTime,
      fullName: 'Paciente Portal',
      phone: '55 1111 2222',
      acceptPrivacy: true,
    };
    // Una IP distinta por envío: el límite de 5 por hora por IP se prueba aparte.
    let ip = 10;
    const post = (payload: Record<string, unknown>, slug = clinic.slug, remoteAddress = `10.0.0.${ip++}`) =>
      app.inject({ method: 'POST', url: `/api/public/clinics/${slug}/appointments`, payload, remoteAddress });

    const noPrivacy = await post({ ...base, acceptPrivacy: false });
    assert(noPrivacy.statusCode === 400, 'Sin aceptar el aviso de privacidad no se agenda');
    const badPhone = await post({ ...base, phone: '123' });
    assert(badPhone.statusCode === 400, 'Un celular inválido se rechaza');

    const bot = await post({ ...base, website: 'http://spam.example' });
    const botCount = await db.appointment.count({ where: { tenantId: clinic.id } });
    assert(bot.statusCode === 201 && botCount === 0, 'El campo trampa descarta al bot sin delatarse');

    const crossTenant = await post({ ...base, serviceId: other.services[0].id, doctorId: other.doctors[0].id });
    assert(crossTenant.statusCode === 409, 'No se puede agendar un servicio o doctor de otra clínica');

    const ok = await post(base);
    const booked = ok.json().appointment;
    assert(ok.statusCode === 201 && Boolean(booked?.id), 'Agenda la cita y responde los datos para el paciente');
    const stored = await db.appointment.findUnique({ where: { id: booked.id } });
    assert(stored?.channelOrigin === 'WEB_PORTAL' && stored.tenantId === clinic.id, 'La cita queda con canal WEB_PORTAL en su clínica');
    const confirmJob = await db.job.findFirst({ where: { dedupeKey: `wa-confirm:${booked.id}` } });
    assert(Boolean(confirmJob), 'Se encola la confirmación por WhatsApp');
    const audit = await db.auditLog.findFirst({ where: { tenantId: clinic.id, entityId: booked.id, action: 'CREATE' } });
    assert(audit?.actorType === 'ANONYMOUS', 'La reserva queda auditada como ANONYMOUS');

    const taken = await post({ ...base, phone: '55 3333 4444', fullName: 'Otro Paciente' });
    assert(taken.statusCode === 409, 'Un horario ya tomado se rechaza');

    console.log('\n🛡️ 4. Abuso');
    const rename = await post({ ...base, startTime: slots[1].startTime, phone: '55 2222 3333', fullName: 'Nombre Falso' });
    const existingAfter = await db.patient.findUnique({ where: { id: existing.id } });
    assert(rename.statusCode === 201 && existingAfter?.fullName === 'Nombre Real', 'El portal no renombra a un paciente existente');

    const third = await post({ ...base, startTime: slots[2].startTime });
    const fourth = await post({ ...base, startTime: slots[3]?.startTime ?? slots[2].startTime });
    assert(third.statusCode === 201 && fourth.statusCode === 409, 'Tope de citas futuras en línea por celular');

    const sameIp = [];
    for (let i = 0; i < 6; i += 1) sameIp.push(await post({ ...base, acceptPrivacy: false }, clinic.slug, '10.9.9.9'));
    assert(sameIp[5].statusCode === 429, 'Más de 5 envíos por hora desde la misma IP se frenan');
  } finally {
    for (const tenantId of tenantIds) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DEL PORTAL PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runPublicBookingTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
