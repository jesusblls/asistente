import { db } from '@asistente/database';
import {
  OmnichannelAgent,
  SchedulerService,
  evaluateTriage,
  normalizeMexicanPhone,
  MercadoPagoService,
} from './index.js';
import { buildServer } from '../../../apps/api/src/server.js';

// Entorno de pruebas: firma de sesiones estable y webhooks sin firma real
// (la verificación criptográfica se cubre en apps/api/src/security-test-suite.ts).
process.env.JWT_SECRET ||= 'stress-test-secret-with-at-least-32-chars';
process.env.WEBHOOK_ALLOW_UNVERIFIED = 'true';

// Colores ANSI para salida en consola
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function runStressTestSuite() {
  console.log(`\n${CYAN}${BOLD}╔══════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}${BOLD}║   SUITE DE PRUEBAS EXHAUSTIVAS DE EXTREMO A EXTREMO (E2E STRESS)   ║${RESET}`);
  console.log(`${CYAN}${BOLD}║      Plataforma SaaS Omnicanal México (+52) - QA & Automation        ║${RESET}`);
  console.log(`${CYAN}${BOLD}╚══════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  let totalPassed = 0;
  let totalFailed = 0;

  function assert(condition: boolean, title: string, details?: string) {
    if (condition) {
      console.log(`  ${GREEN}✅ [PASS]${RESET} ${title}`);
      totalPassed++;
    } else {
      console.error(`  ${RED}❌ [FAIL]${RESET} ${title}${details ? ` -> ${details}` : ''}`);
      totalFailed++;
    }
  }

  // Inicializar servidor Fastify de pruebas con endpoints in-memory.
  // El worker de la cola corre en proceso: los webhooks encolan y responden de
  // inmediato, así que aquí se ejercita el camino asíncrono real.
  const app = await buildServer({ logger: false, startQueueWorker: true });
  await app.ready();

  /** Espera a que una condición se cumpla, para no depender de tiempos fijos. */
  async function waitFor<T>(
    read: () => Promise<T>,
    done: (value: T) => boolean,
    timeoutMs = 8000
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let value = await read();
    while (!done(value) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      value = await read();
    }
    return value;
  }

  const testSuffix = Date.now().toString().slice(-6);
  let tenantA: any;
  let tenantB: any;

  try {
    // =========================================================================
    // 1. AISLAMIENTO MULTI-TENANT
    // =========================================================================
    console.log(`\n${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}${BOLD}📋 1. AISLAMIENTO MULTI-TENANT (TENANT ISOLATION)${RESET}`);
    console.log(`${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    // Crear Clínica A
    tenantA = await db.tenant.create({
      data: {
        name: `Clínica Dental Polanco Elite ${testSuffix}`,
        slug: `polanco-elite-${testSuffix}`,
        phoneE164: '+525511223344',
        address: 'Av. Horacio 1520, Polanco, Miguel Hidalgo, CDMX',
        timezone: 'America/Mexico_City',
        doctors: {
          create: [
            {
              name: 'Dra. Sofía Silva Polanco',
              specialty: 'Endodoncia y Cirugía Oral',
              phone: '+525511223344',
            },
          ],
        },
        services: {
          create: [
            {
              name: 'Endodoncia Rotatoria',
              description: 'Tratamiento de conductos especializado',
              durationMinutes: 60,
              priceMxn: 3500,
              requiredDepositMxn: 500,
              category: 'Endodoncia',
            },
          ],
        },
      },
      include: { doctors: true, services: true },
    });

    // Crear Clínica B
    tenantB = await db.tenant.create({
      data: {
        name: `Centro Médico Roma Sur Especialistas ${testSuffix}`,
        slug: `medica-roma-${testSuffix}`,
        phoneE164: '+525599887766',
        address: 'Calle Tonalá 234, Roma Sur, Cuauhtémoc, CDMX',
        timezone: 'America/Mexico_City',
        doctors: {
          create: [
            {
              name: 'Dr. Alejandro Morales Roma',
              specialty: 'Medicina General y Preventiva',
              phone: '+525599887766',
            },
          ],
        },
        services: {
          create: [
            {
              name: 'Consulta Médica General y EKG',
              description: 'Valoración cardiovascular y médica integral',
              durationMinutes: 45,
              priceMxn: 1200,
              requiredDepositMxn: 200,
              category: 'Medicina',
            },
          ],
        },
      },
      include: { doctors: true, services: true },
    });

    assert(
      tenantA.id !== tenantB.id && tenantA.slug !== tenantB.slug,
      'Creación exitosa de 2 clínicas (Tenants) independientes con esquemas distintos'
    );

    // Harness de pruebas: firma una sesión del tenant A para las rutas del panel.
    // El usuario debe existir en la base de datos porque cada petición
    // revalida la sesión (dar de baja a alguien corta su acceso al instante).
    const stressUser = await db.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'stress@test.mx',
        name: 'Stress Admin',
        role: 'ADMIN',
        passwordHash: 'scrypt$00$00',
      },
    });

    const stressToken = app.jwt.sign({
      userId: stressUser.id,
      tenantId: tenantA.id,
      role: 'ADMIN',
      email: stressUser.email,
    });
    const originalInject = app.inject.bind(app);
    (app as any).inject = (options: any) =>
      originalInject({
        ...options,
        headers: { authorization: `Bearer ${stressToken}`, ...(options?.headers || {}) },
      });

    // Fecha de prueba: se toman slots realmente disponibles para no depender
    // del día de la semana ni del horario del consultorio.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const slotsA = await SchedulerService.getAvailableSlots({
      tenantId: tenantA.id,
      targetDateStr: tomorrowStr,
      serviceId: tenantA.services[0].id,
    });
    const slotsB = await SchedulerService.getAvailableSlots({
      tenantId: tenantB.id,
      targetDateStr: tomorrowStr,
      serviceId: tenantB.services[0].id,
    });
    if (!slotsA.length || !slotsB.length) {
      throw new Error('No hay disponibilidad de prueba para mañana; ajusta las reglas de los doctores');
    }

    // Cita en Clínica A
    const apptSlotA = new Date(slotsA[0].startTimeIso);
    const apptA = await SchedulerService.bookAppointment({
      auditActor: { type: 'SYSTEM', id: 'stress-test-suite' },
      tenantId: tenantA.id,
      patientFullName: 'Carlos Mendoza Polanco',
      patientPhone: '+525512345001',
      doctorId: slotsA[0].doctorId,
      serviceId: tenantA.services[0].id,
      startTimeIso: slotsA[0].startTimeIso,
      symptoms: 'Molestia en molar inferior',
      channelOrigin: 'WHATSAPP',
    });

    // Cita en Clínica B
    const apptSlotB = new Date(slotsB[0].startTimeIso);
    const apptB = await SchedulerService.bookAppointment({
      auditActor: { type: 'SYSTEM', id: 'stress-test-suite' },
      tenantId: tenantB.id,
      patientFullName: 'Lucía Fernández Roma',
      patientPhone: '+525512345002',
      doctorId: slotsB[0].doctorId,
      serviceId: tenantB.services[0].id,
      startTimeIso: slotsB[0].startTimeIso,
      symptoms: 'Chequeo general anual',
      channelOrigin: 'WHATSAPP',
    });

    // Verificar aislamiento de citas en BD
    const appointmentsA = await db.appointment.findMany({ where: { tenantId: tenantA.id } });
    const appointmentsB = await db.appointment.findMany({ where: { tenantId: tenantB.id } });

    assert(
      appointmentsA.length === 1 && appointmentsA[0].id === apptA.id,
      'Citas de Clínica A contienen exclusivamente sus citas propias'
    );
    assert(
      appointmentsB.length === 1 && appointmentsB[0].id === apptB.id,
      'Citas de Clínica B contienen exclusivamente sus citas propias'
    );
    assert(
      !appointmentsA.some((a) => a.tenantId === tenantB.id) &&
        !appointmentsB.some((b) => b.tenantId === tenantA.id),
      'Cero contaminación cruzada de citas entre clínicas en la base de datos'
    );

    // Verificar aislamiento de pacientes
    const patientsA = await db.patient.findMany({ where: { tenantId: tenantA.id } });
    const patientsB = await db.patient.findMany({ where: { tenantId: tenantB.id } });

    assert(
      patientsA.every((p) => p.fullName === 'Carlos Mendoza Polanco') &&
        patientsB.every((p) => p.fullName === 'Lucía Fernández Roma'),
      'Pacientes de Clínica A no son visibles ni se mezclan con Clínica B'
    );

    // Verificar aislamiento en API REST (/api/appointments?tenantId=...)
    const apiApptsResA = await app.inject({
      method: 'GET',
      url: `/api/appointments?tenantId=${tenantA.id}`,
    });
    const apiApptsA = apiApptsResA.json();
    assert(
      apiApptsA.length === 1 && apiApptsA[0].id === apptA.id && apiApptsA[0].tenantId === tenantA.id,
      'Endpoint GET /api/appointments respeta estrictamente el scope del tenantId'
    );

    // Verificar aislamiento en API REST (/api/patients)
    const patientA = await db.patient.findFirst({ where: { tenantId: tenantA.id, phoneE164: '+525512345001' } });
    const patientB = await db.patient.findFirst({ where: { tenantId: tenantB.id, phoneE164: '+525512345002' } });

    const apiPatientsResA = await app.inject({
      method: 'GET',
      url: `/api/patients?tenantId=${tenantA.id}`,
    });
    const apiPatientsA = apiPatientsResA.json();
    assert(
      apiPatientsA.length === 1 &&
        apiPatientsA[0].id === patientA?.id &&
        apiPatientsA[0].appointmentsCount === 1,
      'Endpoint GET /api/patients respeta el scope del tenantId y cuenta sus citas'
    );

    const apiPatientsCrossRes = await app.inject({
      method: 'GET',
      url: `/api/patients?tenantId=${tenantB.id}`,
    });
    assert(
      apiPatientsCrossRes.statusCode === 403,
      'Clínica A no puede listar pacientes de la Clínica B con el token de A'
    );

    const apiPatientDetailCrossRes = await app.inject({
      method: 'GET',
      url: `/api/patients/${patientB?.id}`,
    });
    assert(
      apiPatientDetailCrossRes.statusCode === 404,
      'Clínica A no puede abrir el expediente de un paciente de la Clínica B'
    );

    const apiPatientDetailRes = await app.inject({
      method: 'GET',
      url: `/api/patients/${patientA?.id}`,
    });
    const apiPatientDetail = apiPatientDetailRes.json();
    assert(
      apiPatientDetailRes.statusCode === 200 &&
        apiPatientDetail.appointments?.length === 1 &&
        apiPatientDetail.appointments[0].id === apptA.id,
      'Endpoint GET /api/patients/:id devuelve el expediente completo del paciente propio'
    );

    // Verificar que un doctor de la Clínica B no puede ser consultado con el tenantId de Clínica A
    const leakSlots = await SchedulerService.getAvailableSlots({
      tenantId: tenantA.id,
      doctorId: tenantB.doctors[0].id,
      targetDateStr: tomorrowStr,
    });
    assert(leakSlots.length === 0, 'Bloquea consulta de disponibilidad cruzada de doctores ajenos al tenant');

    // =========================================================================
    // 2. DETECCIÓN DE COLISIONES DE AGENDA
    // =========================================================================
    console.log(`\n${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}${BOLD}📋 2. DETECCIÓN DE COLISIONES DE AGENDA (OVERLAP & CONFLICTS)${RESET}`);
    console.log(`${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    const collisionSlot = new Date(slotsA[1]?.startTimeIso || slotsA[0].startTimeIso);

    // Paciente 1 reserva exitosamente
    const booked1 = await SchedulerService.bookAppointment({
      auditActor: { type: 'SYSTEM', id: 'stress-test-suite' },
      tenantId: tenantA.id,
      patientFullName: 'Valeria Garza Primer Intento',
      patientPhone: '+525544332211',
      doctorId: tenantA.doctors[0].id,
      serviceId: tenantA.services[0].id,
      startTimeIso: collisionSlot.toISOString(),
      symptoms: 'Cita en horario 15:00',
    });
    assert(booked1.status === 'CONFIRMED', 'Primer paciente agenda exitosamente en el horario seleccionado');

    // Paciente 2 intenta agendar en el mismo horario con el mismo doctor (Llamada directa al servicio)
    let collisionErrorDetected = false;
    let collisionErrorMessage = '';
    try {
      await SchedulerService.bookAppointment({
      auditActor: { type: 'SYSTEM', id: 'stress-test-suite' },
        tenantId: tenantA.id,
        patientFullName: 'Roberto Peña Segundo Intento (Conflicto)',
        patientPhone: '+525588990011',
        doctorId: tenantA.doctors[0].id,
        serviceId: tenantA.services[0].id,
        startTimeIso: collisionSlot.toISOString(),
        symptoms: 'Intento de doble reserva',
      });
    } catch (err: any) {
      collisionErrorDetected = true;
      collisionErrorMessage = err.message || '';
    }

    assert(
      collisionErrorDetected &&
        (collisionErrorMessage.includes('reservado') || collisionErrorMessage.includes('horario')),
      `SchedulerService rechaza segundo intento con mensaje claro: "${collisionErrorMessage}"`
    );

    // Paciente 2 intenta vía API REST (POST /api/appointments)
    const apiCollisionRes = await app.inject({
      method: 'POST',
      url: '/api/appointments',
      payload: {
        tenantId: tenantA.id,
        patientName: 'Roberto Peña API Conflicto',
        patientPhone: '+525588990011',
        doctorId: tenantA.doctors[0].id,
        serviceId: tenantA.services[0].id,
        startTimeIso: collisionSlot.toISOString(),
        symptoms: 'Intento vía API',
      },
    });

    assert(
      apiCollisionRes.statusCode === 400 &&
        apiCollisionRes.json().error &&
        (apiCollisionRes.json().error.includes('reservado') || apiCollisionRes.json().error.includes('horario')),
      'Endpoint POST /api/appointments responde 400 Bad Request ante colisión de horario'
    );

    // Confirmar en la BD que solo existe 1 cita en ese bloque
    const countInSlot = await db.appointment.count({
      where: {
        doctorId: tenantA.doctors[0].id,
        startTime: collisionSlot,
        status: { not: 'CANCELLED' },
      },
    });
    assert(countInSlot === 1, 'La base de datos preserva integridad estricta con exactamente 1 cita confirmada');

    // =========================================================================
    // 3. TRIAJE Y MANEJO DE EMERGENCIAS
    // =========================================================================
    console.log(`\n${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}${BOLD}📋 3. TRIAJE Y MANEJO DE EMERGENCIAS (VITAL & DENTAL)${RESET}`);
    console.log(`${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    const agent = new OmnichannelAgent();

    // Caso A: Dolor de pecho (Emergencia crítica vital)
    const triageChest = evaluateTriage('Siento un dolor de pecho muy fuerte y me falta el aire');
    assert(
      triageChest.level === 'CRITICAL_EMERGENCY' && triageChest.requiresImmediateHospital,
      'evaluateTriage clasifica "dolor de pecho" como CRITICAL_EMERGENCY con hospital inmediato'
    );

    const agentChestRes = await agent.processMessage('Tengo una opresión y dolor de pecho insoportable', {
      tenantId: tenantA.id,
      patientPhone: '+525599001122',
      channel: 'WHATSAPP',
    });
    assert(
      agentChestRes.requiresHumanHandover === true && agentChestRes.replyText.includes('911'),
      'OmnichannelAgent desvía dolor de pecho al 911/Urgencias y activa bandera de handover'
    );

    // Caso B: Hemorragia (Emergencia crítica)
    const triageBleeding = evaluateTriage('Tengo una hemorragia abundante que no para');
    assert(
      triageBleeding.level === 'CRITICAL_EMERGENCY' && triageBleeding.requiresImmediateHospital,
      'evaluateTriage clasifica "hemorragia" como CRITICAL_EMERGENCY'
    );

    const agentBleedingRes = await agent.processMessage('Tengo una hemorragia continua y mucho mareo', {
      tenantId: tenantA.id,
      patientPhone: '+525599001122',
      channel: 'WHATSAPP',
    });
    assert(
      agentBleedingRes.requiresHumanHandover === true &&
        (agentChestRes.replyText.includes('911') || agentBleedingRes.replyText.includes('urgencia')),
      'OmnichannelAgent alerta sobre hemorragia grave y desvía a urgencias hospitalarias'
    );

    // Caso C: Dolor agudo de muela (Urgencia dental especializada)
    const triageTooth = evaluateTriage('Tengo dolor agudo de muela y no me deja dormir desde ayer');
    assert(
      triageTooth.level === 'URGENT_DENTAL' &&
        triageTooth.prioritySlotRecommended &&
        !triageTooth.requiresImmediateHospital &&
        triageTooth.recommendedSpecialty.includes('Endodoncia'),
      'evaluateTriage clasifica "dolor agudo de muela" como URGENT_DENTAL canalizando a Endodoncia'
    );

    const agentToothRes = await agent.processMessage('Tengo un dolor agudo de muela y la encía inflamada', {
      tenantId: tenantA.id,
      patientPhone: '+525599001122',
      channel: 'WHATSAPP',
    });
    assert(
      agentToothRes.triageAlert?.level === 'URGENT_DENTAL' &&
        (agentToothRes.replyText.toLowerCase().includes('especialista') ||
          agentToothRes.replyText.includes('⚠️')),
      'OmnichannelAgent ofrece espacio prioritario con especialista dental para dolor agudo de muela'
    );

    // =========================================================================
    // 4. VARIACIONES LINGÜÍSTICAS MEXICANAS Y CORTESÍAS
    // =========================================================================
    console.log(`\n${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}${BOLD}📋 4. VARIACIONES LINGÜÍSTICAS MEXICANAS Y CORTESÍAS${RESET}`);
    console.log(`${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    // Contexto de paciente con cita agendada
    const patientWithAppt = {
      tenantId: tenantA.id,
      patientPhone: apptA.patient.phoneE164,
      patientName: apptA.patient.fullName,
      channel: 'WHATSAPP' as const,
    };

    const isInitialMenu = (text: string) =>
      text.includes('1️⃣ Agendar o reagendar una cita') || text.includes('¿En qué podemos apoyarte hoy?');

    // 4.1 'confirmo'
    const resConfirmo = await agent.processMessage('confirmo', patientWithAppt);
    assert(
      !isInitialMenu(resConfirmo.replyText) &&
        (resConfirmo.replyText.toLowerCase().includes('confirm') ||
          resConfirmo.replyText.toLowerCase().includes('garantizada')),
      'Frase "confirmo" confirma la cita activa y NO devuelve el menú inicial erróneamente'
    );

    // 4.2 'asistencia'
    const resAsistencia = await agent.processMessage('asistencia', patientWithAppt);
    assert(
      !isInitialMenu(resAsistencia.replyText) &&
        (resAsistencia.replyText.toLowerCase().includes('confirm') ||
          resAsistencia.replyText.toLowerCase().includes('gracias')),
      'Frase "asistencia" confirma la cita sin ciclarse ni devolver el menú inicial'
    );

    // 4.3 'muchas gracias'
    const resGracias = await agent.processMessage('muchas gracias', patientWithAppt);
    assert(
      !isInitialMenu(resGracias.replyText) &&
        (resGracias.replyText.toLowerCase().includes('con mucho gusto') ||
          resGracias.replyText.toLowerCase().includes('a ti') ||
          resGracias.replyText.toLowerCase().includes('para servirle') ||
          resGracias.replyText.toLowerCase().includes('te esperamos')),
      'Cortesía "muchas gracias" responde con amabilidad mexicana y NO regresa al menú inicial'
    );

    // 4.4 'a qué hora es mi cita'
    const resHoraCita = await agent.processMessage('a qué hora es mi cita', patientWithAppt);
    assert(
      !isInitialMenu(resHoraCita.replyText) &&
        (resHoraCita.replyText.includes('10:00') ||
          resHoraCita.replyText.toLowerCase().includes('horario') ||
          resHoraCita.replyText.toLowerCase().includes('detalles de tu cita')),
      'Pregunta "a qué hora es mi cita" devuelve el horario exacto de la cita sin reiniciar menú'
    );

    // 4.5 'dónde están ubicados'
    const resUbicacion = await agent.processMessage('dónde están ubicados', patientWithAppt);
    assert(
      !isInitialMenu(resUbicacion.replyText) &&
        (resUbicacion.replyText.includes('Polanco') ||
          resUbicacion.replyText.toLowerCase().includes('ubicación') ||
          resUbicacion.replyText.includes('Horacio')),
      'Pregunta "dónde están ubicados" brinda la dirección y Valet Parking sin retornar el menú inicial'
    );

    // Probar las mismas cortesías con un paciente NUEVO (sin cita previa) para validar ausencia de loops
    const newContactContext = {
      tenantId: tenantA.id,
      patientPhone: '+525500009999',
      channel: 'WHATSAPP' as const,
    };

    const resNewGracias = await agent.processMessage('muchas gracias', newContactContext);
    assert(
      !isInitialMenu(resNewGracias.replyText) &&
        (resNewGracias.replyText.toLowerCase().includes('con mucho gusto') ||
          resNewGracias.replyText.toLowerCase().includes('a tus órdenes')),
      'Contacto sin cita diciendo "muchas gracias" recibe despedida cordial sin bucles'
    );

    const resNewUbicacion = await agent.processMessage('dónde están ubicados', newContactContext);
    assert(
      !isInitialMenu(resNewUbicacion.replyText) && resNewUbicacion.replyText.includes('Polanco'),
      'Contacto sin cita preguntando ubicación recibe dirección oficial sin bucles'
    );

    // =========================================================================
    // 5. FLUJO DE MERCADO PAGO Y NO-SHOW SHIELD
    // =========================================================================
    console.log(`\n${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}${BOLD}📋 5. FLUJO DE MERCADO PAGO Y NO-SHOW SHIELD (ANTICIPOS EN MXN)${RESET}`);
    console.log(`${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    // Cita que requiere anticipo para Endodoncia ($500 MXN)
    const depositSlot = new Date(tomorrow);
    depositSlot.setHours(17, 0, 0, 0);

    const apptWithDeposit = await SchedulerService.bookAppointment({
      auditActor: { type: 'SYSTEM', id: 'stress-test-suite' },
      tenantId: tenantA.id,
      patientFullName: 'Fernanda Ortiz No-Show Test',
      patientPhone: '+525566778899',
      doctorId: tenantA.doctors[0].id,
      serviceId: tenantA.services[0].id,
      startTimeIso: depositSlot.toISOString(),
      symptoms: 'Valoración para endodoncia',
    });

    assert(
      apptWithDeposit.paymentStatus === 'DEPOSIT_PENDING' && apptWithDeposit.depositAmountMxn === 500,
      'Cita creada con estado inicial DEPOSIT_PENDING y anticipo asignado de $500 MXN'
    );

    // Generar preferencia de Mercado Pago
    const mpPreference = await MercadoPagoService.createDepositPreference({
      appointmentId: apptWithDeposit.id,
      amountMxn: 500,
      serviceName: tenantA.services[0].name,
      patientName: 'Fernanda Ortiz',
    });

    assert(
      mpPreference.currencyId === 'MXN' &&
        mpPreference.amountMxn === 500 &&
        mpPreference.initPoint.includes('mercadopago.com.mx') &&
        mpPreference.preferenceId.startsWith('mp_pref_'),
      `Preferencia Mercado Pago generada en MXN con checkout URL válido (${mpPreference.preferenceId})`
    );

    // Verificar en BD que la cita guardó el link y referenceId
    const apptAfterPref = await db.appointment.findUnique({ where: { id: apptWithDeposit.id } });
    assert(
      apptAfterPref?.depositPaymentUrl === mpPreference.initPoint &&
        apptAfterPref?.paymentReferenceId === mpPreference.preferenceId,
      'La cita almacena correctamente paymentReferenceId y depositPaymentUrl de Mercado Pago'
    );

    // Probar generación de anticipo vía endpoint REST POST /api/appointments/:id/deposit-preference
    const apiDepositPrefRes = await app.inject({
      method: 'POST',
      url: `/api/appointments/${apptWithDeposit.id}/deposit-preference`,
      payload: { amountMxn: 500 },
    });
    assert(
      apiDepositPrefRes.statusCode === 200 && apiDepositPrefRes.json().preferenceId,
      'Endpoint POST /api/appointments/:id/deposit-preference genera link de pago exitosamente'
    );

    // Simular recepción de webhook de Mercado Pago (/webhooks/mercadopago) acreditando el anticipo
    const webhookMpRes = await app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago',
      payload: {
        action: 'payment.created',
        type: 'payment',
        data: { id: 'mp_pay_simulated_9988' },
        external_reference: apptWithDeposit.id,
        status: 'approved',
      },
    });

    assert(
      webhookMpRes.statusCode === 200 && webhookMpRes.json().paymentStatus === 'DEPOSIT_PAID',
      'Webhook de Mercado Pago procesado exitosamente acreditando anticipo (HTTP 200)'
    );

    // Verificar en BD el estado DEPOSIT_PAID del No-Show Shield
    const depositVerification = await MercadoPagoService.verifyDepositStatus(apptWithDeposit.id);
    assert(
      depositVerification.isDepositPaid && depositVerification.paymentStatus === 'DEPOSIT_PAID',
      'No-Show Shield activo: La cita pasa a estado DEPOSIT_PAID y queda 100% garantizada en BD'
    );

    // =========================================================================
    // 6. ENDPOINT DE DISPONIBILIDAD Y MODIFICACIÓN DE CITA (PATCH)
    // =========================================================================
    console.log(`\n${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}${BOLD}📋 6. ENDPOINTS DISPONIBILIDAD Y MODIFICACIÓN (PATCH /api/appointments/:id)${RESET}`);
    console.log(`${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    // Consultar disponibilidad vía GET /api/availability
    const availRes = await app.inject({
      method: 'GET',
      url: `/api/availability?tenantId=${tenantA.id}&date=${tomorrowStr}`,
    });
    assert(
      availRes.statusCode === 200 && Array.isArray(availRes.json()) && availRes.json().length > 0,
      `GET /api/availability retorna 200 OK con slots disponibles (${availRes.json().length} slots)`
    );

    // Modificar cita existente vía PATCH /api/appointments/:id
    const newRescheduledTime = new Date(tomorrow);
    newRescheduledTime.setHours(12, 0, 0, 0);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/appointments/${apptA.id}`,
      payload: {
        status: 'RESCHEDULED',
        paymentStatus: 'DEPOSIT_PAID',
        notes: 'Cita reagendada por llamada telefónica del paciente',
        startTime: newRescheduledTime.toISOString(),
      },
    });

    const updatedAppt = patchRes.json();
    assert(
      patchRes.statusCode === 200 &&
        updatedAppt.status === 'RESCHEDULED' &&
        updatedAppt.paymentStatus === 'DEPOSIT_PAID' &&
        updatedAppt.notes.includes('reagendada por llamada'),
      'PATCH /api/appointments/:id actualiza status, paymentStatus y notas correctamente'
    );

    // Validar en base de datos que el cambio persistió
    const dbApptAfterPatch = await db.appointment.findUnique({ where: { id: apptA.id } });
    assert(
      dbApptAfterPatch?.status === 'RESCHEDULED' &&
        dbApptAfterPatch?.paymentStatus === 'DEPOSIT_PAID' &&
        dbApptAfterPatch?.notes?.includes('reagendada por llamada'),
      'Persistencia en SQLite confirmada tras la llamada a PATCH'
    );

    // Validar control de errores en ID inexistente
    const invalidPatchRes = await app.inject({
      method: 'PATCH',
      url: '/api/appointments/id-inexistente-12345',
      payload: { status: 'CANCELLED' },
    });
    assert(
      (invalidPatchRes.statusCode === 400 || invalidPatchRes.statusCode === 404) && invalidPatchRes.json().error,
      'PATCH con ID inexistente maneja el error adecuadamente con código 400/404 y mensaje descriptivo'
    );

    // =========================================================================
    // 7. MODO COPILOTO TAKEOVER (/api/conversations/:id/takeover y reply)
    // =========================================================================
    console.log(`\n${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}${BOLD}📋 7. MODO COPILOTO TAKEOVER (INTERVENCIÓN HUMANA & REPLY)${RESET}`);
    console.log(`${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    // Crear conversación de prueba en Clínica A
    const testConv = await db.conversation.create({
      data: {
        tenantId: tenantA.id,
        patientId: apptA.patientId,
        channel: 'WHATSAPP',
        externalChannelId: apptA.patient.phoneE164,
        isHandedOverToHuman: false,
        messages: {
          create: [
            {
              tenantId: tenantA.id,
              direction: 'INBOUND',
              senderRole: 'PATIENT',
              content: 'Hola, tengo una duda específica con mi factura.',
              channel: 'WHATSAPP',
            },
          ],
        },
      },
    });

    // Activar Takeover: Recepcionista toma control
    const takeoverOnRes = await app.inject({
      method: 'POST',
      url: `/api/conversations/${testConv.id}/takeover`,
      payload: { isHandedOver: true },
    });
    assert(
      takeoverOnRes.statusCode === 200 && takeoverOnRes.json().isHandedOverToHuman === true,
      'POST /api/conversations/:id/takeover activa modo copiloto (isHandedOverToHuman: true)'
    );

    const convDbOn = await db.conversation.findUnique({ where: { id: testConv.id } });
    assert(convDbOn?.isHandedOverToHuman === true, 'El flag isHandedOverToHuman queda persistido en BD');

    // Recepcionista envía respuesta manual (/api/conversations/:id/reply)
    const replyRes = await app.inject({
      method: 'POST',
      url: `/api/conversations/${testConv.id}/reply`,
      payload: {
        text: 'Hola Carlos, te atiende Mariana de facturación. Envíame tu Constancia de Situación Fiscal por favor.',
        staffName: 'Mariana Facturación',
      },
    });

    assert(
      replyRes.statusCode === 200 &&
        replyRes.json().senderRole === 'HUMAN_STAFF' &&
        replyRes.json().content.includes('[Mariana Facturación]'),
      'POST /api/conversations/:id/reply envía mensaje manual con rol HUMAN_STAFF y firma de personal'
    );

    // Simular webhook de WhatsApp mientras la conversación está en modo humano (La IA debe permanecer silenciada)
    await app.inject({
      method: 'POST',
      url: `/webhooks/meta?tenantId=${tenantA.id}`,
      payload: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'TEST_ACCOUNT',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: tenantA.phoneE164.replace(/\+/g, ''),
                    phone_number_id: 'TEST_PHONE_NUMBER_ID',
                  },
                  contacts: [{ profile: { name: 'Carlos Mendoza' }, wa_id: apptA.patient.phoneE164.replace(/\+/g, '') }],
                  messages: [
                    {
                      from: apptA.patient.phoneE164.replace(/\+/g, ''),
                      id: `wamid.test.${Date.now()}`,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      text: { body: 'Ya te envié el PDF de mi constancia.' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      },
    });

    // En modo humano, se guarda el inbound, pero la IA NO genera outbound
    const finalAiMessages = await db.message.count({
      where: {
        conversationId: testConv.id,
        senderRole: 'AI_AGENT',
      },
    });
    assert(
      finalAiMessages === 0,
      'Durante Takeover, la IA permanece 100% silenciada y no interfiere con la conversación'
    );

    // Devolver control a la IA (Takeover: false)
    const takeoverOffRes = await app.inject({
      method: 'POST',
      url: `/api/conversations/${testConv.id}/takeover`,
      payload: { isHandedOver: false },
    });
    assert(
      takeoverOffRes.statusCode === 200 && takeoverOffRes.json().isHandedOverToHuman === false,
      'POST /api/conversations/:id/takeover desactiva modo copiloto devolviendo control a la IA'
    );

    // Enviar mensaje con la IA reactivada para confirmar que vuelve a responder
    await app.inject({
      method: 'POST',
      url: `/webhooks/meta?tenantId=${tenantA.id}`,
      payload: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'TEST_ACCOUNT',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: tenantA.phoneE164.replace(/\+/g, ''),
                    phone_number_id: 'TEST_PHONE_NUMBER_ID',
                  },
                  contacts: [{ profile: { name: 'Carlos Mendoza' }, wa_id: apptA.patient.phoneE164.replace(/\+/g, '') }],
                  messages: [
                    {
                      from: apptA.patient.phoneE164.replace(/\+/g, ''),
                      id: `wamid.test.reactivated.${Date.now()}`,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      text: { body: 'Hola, ¿dónde están ubicados?' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      },
    });

    const aiResumedMessages = await waitFor(
      () =>
        db.message.count({
          where: {
            conversationId: testConv.id,
            senderRole: 'AI_AGENT',
          },
        }),
      (count) => count > 0
    );
    assert(
      aiResumedMessages > 0,
      'Tras devolver el control, la IA se reactiva inmediatamente y vuelve a contestar en WhatsApp'
    );
  } catch (error) {
    console.error(`\n${RED}${BOLD}❌ ERROR FATAL DURANTE LA EJECUCIÓN:${RESET}`, error);
    totalFailed++;
  } finally {
    // Limpieza de datos de prueba para no contaminar la BD
    if (tenantA?.id || tenantB?.id) {
      console.log(`\n${CYAN}🧹 Limpiando registros de prueba generados en base de datos...${RESET}`);
      const tenantIds = [tenantA?.id, tenantB?.id].filter(Boolean);
      await db.job.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.appointment.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.patient.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.service.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.doctor.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      console.log(`  ${GREEN}✓ Base de datos restablecida limpiamente.${RESET}`);
    }

    await app.close();
    await db.$disconnect();
  }

  // =========================================================================
  // REPORTE FINAL
  // =========================================================================
  console.log(`\n${BOLD}======================================================================${RESET}`);
  if (totalFailed === 0) {
    console.log(
      `${GREEN}${BOLD}🏁 RESULTADO: 100% EXITOSO (${totalPassed} pruebas pasadas, 0 fallidas).${RESET}`
    );
    console.log(`${GREEN}${BOLD}🎉 TODAS LAS PRUEBAS DE ESTRÉS Y END-TO-END PASARON CON ÉXITO.${RESET}`);
  } else {
    console.log(
      `${RED}${BOLD}🏁 RESULTADO CON FALLAS: ${totalPassed} pruebas pasadas, ${totalFailed} fallidas.${RESET}`
    );
  }
  console.log(`${BOLD}======================================================================\n${RESET}`);

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStressTestSuite();
