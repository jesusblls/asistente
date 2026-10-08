import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  deleteClinic,
  fillWhenHydrated,
  loginViaUi,
  prisma,
  seedClinic,
  type SeededClinic,
} from './fixtures';

/**
 * Recuperación de contraseña:
 * login -> "¿La olvidaste?" -> /recuperar (mensaje genérico) y
 * /restablecer#token=... -> contraseña nueva -> login con la nueva sí, con la
 * vieja no.
 *
 * En desarrollo sin `RESEND_API_KEY` el correo solo se registra en el log y
 * el token se guarda hasheado, así que la prueba siembra su propio
 * `PasswordResetToken` con un token conocido (sha256 en hex, igual que
 * `hashResetToken` en apps/api/src/routes/auth.ts).
 */

const GENERIC_MESSAGE = /Si el correo está registrado, te enviamos un enlace/;
const NEW_PASSWORD = 'NuevaClaveE2E2026!';

let clinic: SeededClinic;

test.beforeAll(async () => {
  clinic = await seedClinic('recuperar');
});

test.afterAll(async () => {
  await deleteClinic(clinic?.tenantId);
  await prisma.$disconnect();
});

test('"¿La olvidaste?" lleva a /recuperar y responde con el mensaje genérico', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: '¿La olvidaste?' }).click();
  await page.waitForURL('**/recuperar');

  await expect(page.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeVisible();
  // Un correo que no existe recibe exactamente la misma respuesta: la ruta no
  // debe servir para averiguar qué cuentas están registradas.
  await fillWhenHydrated(page.getByLabel('Correo electrónico'), `no-existe-${Date.now()}@asistente.test`);
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();

  await expect(page.getByText(GENERIC_MESSAGE)).toBeVisible();
  await expect(page.getByRole('link', { name: /Volver a iniciar sesión/ })).toBeVisible();
});

test('un enlace válido cambia la contraseña: la nueva entra y la vieja ya no', async ({ page }) => {
  const user = await prisma.user.findFirstOrThrow({ where: { email: clinic.email } });
  const token = randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });

  await page.goto(`/restablecer#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Elige una contraseña nueva' })).toBeVisible();
  // El token se quita de la barra de direcciones en cuanto se lee.
  await expect(page).not.toHaveURL(/token=/);

  await fillWhenHydrated(page.getByLabel('Contraseña nueva'), NEW_PASSWORD);
  await fillWhenHydrated(page.getByLabel('Repite la contraseña'), NEW_PASSWORD);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(page.getByText(/tu contraseña cambió/)).toBeVisible();
  await page.waitForURL('**/login', { timeout: 15_000 });

  // El enlace es de un solo uso.
  const record = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
  expect(record.usedAt).not.toBeNull();

  // La contraseña anterior ya no sirve...
  await fillWhenHydrated(page.getByLabel('Correo electrónico'), clinic.email);
  await fillWhenHydrated(page.getByLabel('Contraseña'), clinic.password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // ...y la nueva abre el panel.
  await loginViaUi(page, clinic.email, NEW_PASSWORD);
  await expect(
    page.getByRole('heading', { name: 'Panel de Recepción Inteligente' })
  ).toBeVisible();
});

test('reutilizar un enlace ya usado se rechaza', async ({ page }) => {
  const user = await prisma.user.findFirstOrThrow({ where: { email: clinic.email } });
  const token = randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 30 * 60_000),
      usedAt: new Date(),
    },
  });

  await page.goto(`/restablecer#token=${token}`);
  await fillWhenHydrated(page.getByLabel('Contraseña nueva'), 'OtraClaveE2E2026!');
  await fillWhenHydrated(page.getByLabel('Repite la contraseña'), 'OtraClaveE2E2026!');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(page.getByText(/no es válido o ya venció/)).toBeVisible();
  await expect(page).toHaveURL(/\/restablecer/);
});
