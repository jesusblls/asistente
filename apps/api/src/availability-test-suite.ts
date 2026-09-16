/**
 * Suite de validación de horarios de consulta.
 *
 * El horario decide qué citas acepta el `SchedulerService`, así que un dato
 * mal formado que llegue a base de datos se traduce en pacientes rechazados
 * (o peor, citas ofrecidas con el consultorio cerrado). Estas pruebas fijan
 * el contrato de entrada.
 */
import { parseAvailabilityRules } from './lib/availability.js';
import { HttpError } from './lib/http.js';

function run() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed += 1;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed += 1;
    }
  }

  /** Devuelve el mensaje del HttpError 400, o null si no hubo rechazo. */
  function rejectionMessage(value: unknown): string | null {
    try {
      parseAvailabilityRules(value);
      return null;
    } catch (error) {
      return error instanceof HttpError && error.statusCode === 400 ? error.message : null;
    }
  }

  console.log('\n🧪 SUITE DE HORARIOS DE CONSULTA\n');

  console.log('▶ Horarios válidos');
  const completo = parseAvailabilityRules({
    days: {
      2: [{ start: '11:00', end: '20:00', lunchStart: '15:00', lunchEnd: '16:00' }],
      6: [{ start: '15:00', end: '20:00' }],
    },
    slotDurationMinutes: 30,
    bufferBetweenAppointmentsMinutes: 10,
  });
  assert(
    completo.days[2][0].lunchStart === '15:00' && completo.days[6][0].start === '15:00',
    'Se conserva un horario real de tardes con sábado y hora de comida'
  );
  assert(
    completo.days[6][0].lunchStart === undefined,
    'Un turno sin comida no inventa horario de comida'
  );

  const conDefaults = parseAvailabilityRules({ days: { 1: [{ start: '08:00', end: '13:00' }] } });
  assert(
    conDefaults.slotDurationMinutes === 45 && conDefaults.bufferBetweenAppointmentsMinutes === 10,
    'La duración y el margen toman valores por defecto si no se envían'
  );

  const conVacios = parseAvailabilityRules({
    days: { 1: [{ start: '09:00', end: '18:00' }], 3: [], 0: [] },
  });
  assert(
    conVacios.days[3] === undefined && conVacios.days[0] === undefined,
    'Un día sin turnos significa que no se atiende, no un error'
  );

  const desordenado = parseAvailabilityRules({
    days: { 4: [{ start: '16:00', end: '20:00' }, { start: '09:00', end: '13:00' }] },
  });
  assert(
    desordenado.days[4][0].start === '09:00' && desordenado.days[4][1].start === '16:00',
    'Dos turnos el mismo día se ordenan por hora de inicio'
  );

  const domingo = parseAvailabilityRules({ days: { 0: [{ start: '10:00', end: '14:00' }] } });
  assert(domingo.days[0][0].end === '14:00', 'El domingo (día 0) es un día de atención válido');

  console.log('\n▶ Horarios que deben rechazarse');
  assert(
    rejectionMessage({ days: { 1: [{ start: '18:00', end: '09:00' }] } }) ===
      'El lunes la hora de cierre debe ser posterior a la de apertura',
    'Se rechaza un turno que cierra antes de abrir, nombrando el día'
  );
  assert(
    rejectionMessage({ days: { 1: [{ start: '09:00', end: '18:00' }, { start: '17:00', end: '20:00' }] } }) ===
      'Los turnos del lunes se traslapan entre sí',
    'Se rechazan dos turnos traslapados el mismo día'
  );
  assert(
    rejectionMessage({
      days: { 3: [{ start: '09:00', end: '14:00', lunchStart: '15:00', lunchEnd: '16:00' }] },
    }) === 'El miércoles el horario de comida debe caer dentro del horario de consulta',
    'Se rechaza una comida fuera del horario de consulta'
  );
  assert(
    rejectionMessage({ days: { 3: [{ start: '09:00', end: '18:00', lunchStart: '14:00' }] } }) ===
      'El miércoles el horario de comida necesita hora de inicio y de fin',
    'Se rechaza media hora de comida'
  );
  assert(
    rejectionMessage({ days: { 1: [{ start: '9am', end: '18:00' }] } }) !== null,
    'Se rechaza una hora que no sea HH:MM de 24 horas'
  );
  assert(
    rejectionMessage({ days: { 1: [{ start: '25:00', end: '26:00' }] } }) !== null,
    'Se rechaza una hora fuera del rango de 24 horas'
  );
  assert(
    rejectionMessage({ days: { 7: [{ start: '09:00', end: '18:00' }] } }) !== null,
    'Se rechaza un índice de día fuera de 0-6'
  );
  assert(
    rejectionMessage({ days: {} }) === 'El especialista debe atender al menos un día de la semana',
    'Se rechaza un horario sin ningún día de atención'
  );
  assert(
    rejectionMessage({ days: { 1: [{ start: '09:00', end: '18:00' }] }, slotDurationMinutes: 999 }) !==
      null,
    'Se rechaza una duración de cita fuera de rango'
  );
  assert(
    rejectionMessage({
      days: { 1: [{ start: '09:00', end: '18:00' }] },
      bufferBetweenAppointmentsMinutes: -5,
    }) !== null,
    'Se rechaza un margen entre citas negativo'
  );
  assert(rejectionMessage(null) !== null, 'Se rechaza un horario nulo');
  assert(rejectionMessage([]) !== null, 'Se rechaza un arreglo en lugar de un objeto');
  assert(rejectionMessage({ days: 'lunes a viernes' }) !== null, 'Se rechaza el texto libre anterior');

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO HORARIOS: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

run();
