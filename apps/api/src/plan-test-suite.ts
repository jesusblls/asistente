/**
 * Suite de planes de suscripción: cupos, prueba gratuita y consumo medido.
 *
 * Lo que se protege aquí es la promesa comercial: si la landing anuncia "1
 * doctor" o "300 minutos", el backend debe aplicarlo. Antes de esta suite los
 * tres planes eran funcionalmente idénticos (acceso total) y nada lo detectaba.
 */
import {
  PlanLimitError,
  assertCanAddDoctor,
  assertCanBookAppointment,
  assertCanTakeCall,
  db,
  getPlanSummary,
  getUsage,
  recordUsage,
  resolveTenantPlan,
  usagePeriod,
  usagePeriodStart,
} from '@asistente/database';
import { PLANS, TRIAL_DURATION_DAYS } from '@asistente/shared-types';

async function runPlanTests() {
  let passed = 0;
  let failed = 0;
  const createdTenantIds: string[] = [];

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed += 1;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed += 1;
    }
  }

  async function expectPlanLimit(fn: () => Promise<unknown>): Promise<PlanLimitError | null> {
    try {
      await fn();
      return null;
    } catch (error) {
      return error instanceof PlanLimitError ? error : null;
    }
  }

  async function makeTenant(planSlug: string, extra: Record<string, unknown> = {}) {
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const tenant = await db.tenant.create({
      data: {
        name: `Clínica Plan ${suffix}`,
        slug: `clinica-plan-${suffix}`,
        phoneE164: '+525599990000',
        planSlug,
        subscriptionStatus: 'ACTIVE',
        ...extra,
      },
    });
    createdTenantIds.push(tenant.id);
    return tenant;
  }

  console.log('\n🧪 SUITE DE PLANES DE SUSCRIPCIÓN\n');

  try {
    // ---------------------------------------------------------------------
    console.log('▶ Periodo de consumo (mes natural del centro de México)');
    // ---------------------------------------------------------------------
    const bordeMes = new Date('2026-10-01T01:00:00Z'); // 30 sep 19:00 en CDMX
    assert(
      usagePeriod(bordeMes) === '2026-09',
      'Una llamada del 30 de septiembre por la noche se carga a septiembre, no a octubre'
    );
    assert(
      usagePeriodStart(bordeMes).toISOString() === '2026-09-01T06:00:00.000Z',
      'El periodo arranca en la medianoche de CDMX, no en la de UTC'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Estado de la prueba gratuita');
    // ---------------------------------------------------------------------
    const ahora = new Date('2026-09-16T18:00:00Z');
    const vencido = resolveTenantPlan(
      { planSlug: 'trial', subscriptionStatus: 'TRIALING', trialEndsAt: new Date('2026-09-01T00:00:00Z') },
      ahora
    );
    assert(
      vencido.isSuspended && vencido.limits.maxDoctors === 0 && !vencido.limits.voiceEnabled,
      'Una prueba vencida queda suspendida y sin cupo para escribir ni recibir llamadas'
    );

    const vigente = resolveTenantPlan(
      { planSlug: 'trial', subscriptionStatus: 'TRIALING', trialEndsAt: new Date('2026-09-25T00:00:00Z') },
      ahora
    );
    assert(
      !vigente.isSuspended && vigente.trialDaysLeft === 9 && vigente.limits.voiceEnabled,
      'Una prueba vigente conserva sus cupos y reporta los días que le quedan'
    );

    const corrupto = resolveTenantPlan(
      { planSlug: 'plan-que-no-existe', subscriptionStatus: 'ACTIVE', trialEndsAt: null },
      ahora
    );
    assert(
      corrupto.plan.slug === 'trial',
      'Un plan desconocido degrada al cupo más chico, nunca al más amplio'
    );

    const moroso = resolveTenantPlan(
      { planSlug: 'cadenas', subscriptionStatus: 'PAST_DUE', trialEndsAt: null },
      ahora
    );
    assert(
      moroso.isSuspended && moroso.limits.maxDoctors === 0,
      'Una suscripción con pago vencido se suspende aunque el plan sea el más alto'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Cupo de especialistas');
    // ---------------------------------------------------------------------
    const consultorio = await makeTenant('consultorio');
    await assertCanAddDoctor(consultorio.id); // cupo 1, va en 0
    await db.doctor.create({
      data: { tenantId: consultorio.id, name: 'Dra. Uno', specialty: 'Odontología' },
    });

    const excedido = await expectPlanLimit(() => assertCanAddDoctor(consultorio.id));
    assert(
      excedido !== null && excedido.limit === 1 && excedido.current === 1,
      'El plan Consultorio ($1,499) corta en 1 especialista, como anuncia la landing'
    );

    const inactivo = await db.doctor.create({
      data: {
        tenantId: consultorio.id,
        name: 'Dr. Baja',
        specialty: 'Ortodoncia',
        isActive: false,
      },
    });
    const trasBaja = await expectPlanLimit(() => assertCanAddDoctor(consultorio.id));
    assert(
      trasBaja !== null && trasBaja.current === 1,
      'Un especialista dado de baja no consume cupo'
    );
    await db.doctor.delete({ where: { id: inactivo.id } });

    const cadenas = await makeTenant('cadenas');
    for (let i = 0; i < 8; i += 1) {
      await db.doctor.create({
        data: { tenantId: cadenas.id, name: `Dr. ${i}`, specialty: 'General' },
      });
    }
    const sinTope = await expectPlanLimit(() => assertCanAddDoctor(cadenas.id));
    assert(sinTope === null, 'El plan Cadenas no impone tope de especialistas');

    // ---------------------------------------------------------------------
    console.log('\n▶ Canal de voz por plan');
    // ---------------------------------------------------------------------
    const sinVoz = await expectPlanLimit(() => assertCanTakeCall(consultorio.id));
    assert(
      sinVoz !== null && /no incluye telefonía/i.test(sinVoz.message),
      'El plan Consultorio no puede recibir llamadas: la landing no las incluye'
    );

    const pro = await makeTenant('clinica-pro');
    assert(
      (await expectPlanLimit(() => assertCanTakeCall(pro.id))) === null,
      'El plan Clínica Pro sí puede recibir llamadas'
    );

    // 300 minutos incluidos: se consumen 299 y debe seguir contestando.
    await recordUsage(pro.id, 'VOICE_SECONDS', 299 * 60);
    assert(
      (await expectPlanLimit(() => assertCanTakeCall(pro.id))) === null,
      'Con 299 de 300 minutos usados la clínica sigue contestando'
    );

    await recordUsage(pro.id, 'VOICE_SECONDS', 2 * 60);
    const vozAgotada = await expectPlanLimit(() => assertCanTakeCall(pro.id));
    assert(
      vozAgotada !== null && vozAgotada.limit === 300,
      'Al rebasar los 300 minutos incluidos se corta el canal de voz'
    );
    assert(
      (await getUsage(pro.id, 'VOICE_SECONDS')) === 301 * 60,
      'El consumo de voz se acumula en el contador del periodo'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Cupo de citas del mes');
    // ---------------------------------------------------------------------
    assert(
      (await expectPlanLimit(() => assertCanBookAppointment(pro.id))) === null,
      'El plan Clínica Pro no topa las citas del mes'
    );

    const doctorConsultorio = await db.doctor.findFirstOrThrow({
      where: { tenantId: consultorio.id, isActive: true },
    });
    const servicio = await db.service.create({
      data: {
        tenantId: consultorio.id,
        name: 'Limpieza',
        durationMinutes: 30,
        priceMxn: 900,
      },
    });
    const paciente = await db.patient.create({
      data: { tenantId: consultorio.id, fullName: 'Paciente Cupo', phoneE164: '+525588887777' },
    });

    // El tope real del plan son 250 citas; se baja el cupo del tenant a un
    // plan de prueba (50) para no tener que insertar 250 filas.
    await db.tenant.update({ where: { id: consultorio.id }, data: { planSlug: 'trial' } });
    const limiteTrial = PLANS.trial.limits.maxAppointmentsPerMonth!;
    const base = new Date();
    await db.appointment.createMany({
      data: Array.from({ length: limiteTrial }, (_, i) => ({
        tenantId: consultorio.id,
        patientId: paciente.id,
        doctorId: doctorConsultorio.id,
        serviceId: servicio.id,
        startTime: new Date(base.getTime() + i * 3_600_000),
        endTime: new Date(base.getTime() + i * 3_600_000 + 1_800_000),
      })),
    });

    const citasExcedidas = await expectPlanLimit(() => assertCanBookAppointment(consultorio.id));
    assert(
      citasExcedidas !== null && citasExcedidas.limit === limiteTrial,
      'Al alcanzar el cupo mensual de citas se rechaza la siguiente'
    );

    // ---------------------------------------------------------------------
    console.log('\n▶ Resumen de plan para el panel');
    // ---------------------------------------------------------------------
    const trialTenant = await makeTenant('trial', {
      subscriptionStatus: 'TRIALING',
      trialEndsAt: new Date(Date.now() + TRIAL_DURATION_DAYS * 86_400_000),
    });
    const resumen = await getPlanSummary(trialTenant.id);
    assert(
      resumen.planSlug === 'trial' &&
        resumen.trialDaysLeft === TRIAL_DURATION_DAYS &&
        !resumen.isSuspended,
      `El resumen reporta la prueba de ${TRIAL_DURATION_DAYS} días recién abierta`
    );
    assert(
      resumen.usage.doctors === 0 &&
        resumen.usage.appointments === 0 &&
        resumen.usage.voiceMinutes === 0 &&
        resumen.period === usagePeriod(),
      'El resumen arranca en cero y apunta al periodo en curso'
    );

    const resumenPro = await getPlanSummary(pro.id);
    assert(
      resumenPro.usage.voiceMinutes === 301 && resumenPro.limits.includedVoiceMinutes === 300,
      'El resumen refleja el consumo de voz real contra el cupo del plan'
    );
  } finally {
    for (const tenantId of createdTenantIds) {
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.service.deleteMany({ where: { tenantId } });
      await db.doctor.deleteMany({ where: { tenantId } });
      await db.usageCounter.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await db.$disconnect();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO PLANES: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runPlanTests().catch((error) => {
  console.error('Error en la suite de planes:', error);
  process.exit(1);
});
