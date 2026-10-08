import { test, expect } from '@playwright/test';
import {
  deleteClinic,
  loginViaUi,
  prisma,
  seedClinic,
  uniquePhone,
  type SeededClinic,
} from './fixtures';

/**
 * Bandeja omnicanal en modo copiloto (CLAUDE.md § 1.5):
 * "Tomar control" pausa la IA en esa conversación, recepción responde a mano
 * y la respuesta aparece en el hilo; "Devolver a la IA" la reactiva.
 *
 * El servidor de pruebas arranca sin credenciales de Meta, así que el envío
 * por WhatsApp es simulado: no sale ningún mensaje real.
 */

let clinic: SeededClinic;
let conversationId = '';
const patientName = `Paciente Bandeja ${Date.now().toString(36)}`;
const inboundText = 'Hola, ¿me pueden confirmar el horario de mañana?';

test.beforeAll(async () => {
  clinic = await seedClinic('bandeja');
  const phone = uniquePhone();
  const patient = await prisma.patient.create({
    data: { tenantId: clinic.tenantId, fullName: patientName, phoneE164: phone, whatsappId: phone.slice(1) },
  });
  const conversation = await prisma.conversation.create({
    data: {
      tenantId: clinic.tenantId,
      patientId: patient.id,
      channel: 'WHATSAPP',
      externalChannelId: phone.slice(1),
      messages: {
        create: [
          {
            tenantId: clinic.tenantId,
            direction: 'INBOUND',
            senderRole: 'PATIENT',
            content: inboundText,
            channel: 'WHATSAPP',
          },
        ],
      },
    },
  });
  conversationId = conversation.id;
});

test.afterAll(async () => {
  await deleteClinic(clinic?.tenantId);
  await prisma.$disconnect();
});

async function isHandedOver(): Promise<boolean> {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { isHandedOverToHuman: true },
  });
  return conversation.isHandedOverToHuman;
}

test('tomar control pausa la IA y la respuesta de recepción aparece en el hilo', async ({ page }) => {
  const replyText = `Claro, su cita sigue en pie. Ref ${Date.now().toString(36)}`;

  await loginViaUi(page, clinic.email, clinic.password);
  await page.goto('/dashboard/inbox');

  // El texto del último mensaje también sale en la vista previa de la lista;
  // el hilo es el contenedor más interno que tiene a la vez el mensaje del
  // paciente y la caja de respuesta.
  const thread = page
    .locator('div')
    .filter({ has: page.getByLabel(/Respuesta manual para/) })
    .filter({ hasText: inboundText })
    .last();

  // La conversación sembrada se abre sola por ser la única de la clínica.
  await expect(thread.getByText(inboundText)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(patientName).first()).toBeVisible();

  // --- Tomar control ---------------------------------------------------------
  await page.getByRole('button', { name: /Tomar control/i }).click();
  await expect(page.getByText(/Modo Copiloto Humano Activo/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Devolver a (la )?IA/ })).toBeVisible();
  await expect.poll(isHandedOver, { timeout: 10_000 }).toBe(true);

  // El estado sobrevive al sondeo y a recargar: viene del servidor, no solo
  // del cambio optimista en pantalla.
  await page.reload();
  await expect(page.getByText(/Modo Copiloto Humano Activo/)).toBeVisible({ timeout: 15_000 });

  // --- Respuesta manual -------------------------------------------------------
  const input = page.getByLabel(/Respuesta manual para/);
  await expect(async () => {
    await input.fill(replyText);
    await expect(input).toHaveValue(replyText, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();

  await expect(thread.getByText(replyText)).toBeVisible();
  await expect(input).toHaveValue('');

  // Quedó guardada como mensaje de recepción, y el envío simulado no falló.
  await expect
    .poll(
      async () =>
        prisma.message.findFirst({
          where: { conversationId, tenantId: clinic.tenantId, content: { contains: replyText } },
          select: { senderRole: true, direction: true, deliveryStatus: true },
        }),
      { timeout: 10_000 }
    )
    .toEqual({ senderRole: 'HUMAN_STAFF', direction: 'OUTBOUND', deliveryStatus: 'SENT' });

  // Tras recargar, el hilo se reconstruye desde la API con la respuesta.
  await page.reload();
  await expect(thread.getByText(replyText)).toBeVisible({ timeout: 15_000 });
  // La respuesta va firmada con el nombre de quien la escribió, no con un
  // genérico "Recepción": así la clínica sabe quién contestó a cada paciente.
  await expect(thread.getByText('E2E Admin', { exact: true })).toBeVisible();

  // --- Devolver a la IA -------------------------------------------------------
  await page.getByRole('button', { name: /Devolver a (la )?IA/ }).click();
  await expect(page.getByText(/Modo Copiloto Humano Activo/)).toBeHidden();
  await expect(page.getByRole('button', { name: /Tomar control/i })).toBeVisible();
  await expect.poll(isHandedOver, { timeout: 10_000 }).toBe(false);
});
