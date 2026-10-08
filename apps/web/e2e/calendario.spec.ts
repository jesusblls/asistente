import { test, expect } from '@playwright/test';
import {
  cdmxDateInDays,
  deleteClinic,
  fieldByLabel,
  fillWhenHydrated,
  loginViaUi,
  prisma,
  seedClinic,
  type SeededClinic,
} from './fixtures';

/**
 * Agenda manual desde recepción: "Nueva Cita" con un especialista y un
 * tratamiento de la clínica -> la cita aparece en la lista y queda guardada
 * en la base con la hora correcta de la Ciudad de México.
 */

// La hora que captura recepción es hora de CDMX; el navegador de la prueba
// vive en esa zona para que el resultado no dependa de dónde corre la CI.
test.use({ timezoneId: 'America/Mexico_City' });

let clinic: SeededClinic;

test.beforeAll(async () => {
  clinic = await seedClinic('calendario');
});

test.afterAll(async () => {
  await deleteClinic(clinic?.tenantId);
  await prisma.$disconnect();
});

test('recepción agenda una cita y la ve en la lista', async ({ page }) => {
  const patientName = `Paciente Agenda ${Date.now().toString(36)}`;
  // Una semana adelante: nunca en el pasado y siempre dentro del horario
  // sembrado (todos los días, de 08:00 a 20:00).
  const date = cdmxDateInDays(7);

  await loginViaUi(page, clinic.email, clinic.password);
  await page.goto('/dashboard/calendar');
  await expect(page.getByRole('heading', { name: 'Agenda Médica y Citas' })).toBeVisible();

  // El catálogo de la clínica se carga al entrar: esperar al especialista
  // evita abrir el formulario con los selectores vacíos.
  await expect(page.getByRole('button', { name: clinic.doctorName })).toBeVisible();

  await page.getByRole('button', { name: 'Nueva Cita' }).click();
  const form = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Confirmar y Agendar' }),
  });
  await expect(form).toBeVisible();

  await fillWhenHydrated(fieldByLabel(form, /Nombre Completo del Paciente/i), patientName);
  await fillWhenHydrated(fieldByLabel(form, /Teléfono/i), '55 8765 4321');
  await fieldByLabel(form, /Especialista/i).selectOption({ label: clinic.doctorName });
  await fieldByLabel(form, /Tratamiento/i).selectOption(clinic.serviceId);
  await fieldByLabel(form, /^Fecha/i).fill(date);
  await fieldByLabel(form, /Horario/i).fill('11:00');

  await form.getByRole('button', { name: 'Confirmar y Agendar' }).click();
  await expect(form).toBeHidden();

  // Aparece en la lista con su paciente, tratamiento y especialista.
  const row = page.getByText(patientName, { exact: true });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(clinic.serviceName).first()).toBeVisible();

  // Y quedó en la base, en la clínica correcta y a las 11:00 de CDMX.
  const appointment = await prisma.appointment.findFirstOrThrow({
    where: { tenantId: clinic.tenantId, patient: { fullName: patientName } },
    include: { patient: true },
  });
  expect(appointment.doctorId).toBe(clinic.doctorId);
  expect(appointment.serviceId).toBe(clinic.serviceId);
  expect(appointment.status).not.toBe('CANCELLED');
  expect(appointment.patient.phoneE164).toBe('+525587654321');
  const localStart = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(appointment.startTime);
  expect(localStart).toBe(`${date}, 11:00`);
});
