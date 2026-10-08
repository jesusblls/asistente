import { normalizeMexicanPhone, formatMexicanPhoneDisplay } from './utils/phone.js';
import { mxnToCents, roundMxn } from './utils/money.js';
import { evaluateTriage } from './triage/triageEngine.js';
import { SchedulerService } from './calendar/scheduler.js';
import {
  OmnichannelAgent,
  toolDeclarations,
  classifyConfirmIntent,
  rankFaqItems,
  composeFaqReply,
  channelLabel,
  parseOfferedSlots,
  pickOfferedOption,
  summarizeTurnMutations,
} from './agent/deepseekAgent.js';
import { db } from '@asistente/database';

// Números exclusivos de las pruebas del motor de respaldo (se limpian al final).
const FALLBACK_TEST_PHONES = ['+525500110011', '+525500110022'];

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
      auditActor: { type: 'SYSTEM', id: 'test-suite' },
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
      auditActor: { type: 'SYSTEM', id: 'test-suite' },
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

  // TEST 9: Confirmación de asistencia solo con intención afirmativa clara.
  // Antes cualquier texto con "confirmar" o "asistencia" confirmaba la cita.
  console.log('\n📋 Grupo 9: Clasificación de la intención de confirmar');
  const ctxConfirm = { hasActiveAppointment: true, lastModelMessage: '' };
  const confirmCases: Array<[string, string]> = [
    ['Sí, confirmo', 'CONFIRM'],
    ['Confirmar Asistencia', 'CONFIRM'],
    ['confirmo mi asistencia para mañana, gracias', 'CONFIRM'],
    ['Ahí estaré', 'CONFIRM'],
    ['No hay problema, confirmo', 'CONFIRM'],
    ['Confirmo, ¿necesito llevar algo?', 'CONFIRM'],
    ['Sí voy, ¿a qué hora llego?', 'CONFIRM'],
    ['confirm_abc123', 'CONFIRM'],
    ['¿Cómo confirmo?', 'QUESTION'],
    ['como confirmo mi cita', 'QUESTION'],
    ['¿Necesito confirmar asistencia?', 'QUESTION'],
    ['No puedo confirmar todavía', 'NEGATIVE'],
    ['no confirmo, tengo un pendiente', 'NEGATIVE'],
    ['no asistiré', 'NEGATIVE'],
    ['Hola, buenas tardes', 'NONE'],
    ['me pueden mandar la confirmación del pago', 'NONE'],
  ];
  for (const [text, expected] of confirmCases) {
    const got = classifyConfirmIntent(text, ctxConfirm);
    assert(got === expected, `"${text}" → ${expected} (obtuvo ${got})`);
  }
  assert(
    classifyConfirmIntent('sí', {
      hasActiveAppointment: true,
      lastModelMessage: 'Para confirmar tu asistencia solo respóndeme "Sí, confirmo"',
    }) === 'CONFIRM',
    '"sí" confirma solo cuando el asistente acaba de pedir la confirmación'
  );
  assert(
    classifyConfirmIntent('sí', {
      hasActiveAppointment: true,
      lastModelMessage: '¿Te gustaría agendar una cita?',
    }) === 'NONE',
    '"sí" a otra pregunta sobre citas NO confirma la cita existente'
  );

  // TEST 10: FAQs filtradas por la consulta y sin datos inventados.
  console.log('\n📋 Grupo 10: FAQs de la clínica (ranking y datos reales)');
  const sampleFaqs = [
    {
      question: '¿Dónde están ubicados y cuentan con estacionamiento?',
      answer: 'Av. Siempre Viva 123. Hay estacionamiento público a media cuadra.',
      category: 'Ubicación',
      keywords: 'ubicación,estacionamiento,dirección',
    },
    {
      question: '¿Qué formas de pago aceptan?',
      answer: 'Tarjeta de crédito, débito y efectivo.',
      category: 'Pagos',
      keywords: 'pago,tarjeta,efectivo',
    },
    {
      question: '¿Trabajan con aseguradoras?',
      answer: 'Emitimos factura para reembolso.',
      category: 'Seguros',
      keywords: 'seguro,aseguradora,reembolso',
    },
  ];
  assert(
    rankFaqItems(sampleFaqs, '¿Aceptan tarjeta de crédito?')[0]?.category === 'Pagos',
    'consultar_faq_clinica prioriza la FAQ de pagos ante "¿aceptan tarjeta?"'
  );
  assert(
    rankFaqItems(sampleFaqs, '¿Tienen estacionamiento?')[0]?.category === 'Ubicación',
    'consultar_faq_clinica prioriza la FAQ de estacionamiento'
  );
  assert(
    rankFaqItems(sampleFaqs, '¿Hacen ortodoncia invisible?').length === 0,
    'Sin coincidencias, consultar_faq_clinica no devuelve FAQs ajenas a la pregunta'
  );
  const noFaqReply = composeFaqReply({ query: '¿Tienen estacionamiento?', faqs: [], address: 'Calle 1' });
  assert(
    !/valet|gnp|metlife|msi/i.test(noFaqReply) && noFaqReply.includes('recepción'),
    'Sin FAQ de estacionamiento no inventa valet ni aseguradoras: ofrece recepción'
  );
  const parkingReply = composeFaqReply({ query: '¿Tienen estacionamiento?', faqs: sampleFaqs, address: 'Calle 1' });
  assert(
    parkingReply.includes('estacionamiento público') && !parkingReply.includes('Tarjeta de crédito'),
    'Con FAQ responde solo con la información oficial relevante'
  );

  // TEST 11: Utilidades de canal, selección de horario y resumen seguro.
  console.log('\n📋 Grupo 11: Canal, selección de horario y resumen de acciones');
  assert(channelLabel('PHONE_CALL') === 'llamada telefónica', 'El canal de voz se nombra "llamada telefónica"');
  const offerText =
    'estos horarios:\n\n1️⃣ *viernes, 9 de octubre, 9:00 am* con dra. sofía silva (odontología)\n2️⃣ *viernes, 9 de octubre, 10:50 am* con dra. sofía silva (odontología)';
  const offered = parseOfferedSlots(offerText);
  assert(offered.length === 2 && offered[1].doctorName === 'dra. sofía silva', 'Se leen las opciones ofrecidas');
  assert(pickOfferedOption('la 2', offered) === 2, '"la 2" elige la opción 2');
  assert(pickOfferedOption('segunda', offered) === 2, '"segunda" elige la opción 2');
  assert(pickOfferedOption('a las 10:50', offered) === 2, '"a las 10:50" elige por hora');
  assert(pickOfferedOption('la 3', offered) === null, 'Una opción que no se ofreció no se elige');
  assert(pickOfferedOption('a las dos de la tarde', offered) === null, '"a las dos" es una hora, no la opción 2');
  assert(pickOfferedOption('el 1 de noviembre', offered) === null, '"el 1 de noviembre" es una fecha, no la opción 1');
  assert(
    summarizeTurnMutations(
      [{ kind: 'BOOKED', when: new Date(), doctor: 'Dra. X', service: 'Limpieza' }],
      'America/Mexico_City'
    ).includes('quedó agendada'),
    'El resumen seguro informa la cita ya agendada'
  );

  // Pruebas de flujo contra la base: siempre por el motor de respaldo.
  const savedDeepseekKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const fallbackAgent = new OmnichannelAgent();
  const limpieza =
    (await db.service.findFirst({ where: { tenantId: tenant.id, isActive: true, name: { contains: 'Limpieza' } } })) ||
    (await db.service.findFirst({ where: { tenantId: tenant.id, isActive: true } }));

  async function nextFreeSlot(serviceId: string) {
    for (let offset = 1; offset <= 14; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d);
      const daySlots = await SchedulerService.getAvailableSlots({ tenantId: tenant!.id, targetDateStr: dateStr, serviceId });
      if (daySlots.length > 0) return daySlots[0];
    }
    return null;
  }

  const activeCount = (phone: string) =>
    db.appointment.count({
      where: { tenantId: tenant!.id, status: { not: 'CANCELLED' }, patient: { tenantId: tenant!.id, phoneE164: phone } },
    });

  // TEST 12: Si DeepSeek falla después de agendar, el respaldo no repite la acción.
  console.log('\n📋 Grupo 12: Sin doble acción cuando DeepSeek falla a mitad de turno');
  const doublePhone = FALLBACK_TEST_PHONES[0];
  const doubleSlot = limpieza ? await nextFreeSlot(limpieza.id) : null;
  if (limpieza && doubleSlot) {
    const history = [
      {
        role: 'model' as const,
        parts: [
          {
            text: `Para *${limpieza.name}* tenemos estos horarios disponibles:\n\n1️⃣ *${doubleSlot.displayDate}, ${doubleSlot.displayTime}* con ${doubleSlot.doctorName} (${doubleSlot.specialty})`,
          },
        ],
      },
    ];
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls > 1) throw new Error('DeepSeek caído a mitad de turno (simulado)');
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'agendar_cita',
                      arguments: JSON.stringify({
                        nombrePaciente: 'Prueba Doble Acción',
                        servicioId: limpieza.id,
                        doctorId: doubleSlot.doctorId,
                        horarioInicioIso: doubleSlot.startTimeIso,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;
    process.env.DEEPSEEK_API_KEY = 'test-key-simulada';
    const deepseekAgent = new OmnichannelAgent();
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const res = await deepseekAgent.processMessage(
        'la 1',
        { tenantId: tenant.id, patientPhone: doublePhone, channel: 'WHATSAPP' },
        history
      );
      assert((await activeCount(doublePhone)) === 1, 'Solo existe UNA cita tras la falla (no se agendó dos veces)');
      assert(
        res.replyText.includes('quedó agendada') && Boolean(res.appointmentBooked),
        'La respuesta resume la cita que sí quedó agendada'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  } else {
    console.log('  ⚠️ [SKIP] Sin servicio u horario libre para la prueba de doble acción');
  }

  // TEST 13: Confirmación por voz, preguntas y negativas no confirman.
  console.log('\n📋 Grupo 13: Flujo de confirmación del motor de respaldo');
  const flowPhone = FALLBACK_TEST_PHONES[1];
  const flowSlot = limpieza ? await nextFreeSlot(limpieza.id) : null;
  if (limpieza && flowSlot) {
    const original = await SchedulerService.bookAppointment({
      auditActor: { type: 'SYSTEM', id: 'test-suite' },
      tenantId: tenant.id,
      patientFullName: 'Paciente Flujo Respaldo',
      patientPhone: flowPhone,
      doctorId: flowSlot.doctorId,
      serviceId: limpieza.id,
      startTimeIso: flowSlot.startTimeIso,
    });
    await db.appointment.update({ where: { id: original.id }, data: { status: 'PENDING' } });
    const voiceCtx = { tenantId: tenant.id, patientPhone: flowPhone, channel: 'PHONE_CALL' as const };
    const statusOf = async () => (await db.appointment.findUnique({ where: { id: original.id } }))!;

    await fallbackAgent.processMessage('¿Cómo confirmo mi cita?', voiceCtx);
    assert((await statusOf()).status === 'PENDING', '"¿Cómo confirmo mi cita?" no confirma la cita');
    await fallbackAgent.processMessage('No puedo confirmar todavía', voiceCtx);
    assert((await statusOf()).status === 'PENDING', '"No puedo confirmar todavía" no confirma la cita');
    await fallbackAgent.processMessage('No voy a poder confirmar todavía', voiceCtx);
    assert((await statusOf()).status === 'PENDING', '"No voy a poder confirmar todavía" ni confirma ni cancela');

    const confirmed = await fallbackAgent.processMessage('Sí, confirmo', voiceCtx);
    const afterConfirm = await statusOf();
    assert(afterConfirm.status === 'CONFIRMED', '"Sí, confirmo" confirma la cita');
    assert(
      (afterConfirm.notes || '').includes('vía llamada telefónica') && !(afterConfirm.notes || '').includes('WhatsApp'),
      'La nota de confirmación registra el canal real (llamada), no WhatsApp'
    );
    assert(!/valet|metlife|gnp/i.test(confirmed.replyText), 'La confirmación no inventa valet ni aseguradoras');

    // TEST 14: Reagendar cancela la cita anterior y agenda la nueva a la vez.
    console.log('\n📋 Grupo 14: Reagendado atómico en el motor de respaldo');
    const waCtx = { tenantId: tenant.id, patientPhone: flowPhone, channel: 'WHATSAPP' as const };
    // Anticipo ya pagado: debe viajar a la cita nueva, no volver a cobrarse.
    await db.appointment.update({ where: { id: original.id }, data: { paymentStatus: 'DEPOSIT_PAID' } });
    const offer = await fallbackAgent.processMessage('Reagendar Cita', waCtx);
    assert(parseOfferedSlots(offer.replyText.toLowerCase()).length > 0, 'Reagendar ofrece horarios reales con fecha');
    const moved = await fallbackAgent.processMessage('1', waCtx, [
      { role: 'model', parts: [{ text: offer.replyText }] },
    ]);
    const oldAfter = await statusOf();
    assert(oldAfter.status === 'CANCELLED' && oldAfter.slotKey === null, 'La cita anterior queda cancelada y libera su horario');
    assert(
      Boolean(moved.appointmentBooked) && moved.appointmentBooked!.id !== original.id,
      'Se crea la cita en el nuevo horario'
    );
    assert((await activeCount(flowPhone)) === 1, 'El paciente queda con una sola cita activa');
    assert(
      moved.appointmentBooked?.paymentStatus === 'DEPOSIT_PAID',
      'El anticipo pagado se conserva en la cita reagendada'
    );
  } else {
    console.log('  ⚠️ [SKIP] Sin servicio u horario libre para la prueba de confirmación');
  }

  if (savedDeepseekKey !== undefined) process.env.DEEPSEEK_API_KEY = savedDeepseekKey;

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
      where: { phoneE164: { in: ['+525588776655', '+525588776677', ...FALLBACK_TEST_PHONES] } },
      select: { id: true },
    });
    const patientIds = testPatients.map((patient) => patient.id);
    if (patientIds.length > 0) {
      await db.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
      await db.patient.deleteMany({ where: { id: { in: patientIds } } });
    }
    await db.$disconnect();
  });
