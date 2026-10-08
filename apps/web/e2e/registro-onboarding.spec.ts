import { test, expect } from '@playwright/test';
import { deleteClinic, fillWhenHydrated, prisma, uniqueSuffix } from './fixtures';

/**
 * Alta de una clínica nueva de punta a punta:
 * /registro (con aceptación legal) -> /onboarding (5 pasos) -> /dashboard.
 *
 * Es el primer contacto de un cliente con el producto: si cualquiera de los
 * pasos falla, la clínica se queda con una cuenta vacía y una IA sin horarios
 * ni precios con qué atender.
 *
 * Ojo al repetirla en local: `/auth/register` admite 5 altas por hora y por
 * IP (y `/auth/login`, 10 por minuto). Si se corre muchas veces seguidas
 * contra el mismo API, el alta responde 429 y la prueba no llega a
 * /onboarding; reiniciar el API limpia el contador.
 */

const suffix = uniqueSuffix();
const clinicName = `E2E Registro ${suffix}`;
const updatedClinicName = `${clinicName} Polanco`;
const email = `e2e-registro-${suffix}@asistente.test`;
const password = 'E2ePassword2026!';
const doctorName = `Dra. Registro ${suffix}`;
const serviceName = `Limpieza E2E ${suffix}`;

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email }, select: { tenantId: true } });
  for (const user of users) await deleteClinic(user.tenantId);
}

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('sin aceptar los términos el registro no crea la cuenta', async ({ page }) => {
  await page.goto('/registro');

  await fillWhenHydrated(page.getByLabel('Nombre de tu clínica o consultorio'), clinicName);
  await fillWhenHydrated(page.getByLabel('Teléfono de la clínica'), '55 1234 5678');
  await fillWhenHydrated(page.getByLabel('Tu nombre'), 'Dra. E2E Registro');
  await fillWhenHydrated(page.getByLabel('Correo electrónico'), email);
  await fillWhenHydrated(page.getByLabel('Contraseña'), password);

  await page.getByRole('button', { name: /Crear cuenta/ }).click();

  // La casilla es `required`: el navegador detiene el envío antes del API.
  await expect(page).toHaveURL(/\/registro/);
  const checkbox = page.getByRole('checkbox');
  expect(await checkbox.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  expect(await prisma.user.count({ where: { email } })).toBe(0);
});

test('una clínica nueva se registra, completa el onboarding y llega al panel', async ({ page }) => {
  // --- Registro -----------------------------------------------------------
  await page.goto('/registro');

  await fillWhenHydrated(page.getByLabel('Nombre de tu clínica o consultorio'), clinicName);
  await fillWhenHydrated(page.getByLabel('Teléfono de la clínica'), '55 1234 5678');
  await fillWhenHydrated(page.getByLabel('Tu nombre'), 'Dra. E2E Registro');
  await fillWhenHydrated(page.getByLabel('Correo electrónico'), email);
  await fillWhenHydrated(page.getByLabel('Contraseña'), password);
  await page.getByRole('checkbox', { name: /Acepto los/ }).check();

  await page.getByRole('button', { name: /Crear cuenta/ }).click();
  await page.waitForURL('**/onboarding', { timeout: 20_000 });

  // --- Paso 1: datos de la clínica -----------------------------------------
  await expect(page.getByRole('heading', { name: 'Datos de tu clínica' })).toBeVisible();
  // `cargarEstado` no cancela las cargas anteriores: en dev (StrictMode) se
  // disparan varias GET /api/onboarding y una respuesta tardía pisa lo que ya
  // se escribió en el formulario. Se espera a que terminen antes de capturar.
  // Registrado como pendiente en BITACORA.md.
  await page.waitForLoadState('networkidle');
  const nameInput = page.getByLabel(/Nombre de la clínica/);
  await expect(nameInput).toHaveValue(clinicName);
  await fillWhenHydrated(nameInput, updatedClinicName);
  await fillWhenHydrated(page.getByLabel('Dirección'), 'Av. Horacio 1520, Polanco, CDMX');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // --- Paso 2: especialista y horario --------------------------------------
  await expect(page.getByRole('heading', { name: /primer especialista/ })).toBeVisible();
  await fillWhenHydrated(page.getByLabel(/^Nombre/), doctorName);
  await fillWhenHydrated(page.getByLabel(/^Especialidad/), 'Odontología General');
  // El horario se deja en el valor sugerido por el editor: lo que importa es
  // que se guarde junto con el especialista.
  await page.getByRole('button', { name: 'Continuar' }).click();

  // --- Paso 3: tratamiento --------------------------------------------------
  await expect(page.getByRole('heading', { name: /primer tratamiento/ })).toBeVisible();
  await fillWhenHydrated(page.getByLabel(/Nombre del tratamiento/), serviceName);
  await fillWhenHydrated(page.getByLabel(/Precio/), '600');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // --- Paso 4: preguntas frecuentes ----------------------------------------
  await expect(page.getByRole('heading', { name: /te preguntan tus pacientes/ })).toBeVisible();
  // Las dos primeras vienen preseleccionadas; se agrega una tercera.
  await page.getByRole('button', { name: /estacionamiento/ }).waitFor();
  await page.getByRole('button', { name: /aseguradoras/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // --- Paso 5: resumen ------------------------------------------------------
  await expect(page.getByRole('heading', { name: /ya puede atender/ })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar al panel' }).click();

  await page.waitForURL('**/dashboard', { timeout: 20_000 });
  await expect(
    page.getByRole('heading', { name: 'Panel de Recepción Inteligente' })
  ).toBeVisible();

  // --- Lo capturado quedó guardado en la clínica correcta ------------------
  const user = await prisma.user.findFirstOrThrow({
    where: { email },
    include: {
      tenant: { include: { doctors: true, services: true, faqItems: true } },
    },
  });
  const tenant = user.tenant;
  expect(user.role).toBe('ADMIN');
  expect(tenant.name).toBe(updatedClinicName);
  expect(tenant.address).toBe('Av. Horacio 1520, Polanco, CDMX');
  expect(tenant.phoneE164).toBe('+525512345678');
  expect(tenant.onboardingCompletedAt).not.toBeNull();
  expect(tenant.doctors.map((d) => d.name)).toEqual([doctorName]);
  expect(tenant.doctors[0].availabilityRules).toBeTruthy();
  expect(tenant.services.map((s) => s.name)).toEqual([serviceName]);
  expect(tenant.services[0].priceMxn).toBe(600);
  expect(tenant.faqItems).toHaveLength(3);

  // Volver a /onboarding con la configuración terminada regresa al panel.
  await page.goto('/onboarding');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
});
