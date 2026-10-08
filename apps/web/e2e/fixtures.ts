import { expect, type Locator, type Page } from '@playwright/test';
import { PrismaClient, hashPassword } from '@asistente/database';

/**
 * Utilidades compartidas por las pruebas E2E.
 *
 * Cada spec crea su propia clínica con slug y correo únicos y la borra al
 * terminar: el borrado del `Tenant` arrastra en cascada usuarios, doctores,
 * servicios, pacientes, citas, conversaciones y mensajes. `AuditLog` no tiene
 * llave foránea a `Tenant` y es de solo inserción (NOM-024), así que sus filas
 * se quedan a propósito, igual que en `login.spec.ts`.
 */

export const prisma = new PrismaClient();

export const E2E_PASSWORD = 'E2ePassword2026!';

/** Sufijo único por ejecución para no chocar con datos de corridas previas. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Teléfono E.164 mexicano válido y distinto en cada corrida (lada 99 no se
 * asigna a ninguna ciudad real).
 */
export function uniquePhone(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  return `+5299${digits}`;
}

/**
 * Horario abierto toda la semana, de 08:00 a 20:00 (CDMX), para que una cita
 * a las 11:00 de cualquier día caiga dentro del horario del especialista.
 */
export const OPEN_ALL_WEEK = JSON.stringify({
  days: Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((day) => [day, [{ start: '08:00', end: '20:00' }]])
  ),
});

export interface SeededClinic {
  tenantId: string;
  tenantName: string;
  email: string;
  password: string;
  doctorId: string;
  doctorName: string;
  serviceId: string;
  serviceName: string;
}

/**
 * Crea una clínica ya configurada (onboarding terminado) con un administrador,
 * un especialista y un tratamiento.
 */
export async function seedClinic(prefix: string): Promise<SeededClinic> {
  const suffix = uniqueSuffix();
  const tenantName = `E2E ${prefix} ${suffix}`;
  const email = `e2e-${prefix}-${suffix}@asistente.test`;
  const doctorName = `Dra. E2E ${suffix}`;
  const serviceName = `Valoración E2E ${suffix}`;

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: `e2e-${prefix}-${suffix}`,
      phoneE164: uniquePhone(),
      onboardingCompletedAt: new Date(),
      users: {
        create: [
          {
            email,
            name: 'E2E Admin',
            role: 'ADMIN',
            passwordHash: await hashPassword(E2E_PASSWORD),
          },
        ],
      },
      doctors: {
        create: [{ name: doctorName, specialty: 'Odontología General', availabilityRules: OPEN_ALL_WEEK }],
      },
      services: {
        create: [{ name: serviceName, category: 'Diagnóstico', durationMinutes: 30, priceMxn: 450 }],
      },
    },
    include: { doctors: true, services: true },
  });

  return {
    tenantId: tenant.id,
    tenantName,
    email,
    password: E2E_PASSWORD,
    doctorId: tenant.doctors[0].id,
    doctorName,
    serviceId: tenant.services[0].id,
    serviceName,
  };
}

/** Borra la clínica y todo lo que cuelga de ella (cascada), más sus trabajos en cola. */
export async function deleteClinic(tenantId: string | undefined | null): Promise<void> {
  if (!tenantId) return;
  // `Job` no tiene llave foránea a `Tenant`: una respuesta manual por WhatsApp
  // puede dejar trabajos en la cola que el borrado en cascada no alcanza.
  await prisma.job.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

/**
 * En Next dev el HTML llega antes de que React hidrate; un `fill` temprano en
 * un input controlado puede perderse cuando la hidratación reescribe el valor.
 * Reintentamos hasta que el valor persista.
 */
export async function fillWhenHydrated(input: Locator, value: string): Promise<void> {
  await expect(async () => {
    await input.fill(value);
    await expect(input).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Inicia sesión por la pantalla real de login y espera a estar en el panel. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await fillWhenHydrated(page.getByLabel('Correo electrónico'), email);
  await fillWhenHydrated(page.getByLabel('Contraseña'), password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/**
 * Campo de formulario por su etiqueta visible. Si la etiqueta no está asociada
 * al control (`htmlFor`), cae al primer input/select/textarea que la sigue en
 * el mismo contenedor. Así la prueba sobrevive a que alguien corrija la
 * accesibilidad del formulario sin tener que tocarla.
 */
export function fieldByLabel(scope: Page | Locator, label: string | RegExp): Locator {
  const labelEl = scope.locator('label').filter({ hasText: label }).first();
  const sibling = labelEl.locator(
    'xpath=following-sibling::*[self::input or self::select or self::textarea][1]'
  );
  return scope.getByLabel(label).or(sibling).first();
}

/** Fecha `YYYY-MM-DD` en CDMX dentro de `days` días. */
export function cdmxDateInDays(days: number): string {
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(target);
}
