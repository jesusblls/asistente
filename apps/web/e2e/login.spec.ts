import { test, expect, type Page } from '@playwright/test';
import { PrismaClient, hashPassword } from '@asistente/database';

/**
 * Regresión del flujo real de acceso al panel:
 * Next (login) -> rewrite /auth/* -> Fastify -> JWT -> /dashboard.
 *
 * Cubre específicamente el bug en el que el rewrite de Next solo proxeaba
 * `/api/*` y el formulario devolvía 404 al postear a `/auth/login`.
 */

const prisma = new PrismaClient();
const suffix = Date.now().toString(36);
const tenantName = `E2E Login ${suffix}`;
const email = `e2e-login-${suffix}@asistente.test`;
const password = 'E2ePassword2026!';

let tenantId = '';

/**
 * En Next dev el HTML llega antes de que React hidrate; un `fill` temprano en
 * un input controlado puede perderse cuando la hidratación reescribe el valor.
 * Reintentamos hasta que el valor persista.
 */
async function fillWhenHydrated(page: Page, label: string, value: string): Promise<void> {
  const input = page.getByLabel(label);
  await expect(async () => {
    await input.fill(value);
    await expect(input).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test.beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: `e2e-login-${suffix}`,
      phoneE164: '+529900003001',
      users: {
        create: [
          {
            email,
            name: 'E2E Admin',
            role: 'ADMIN',
            passwordHash: await hashPassword(password),
          },
        ],
      },
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

test('un usuario válido inicia sesión y llega al dashboard', async ({ page }) => {
  await page.goto('/login');

  await fillWhenHydrated(page, 'Correo electrónico', email);
  await fillWhenHydrated(page, 'Contraseña', password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(
    page.getByRole('heading', { name: 'Panel de Recepción Inteligente' })
  ).toBeVisible();
  await expect(page.getByText(tenantName).first()).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('asistente_auth_token'));
  expect(token).toBeTruthy();
});

test('credenciales inválidas muestran el error y no abren el panel', async ({ page }) => {
  await page.goto('/login');

  await fillWhenHydrated(page, 'Correo electrónico', email);
  await fillWhenHydrated(page, 'Contraseña', 'contrasena-incorrecta');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();

  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
