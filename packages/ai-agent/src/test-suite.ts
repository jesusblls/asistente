import { normalizeMexicanPhone, formatMexicanPhoneDisplay } from './utils/phone.js';
import { mxnToCents, roundMxn } from './utils/money.js';
import { evaluateTriage } from './triage/triageEngine.js';
import { SchedulerService } from './calendar/scheduler.js';
import { OmnichannelAgent, toolDeclarations } from './agent/geminiAgent.js';
import { db } from '@asistente/database';

async function runVerificationTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 INICIANDO BATERÍA DE PRUEBAS DEL ASISTENTE OMNICANAL');
  console.log('🧪 ========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // TEST 1: Normalización de números telefónicos mexicanos (+52)
  console.log('📋 Grupo 1: Normalización de Teléfonos México (+52)');
  const p1 = normalizeMexicanPhone('55 1234 5678');
  assert(p1 === '+525512345678', 'Normaliza número local CDMX de 10 dígitos con espacios');

  const p2 = normalizeMexicanPhone('+52 1 55 9876 5432');
  assert(p2 === '+525598765432', 'Elimina prefijo legacy "1" de WhatsApp en móviles mexicanos');

  const p3 = normalizeMexicanPhone('044 55 1122 3344');
  assert(p3 === '+525511223344', 'Elimina prefijo legacy local "044" de México');

  const pDisplay = formatMexicanPhoneDisplay(p1);
  assert(pDisplay === '+52 (55) 1234-5678', `Formato visual mexicano: ${pDisplay}`);

  // TEST 2: Triaje Médico y Dental de Urgencias
  console.log('\n📋 Grupo 2: Triaje y Clasificación de Urgencias');
  const triageCritical = evaluateTriage('Tuve un accidente y tengo sangrado abundante que no para');
  assert(
    triageCritical.level === 'CRITICAL_EMERGENCY' && triageCritical.requiresImmediateHospital,
    'Detecta emergencia vital crítica y desvía al hospital / 911'
  );

  const triageDental = evaluateTriage('Tengo un dolor muy fuerte e hinchada la cara desde ayer', 8);
  assert(
    triageDental.level === 'URGENT_DENTAL' && triageDental.prioritySlotRecommended,
    'Detecta urgencia dental aguda y recomienda espacio prioritario'
  );

  const triageRoutine = evaluateTriage('Hola, quisiera información sobre el blanqueamiento dental');
  assert(triageRoutine.level === 'ROUTINE', 'Detecta consulta de rutina');

  // TEST 3: Consulta de Disponibilidad de Doctores
  console.log('\n📋 Grupo 3: Motor de Disponibilidad y Agenda');
  const tenant = await db.tenant.findUnique({ where: { slug: 'dental-polanco' } });
  if (!tenant) throw new Error('Tenant demo no encontrado en BD');

  // Usar fecha de mañana en formato YYYY-MM-DD
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const slots = await SchedulerService.getAvailableSlots({
    tenantId: tenant.id,
    targetDateStr: tomorrowStr,
    timePreference: 'any',
  });
  assert(slots.length > 0, `Genera slots libres para mañana (${slots.length} encontrados)`);

  // TEST 4: Agendamiento y Prevención de Doble Reserva (Colisión)
  console.log('\n📋 Grupo 4: Agendamiento y Detección de Conflictos');
  const service = await db.service.findFirst({ where: { tenantId: tenant.id } });
  const doctor = await db.doctor.findFirst({ where: { tenantId: tenant.id } });

  if (service && doctor && slots[0]) {
    const targetSlot = slots[0];
    const appt = await SchedulerService.bookAppointment({
      tenantId: tenant.id,
      patientFullName: 'Carlos Gómez Prueba',
      patientPhone: '+525588776655',
      doctorId: targetSlot.doctorId,
      serviceId: service.id,
      startTimeIso: targetSlot.startTimeIso,
      symptoms: 'Dolor leve al masticar',
      channelOrigin: 'WHATSAPP',
    });

    assert(appt.status === 'CONFIRMED', `Cita reservada correctamente con ID #${appt.id}`);

    // Intentar agendar en el mismo horario con el mismo doctor debe fallar por colisión
    let collisionDetected = false;
    try {
      await SchedulerService.bookAppointment({
        tenantId: tenant.id,
        patientFullName: 'Segundo Paciente Conflicto',
        patientPhone: '+525511223344',
        doctorId: targetSlot.doctorId,
        serviceId: service.id,
        startTimeIso: targetSlot.startTimeIso,
      });
    } catch (e: any) {
      collisionDetected = true;
    }
    assert(collisionDetected, 'Bloquea colisión de doble agendamiento en el mismo horario');
  }

  // TEST 5: Motor del Agente Omnicanal
  console.log('\n📋 Grupo 5: Procesamiento de Mensajes con el Agente');
  const agent = new OmnichannelAgent();

  const emergencyResponse = await agent.processMessage(
    'No puedo respirar bien y me estoy ahogando',
    {
      tenantId: tenant.id,
      patientPhone: '+525544332211',
      channel: 'WHATSAPP',
    }
  );
  assert(
    Boolean(emergencyResponse.requiresHumanHandover) && emergencyResponse.replyText.includes('911'),
    'El agente activa respuesta de emergencia médica 911 inmediata'
  );

  const pricingResponse = await agent.processMessage(
    '¿Cuánto cuesta la limpieza dental y qué costo tienen los tratamientos?',
    {
      tenantId: tenant.id,
      patientPhone: '+525544332211',
      channel: 'WHATSAPP',
    }
  );
  assert(
    pricingResponse.replyText.toLowerCase().includes('limpieza') ||
      pricingResponse.replyText.includes('$'),
    'El agente responde con cotizaciones de servicios oficiales'
  );

  // TEST 6: Selección de horario conserva el servicio solicitado
  console.log('\n📋 Grupo 6: Selección de horario y servicio solicitado');
  const blanqueamiento = await db.service.findFirst({
    where: { tenantId: tenant.id, name: { contains: 'Blanqueamiento' } },
  });

  if (blanqueamiento) {
    const offered = await agent.processMessage(
      'Hola, quisiera agendar una cita para blanqueamiento dental',
      { tenantId: tenant.id, patientPhone: '+525588776677', channel: 'WHATSAPP' }
    );
    const selected = await agent.processMessage(
      'la 1',
      { tenantId: tenant.id, patientPhone: '+525588776677', channel: 'WHATSAPP' },
      [{ role: 'model', parts: [{ text: offered.replyText }] }]
    );

    assert(
      selected.appointmentBooked?.service?.name?.includes('Blanqueamiento') === true,
      'El horario elegido agenda el servicio solicitado (Blanqueamiento), no Limpieza'
    );
  } else {
    console.log('  ⚠️ [SKIP] La clínica demo no tiene servicio de Blanqueamiento');
  }

  // TEST 7: Normalización de dinero en MXN
  console.log('\n📋 Grupo 7: Normalización de dinero (MXN)');
  assert(roundMxn(199.99999999) === 200, 'roundMxn redondea a 2 decimales (199.999… → 200)');
  assert(roundMxn(0.1 + 0.2) === 0.3, 'roundMxn corrige el error de punto flotante (0.1 + 0.2)');
  assert(roundMxn(Number.NaN) === 0, 'roundMxn convierte NaN en 0');
  assert(mxnToCents(199.999) === 20000, 'mxnToCents convierte pesos a centavos enteros');

  // TEST 8: El paciente no puede operar sobre las citas de otro paciente.
  // El modelo deriva sus argumentos del texto que escribe el paciente, así que
  // si estas herramientas aceptaran un teléfono bastaría con dictar el número
  // ajeno para leer o cancelar la cita de un tercero.
  console.log('\n📋 Grupo 8: Aislamiento entre pacientes (herramientas del agente)');
  const identityBoundTools = [
    'consultar_citas_paciente',
    'cancelar_cita_paciente',
    'confirmar_asistencia_cita',
  ];

  for (const toolName of identityBoundTools) {
    const declaration = toolDeclarations.find((tool) => tool.name === toolName);
    const properties = (declaration?.parameters?.properties ?? {}) as Record<string, unknown>;
    assert(
      declaration !== undefined && !('telefonoPaciente' in properties),
      `'${toolName}' no acepta teléfono: opera sobre quien escribe o llama`
    );
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationTests()
  .catch((err) => {
    console.error('Error fatal durante la prueba:', err);
    process.exit(1);
  })
  .finally(async () => {
    // Limpieza de datos de prueba para no contaminar la base de desarrollo.
    const testPatients = await db.patient.findMany({
      where: { phoneE164: { in: ['+525588776655', '+525588776677'] } },
      select: { id: true },
    });
    const patientIds = testPatients.map((patient) => patient.id);
    if (patientIds.length > 0) {
      await db.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
      await db.patient.deleteMany({ where: { id: { in: patientIds } } });
    }
    await db.$disconnect();
  });
