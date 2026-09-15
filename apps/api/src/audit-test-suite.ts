import { db, hashPassword } from '@asistente/database';
import { OmnichannelAgent, SchedulerService } from '@asistente/ai-agent';
import { buildServer } from './server.js';

process.env.JWT_SECRET ||= 'audit-test-secret-with-at-least-32-chars';
process.env.META_WHATSAPP_TOKEN = '';
process.env.META_PHONE_NUMBER_ID = '';
process.env.GEMINI_API_KEY = '';
process.env.AUDIT_READ_THROTTLE_MS = String(10 * 60 * 1000);

/**
 * Suite de la bitácora de auditoría (LFPDPPP / NOM-024-SSA3).
 *
 * Las filas de AuditLog que genera esta suite no se pueden borrar al final:
 * el trigger de retención lo impide, que es justo lo que se está probando.
 */

const ALL_DAYS = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((day) => [day, [{ start: '09:00', end: '18:00' }]])
);

async function createTenant(suffix: string, phone: string) {
  return db.tenant.create({
    data: {
      name: `Audit Test ${suffix}`,
      slug: `audit-test-${suffix}`,
      phoneE164: phone,
      address: 'CDMX',
      doctors: {
        create: [
          {
            name: `Doctor ${suffix}`,
            specialty: 'Odontología',
            availabilityRules: JSON.stringify({
              days: ALL_DAYS,
              slotDurationMinutes: 30,
              bufferBetweenAppointmentsMinutes: 0,
            }),
          },
        ],
      },
      services: {
        create: [{ name: `Servicio ${suffix}`, durationMinutes: 30, priceMxn: 500, requiredDepositMxn: 200 }],
      },
    },
    include: { doctors: true, services: true },
  });
}

async function findFreeSlot(tenantId: string, serviceId: string) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
    const slots = await SchedulerService.getAvailableSlots({ tenantId, targetDateStr: dateStr, serviceId });
    if (slots.length > 0) return slots[0];
  }
  throw new Error('No hay horarios disponibles para la prueba');
}

function parse(value: string | null): Record<string, any> | null {
  return value ? (JSON.parse(value) as Record<string, any>) : null;
}

