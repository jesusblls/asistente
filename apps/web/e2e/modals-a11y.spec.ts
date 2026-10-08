import { test, expect, type Locator, type Page } from '@playwright/test';
import { PrismaClient, hashPassword } from '@asistente/database';

/**
 * Accesibilidad de los modales de /dashboard/team (componente `Modal`):
 * rol de diálogo con nombre accesible, foco dentro al abrir, Tab atrapado,
 * Escape cierra, foco de regreso al disparador y scroll del fondo bloqueado.
 */

const prisma = new PrismaClient();
const suffix = Date.now().toString(36);
const email = `e2e-modals-${suffix}@asistente.test`;
const password = 'E2ePassword2026!';

let tenantId = '';

async function fillWhenHydrated(page: Page, label: string, value: string): Promise<void> {
  const input = page.getByLabel(label);
  await expect(async () => {
    await input.fill(value);
    await expect(input).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function focusIsInside(dialog: Locator): Promise<boolean> {
  return dialog.evaluate((el) => el.contains(document.activeElement));
}

async function bodyOverflow(page: Page): Promise<string> {
  return page.evaluate(() => document.body.style.overflow);
}

/** Abre con teclado, recorre con Tab/Shift+Tab y cierra con Escape. */
async function checkModal(
  page: Page,
  trigger: Locator,
  role: 'dialog' | 'alertdialog',
  name: string | RegExp
) {
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole(role, { name });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => focusIsInside(dialog)).toBe(true);
  expect(await bodyOverflow(page)).toBe('hidden');

  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await focusIsInside(dialog)).toBe(true);
  }
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await focusIsInside(dialog)).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await bodyOverflow(page)).toBe('');
}

test.beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: {
      name: `E2E Modales ${suffix}`,
      slug: `e2e-modals-${suffix}`,
      phoneE164: '+529900003009',
      users: {
        create: [
          { email, name: 'E2E Admin', role: 'ADMIN', passwordHash: await hashPassword(password) },
        ],
      },
      doctors: { create: [{ name: 'Dra. Prueba Modal', specialty: 'Endodoncia' }] },
      services: { create: [{ name: 'Limpieza Prueba Modal', priceMxn: 500 }] },
    },
  });
  tenantId = tenant.id;
});

test.afterAll(async () => {
  if (tenantId) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
});

test('los modales del equipo son diálogos accesibles por teclado', async ({ page }) => {
  await page.goto('/login');
  await fillWhenHydrated(page, 'Correo electrónico', email);
  await fillWhenHydrated(page, 'Contraseña', password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  await page.goto('/dashboard/team');
  await expect(page.getByText('Dra. Prueba Modal').first()).toBeVisible({ timeout: 15_000 });

  // Alta de especialista: el foco inicial cae en el primer campo, no en la X.
  const newDoctor = page.getByRole('button', { name: 'Nuevo Especialista' });
  await newDoctor.focus();
  await page.keyboard.press('Enter');
  const doctorDialog = page.getByRole('dialog', { name: 'Registrar Nuevo Especialista' });
  await expect(page.getByLabel('Nombre completo del médico o especialista *')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(doctorDialog).toBeHidden();

  await checkModal(page, newDoctor, 'dialog', 'Registrar Nuevo Especialista');
  await checkModal(
    page,
    page.getByRole('button', { name: 'Nuevo Tratamiento' }),
    'dialog',
    'Registrar Nuevo Tratamiento'
  );
  await checkModal(
    page,
    page.getByRole('button', { name: 'Agregar pregunta' }),
    'dialog',
    'Nueva Pregunta Frecuente'
  );

  // Confirmación destructiva: alertdialog con foco inicial en "Cancelar".
  const deleteDoctor = page.getByTitle('Eliminar especialista').first();
  await deleteDoctor.focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('alertdialog', { name: '¿Eliminar especialista?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(deleteDoctor).toBeFocused();
  await checkModal(page, deleteDoctor, 'alertdialog', '¿Eliminar especialista?');

  // El botón X tiene nombre accesible y también devuelve el foco.
  await newDoctor.focus();
  await page.keyboard.press('Enter');
  await doctorDialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(doctorDialog).toBeHidden();
  await expect(newDoctor).toBeFocused();
});
