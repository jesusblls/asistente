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

  // El JWT ya NO se almacena en localStorage (mitigación XSS)
  const tokenInStorage = await page.evaluate(() => localStorage.getItem('asistente_auth_token'));
  expect(tokenInStorage).toBeNull();

  // El JWT vive en la cookie httpOnly asistente_session
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === 'asistente_session');
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.value).toBeTruthy();
});

test('credenciales inválidas muestran el error y no abren el panel', async ({ page }) => {
  await page.goto('/login');

  await fillWhenHydrated(page, 'Correo electrónico', email);
  await fillWhenHydrated(page, 'Contraseña', 'contrasena-incorrecta');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();

  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('recargar el panel no expulsa al login con la sesión válida', async ({ page }) => {
  await page.goto('/login');

  await fillWhenHydrated(page, 'Correo electrónico', email);
  await fillWhenHydrated(page, 'Contraseña', password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // Cubre el comportamiento que rompía el bug de `AuthGuard`: al recargar, el
  // subárbol del panel se remonta y la versión anterior tomaba entonces el
  // `getServerSnapshot` de `useSyncExternalStore` (`false`), redirigiendo al
  // login con la sesión intacta.
  //
  // ADVERTENCIA para quien toque esto: esta prueba **no** reproduce aquel
  // fallo. El remontaje que lo dispara ocurre en un navegador real pero no en
  // el Chromium de Playwright (se comprobó ejecutándola contra el código
  // defectuoso: pasaba igual, incluso con la CPU estrangulada 20x). Queda como
  // cobertura del camino del usuario —recargar y entrar por URL directa—, no
  // como garantía contra esa regresión concreta; esa se verificó a mano
  // instrumentando los renders.
  await page.reload();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole('heading', { name: 'Panel de Recepción Inteligente' })
  ).toBeVisible();

  // La sesión debe seguir intacta: un rebote por 401 habría llamado a
  // clearSession() y borrado estas llaves.
  const sesionLocal = await page.evaluate(() => localStorage.getItem('asistente_auth_user'));
  expect(sesionLocal).toBeTruthy();

  // Entrar directo por URL (favorito o enlace compartido) debe funcionar igual.
  await page.goto('/dashboard/patients');
  await expect(page).toHaveURL(/\/dashboard\/patients/);
});

test('sin sesión, el panel sigue redirigiendo al login', async ({ page }) => {
  // La contraparte del caso anterior: el arreglo no debe abrir el panel a
  // quien no ha iniciado sesión.
  await page.goto('/dashboard');

  await page.waitForURL('**/login', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
});

test('el cierre de sesión invalida la cookie httpOnly y redirige al login', async ({ page }) => {
  await page.goto('/login');

  await fillWhenHydrated(page, 'Correo electrónico', email);
  await fillWhenHydrated(page, 'Contraseña', password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL('**/login', { timeout: 15_000 });

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === 'asistente_session');
  expect(sessionCookie?.value || '').toBe('');
});