async function runAuditTests() {
  console.log('🧾 ========================================================');
  console.log('🧾 SUITE DE AUDITORÍA (quién vio o modificó cada expediente)');
  console.log('🧾 ========================================================\n');

  const app = await buildServer({ logger: false });
  await app.ready();

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

  const suffix = Date.now().toString(36);
  const tenantIds: string[] = [];

  try {
    const tenantA = await createTenant(`a-${suffix}`, '+529900004101');
    const tenantB = await createTenant(`b-${suffix}`, '+529900004102');
    tenantIds.push(tenantA.id, tenantB.id);

    const password = 'audit-password-123';
    const adminA = await db.user.create({
      data: {
        tenantId: tenantA.id,
        email: `audit-admin-${suffix}@test.mx`,
        name: 'Admin A',
        role: 'ADMIN',
        passwordHash: await hashPassword(password),
      },
    });
    const staffA = await db.user.create({
      data: {
        tenantId: tenantA.id,
        email: `audit-staff-${suffix}@test.mx`,
        name: 'Staff A',
        role: 'STAFF',
        passwordHash: 'scrypt$00$00',
      },
    });
    const adminB = await db.user.create({
      data: {
        tenantId: tenantB.id,
        email: `audit-admin-b-${suffix}@test.mx`,
        name: 'Admin B',
        role: 'ADMIN',
        passwordHash: 'scrypt$00$00',
      },
    });

    const sign = (user: { id: string; tenantId: string; role: string; email: string }) => ({
      authorization: `Bearer ${app.jwt.sign({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      })}`,
    });
    const authAdminA = sign(adminA);
    const authStaffA = sign(staffA);
    const authAdminB = sign(adminB);

    // ------------------------------------------------------------------
    console.log('🔑 1. Inicios de sesión');
    const badLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: adminA.email, password: 'contraseña-incorrecta' },
    });
    const failedRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'LOGIN_FAILED', entityId: adminA.id },
    });
    assert(badLogin.statusCode === 401, 'Contraseña incorrecta responde 401');
    assert(
      parse(failedRow?.metadata ?? null)?.reason === 'BAD_PASSWORD',
      'El intento fallido queda registrado con su motivo'
    );
    assert(
      !JSON.stringify(failedRow).includes('contraseña-incorrecta'),
      'La contraseña intentada nunca se guarda en la auditoría'
    );

    const unknownEmail = `nadie-${suffix}@test.mx`;
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: unknownEmail, password: 'lo-que-sea-123' },
    });
    const unknownRow = await db.auditLog.findFirst({
      where: { action: 'LOGIN_FAILED', actorEmail: unknownEmail },
    });
    assert(
      unknownRow !== null && unknownRow.tenantId === null,
      'Un correo inexistente también se registra, sin clínica atribuida'
    );

    const goodLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: adminA.email, password },
    });
    const loginRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'LOGIN', actorId: adminA.id },
    });
    assert(goodLogin.statusCode === 200, 'Login correcto responde 200');
    assert(
      loginRow?.actorRole === 'ADMIN' && loginRow.ipAddress !== null,
      'El login exitoso guarda actor, rol e IP'
    );

    // ------------------------------------------------------------------
    console.log('\n📅 2. Citas: creación y modificación');
    const slot = await findFreeSlot(tenantA.id, tenantA.services[0].id);
    const booking = await app.inject({
      method: 'POST',
      url: '/api/appointments',
      headers: authAdminA,
      payload: {
        patientName: 'Paciente Auditado',
        patientPhone: '+529900004199',
        doctorId: slot.doctorId,
        serviceId: tenantA.services[0].id,
        startTimeIso: slot.startTimeIso,
      },
    });
    const appointment = booking.json() as { id: string; patientId: string };
    const createRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'CREATE', entityType: 'APPOINTMENT', entityId: appointment.id },
    });
    assert(booking.statusCode === 201, 'Recepción agenda una cita');
    assert(
      createRow?.actorId === adminA.id && createRow.patientId === appointment.patientId,
      'La creación de la cita registra quién agendó y a qué paciente'
    );

    const prefRes = await app.inject({
      method: 'POST',
      url: `/api/appointments/${appointment.id}/deposit-preference`,
      headers: authAdminA,
    });
    assert(prefRes.statusCode === 200, 'Generación de link de anticipo responde 200');
    const depositAudit = await db.auditLog.findFirst({
      where: {
        tenantId: tenantA.id,
        action: 'UPDATE',
        entityType: 'APPOINTMENT',
        entityId: appointment.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    const depositChanges = parse(depositAudit?.changes ?? null);
    assert(
      depositChanges?.depositPaymentUrl?.after === prefRes.json()?.initPoint,
      'El link de anticipo queda auditado con la URL generada'
    );
    assert(
      parse(depositAudit?.metadata ?? null)?.event === 'DEPOSIT_LINK_CREATED',
      'La auditoría del link de anticipo contiene el metadato DEPOSIT_LINK_CREATED'
    );

    const slotB1 = await findFreeSlot(tenantB.id, tenantB.services[0].id);
    const bookingB1 = await app.inject({
      method: 'POST',
      url: '/api/appointments',
      headers: authAdminB,
      payload: {
        patientName: 'Paciente Inicial',
        patientPhone: '+529900004177',
        doctorId: slotB1.doctorId,
        serviceId: tenantB.services[0].id,
        startTimeIso: slotB1.startTimeIso,
      },
    });
    assert(bookingB1.statusCode === 201, 'Recepción de clínica B agenda primera cita');
    const apptB1 = bookingB1.json() as { id: string; patientId: string };

    const slotB2 = await findFreeSlot(tenantB.id, tenantB.services[0].id);
    const bookingB2 = await app.inject({
      method: 'POST',
      url: '/api/appointments',
      headers: authAdminB,
      payload: {
        patientName: 'Paciente Renombrado',
        patientPhone: '+529900004177',
        doctorId: slotB2.doctorId,
        serviceId: tenantB.services[0].id,
        startTimeIso: slotB2.startTimeIso,
      },
    });
    assert(bookingB2.statusCode === 201, 'Recepción de clínica B agenda con nuevo nombre para el mismo teléfono');
    const patientRenameRow = await db.auditLog.findFirst({
      where: {
        tenantId: tenantB.id,
        action: 'UPDATE',
        entityType: 'PATIENT',
        entityId: apptB1.patientId,
      },
      orderBy: { createdAt: 'desc' },
    });
    const renameChanges = parse(patientRenameRow?.changes ?? null);
    assert(
      renameChanges?.fullName?.before === 'Paciente Inicial' &&
        renameChanges?.fullName?.after === 'Paciente Renombrado',
      'El cambio de nombre del paciente queda auditado con valor anterior y nuevo'
    );

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/appointments/${appointment.id}`,
      headers: authAdminA,
      payload: { status: 'PENDING', notes: 'Paciente pide llegar tarde' },
    });
    const updateRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'UPDATE', entityId: appointment.id },
      orderBy: { createdAt: 'desc' },
    });
    const updateChanges = parse(updateRow?.changes ?? null);
    assert(patch.statusCode === 200, 'La cita se modifica');
    assert(
      updateChanges?.status?.before === 'CONFIRMED' && updateChanges?.status?.after === 'PENDING',
      'El cambio de estatus guarda el valor anterior y el nuevo'
    );
    assert(!('slotKey' in (updateChanges ?? {})), 'Los campos internos no ensucian el diff');
    assert(updateRow?.requestId !== null, 'La fila enlaza con el request-id de los logs HTTP');

    // ------------------------------------------------------------------
    console.log('\n💬 3. Lectura de expedientes en la bandeja');
    const conversation = await db.conversation.create({
      data: {
        tenantId: tenantA.id,
        patientId: appointment.patientId,
        channel: 'WHATSAPP',
        externalChannelId: `audit-${suffix}`,
      },
    });

    for (let poll = 0; poll < 3; poll += 1) {
      await app.inject({
        method: 'GET',
        url: `/api/conversations/${conversation.id}/messages`,
        headers: authAdminA,
      });
    }
    const readRows = await db.auditLog.count({
      where: { tenantId: tenantA.id, action: 'READ', entityId: conversation.id },
    });
    assert(readRows === 1, `Tres refrescos del chat generan una sola lectura (${readRows})`);

    await app.inject({
      method: 'GET',
      url: `/api/conversations/${conversation.id}/messages`,
      headers: authStaffA,
    });
    const readersCount = await db.auditLog.count({
      where: { tenantId: tenantA.id, action: 'READ', entityId: conversation.id },
    });
    assert(readersCount === 2, 'Otro usuario leyendo el mismo chat sí genera su propia fila');

    const takeover = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversation.id}/takeover`,
      headers: authStaffA,
      payload: { isHandedOver: true },
    });
    const takeoverRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'UPDATE', entityId: conversation.id },
    });
    assert(takeover.statusCode === 200, 'Recepción toma el control de la conversación');
    assert(
      parse(takeoverRow?.changes ?? null)?.isHandedOverToHuman?.after === true &&
        takeoverRow?.actorId === staffA.id,
      'La toma de control queda atribuida al usuario que la hizo'
    );

    // ------------------------------------------------------------------
    console.log('\n🤖 4. Acciones del agente de IA');
    const agent = new OmnichannelAgent();
    await agent.processMessage('cancelar', {
      tenantId: tenantA.id,
      patientPhone: '+529900004199',
      channel: 'WHATSAPP',
      conversationId: conversation.id,
    });
    const agentRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, actorType: 'AI_AGENT', entityId: appointment.id },
    });
    assert(
      parse(agentRow?.changes ?? null)?.status?.after === 'CANCELLED',
      'La cancelación por WhatsApp queda atribuida al agente de IA'
    );
    assert(
      parse(agentRow?.metadata ?? null)?.conversationId === conversation.id,
      'La acción del agente enlaza con la conversación que la originó'
    );

    // ------------------------------------------------------------------
    console.log('\n🔍 5. Consulta de la bitácora');
    const staffQuery = await app.inject({ method: 'GET', url: '/api/audit', headers: authStaffA });
    assert(staffQuery.statusCode === 403, 'Un usuario STAFF no puede consultar la auditoría (403)');

    const byPatient = await app.inject({
      method: 'GET',
      url: `/api/audit?patientId=${appointment.patientId}`,
      headers: authAdminA,
    });
    const patientRows = byPatient.json() as Array<{ patientId: string; tenantId: string }>;
    assert(
      byPatient.statusCode === 200 &&
        patientRows.length >= 4 &&
        patientRows.every((row) => row.patientId === appointment.patientId),
      `El ADMIN ve quién tocó el expediente del paciente (${patientRows.length} eventos)`
    );

    const otherTenant = await app.inject({
      method: 'GET',
      url: `/api/audit?patientId=${appointment.patientId}`,
      headers: authAdminB,
    });
    assert(
      otherTenant.statusCode === 200 && (otherTenant.json() as unknown[]).length === 0,
      'Otra clínica no ve la auditoría ajena'
    );

    const auditOfAudit = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'LIST', entityType: 'AUDIT_LOG', actorId: adminA.id },
    });
    assert(auditOfAudit !== null, 'Consultar la bitácora también queda registrado');

    const sessionsOnly = await app.inject({
      method: 'GET',
      url: '/api/audit?action=LOGIN,LOGIN_FAILED',
      headers: authAdminA,
    });
    const sessionRows = sessionsOnly.json() as Array<{ action: string }>;
    assert(
      sessionsOnly.statusCode === 200 &&
        sessionRows.length >= 2 &&
        sessionRows.every((row) => row.action === 'LOGIN' || row.action === 'LOGIN_FAILED'),
      'El filtro acepta varias acciones a la vez (las categorías del panel)'
    );

    // ------------------------------------------------------------------
    console.log('\n📤 6. Nombres y exportación');
    const namedRows = byPatient.json() as Array<{ patient: { fullName: string } | null }>;
    assert(
      namedRows[0]?.patient?.fullName === 'Paciente Auditado',
      'Cada fila trae el nombre del paciente para mostrarlo'
    );

    const staffExport = await app.inject({
      method: 'GET',
      url: '/api/audit/export',
      headers: authStaffA,
    });
    assert(staffExport.statusCode === 403, 'Un usuario STAFF no puede exportar la bitácora (403)');

    // El nombre de WhatsApp lo escribe el paciente: es el vector real de
    // inyección de fórmulas al abrir el CSV en Excel.
    await db.patient.update({
      where: { id: appointment.patientId },
      data: { fullName: '=HYPERLINK("http://evil.test","clic")' },
    });
    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/audit/export?patientId=${appointment.patientId}`,
      headers: authAdminA,
    });
    assert(
      exportRes.statusCode === 200 &&
        String(exportRes.headers['content-type']).includes('text/csv') &&
        exportRes.body.includes('fecha_hora_cdmx'),
      'La exportación entrega un CSV con encabezados'
    );
    assert(
      exportRes.body.includes(`"'=HYPERLINK`) && !exportRes.body.includes(`,"=HYPERLINK`),
      'Una fórmula en el nombre del paciente sale neutralizada en el CSV'
    );
    const exportRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'EXPORT', actorId: adminA.id },
    });
    assert(
      (parse(exportRow?.metadata ?? null)?.count ?? 0) >= 1,
      'Exportar queda registrado con cuántos eventos salieron'
    );

    // ------------------------------------------------------------------
    console.log('\n🧹 7. Borrado masivo');
    const before = await db.auditLog.count({ where: { tenantId: tenantA.id } });
    const reset = await app.inject({
      method: 'DELETE',
      url: `/api/tenants/${tenantA.id}/reset`,
      headers: authAdminA,
    });
    const resetRow = await db.auditLog.findFirst({
      where: { tenantId: tenantA.id, action: 'DELETE', entityType: 'TENANT' },
    });
    const after = await db.auditLog.count({ where: { tenantId: tenantA.id } });
    assert(reset.statusCode === 200, 'El ADMIN limpia el historial clínico');
    assert(
      parse(resetRow?.metadata ?? null)?.deleted?.appointments === 1,
      'El borrado queda registrado con cuántos registros eliminó'
    );
    assert(after === before + 1, 'La bitácora sobrevive al borrado del historial');

    // ------------------------------------------------------------------
    console.log('\n🔒 7. Inmutabilidad y retención');
    const target = resetRow!;
    let updateBlocked = false;
    try {
      await db.auditLog.update({ where: { id: target.id }, data: { actorEmail: 'otro@test.mx' } });
    } catch {
      updateBlocked = true;
    }
    assert(updateBlocked, 'Ninguna fila se puede modificar (trigger de solo inserción)');

    let deleteBlocked = false;
    try {
      await db.auditLog.delete({ where: { id: target.id } });
    } catch {
      deleteBlocked = true;
    }
    assert(deleteBlocked, 'Una fila reciente no se puede borrar (retención de 5 años)');

    const expired = await db.auditLog.create({
      data: {
        tenantId: tenantA.id,
        actorType: 'SYSTEM',
        action: 'READ',
        entityType: 'APPOINTMENT',
        createdAt: new Date(Date.now() - 6 * 365 * 24 * 3600 * 1000),
      },
    });
    let purged = true;
    try {
      await db.auditLog.delete({ where: { id: expired.id } });
    } catch {
      purged = false;
    }
    assert(purged, 'Una fila con más de 5 años sí se puede depurar');
  } finally {
    for (const tenantId of tenantIds) {
      await db.job.deleteMany({ where: { tenantId } });
      await db.message.deleteMany({ where: { tenantId } });
      await db.conversation.deleteMany({ where: { tenantId } });
      await db.appointment.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.doctor.deleteMany({ where: { tenantId } });
      await db.service.deleteMany({ where: { tenantId } });
      await db.user.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO AUDITORÍA: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runAuditTests()
  .catch((error) => {
    console.error('Error en la suite de auditoría:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
