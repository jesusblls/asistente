-- ---------------------------------------------------------------------------
-- Cambio de plan pendiente de pago.
--
-- Hasta aquí, abrir el checkout escribía el plan pedido directo en `planSlug`
-- y la nueva autorización en `mpPreapprovalId`. Como los cupos se derivan de
-- `planSlug`, una clínica en prueba que solo abría el link de "Clínica Pro"
-- obtenía los cupos de Pro sin pagar, y una clínica activa que cambiaba de
-- plan dejaba huérfana su suscripción anterior: Mercado Pago la seguía
-- cobrando y sus webhooks ya no encontraban clínica.
--
-- El checkout ahora guarda el cambio aquí; el webhook que confirma el cobro
-- lo promueve a las columnas activas y cancela la autorización anterior.
-- ---------------------------------------------------------------------------

ALTER TABLE "Tenant" ADD COLUMN "pendingPlanSlug" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "pendingBillingCycle" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "pendingPreapprovalId" TEXT;

-- Igual que la activa: una autorización de cobro pertenece a una sola clínica.
CREATE UNIQUE INDEX "Tenant_pendingPreapprovalId_key" ON "Tenant"("pendingPreapprovalId");
