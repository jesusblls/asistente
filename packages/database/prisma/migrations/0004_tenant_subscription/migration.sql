-- ---------------------------------------------------------------------------
-- Suscripción de la clínica con Mercado Pago (cobro autoservicio).
--
-- Hasta aquí `subscriptionStatus` solo se podía mover a mano: una clínica cuya
-- prueba vencía quedaba suspendida sin forma de pagar desde el producto. Estas
-- columnas guardan el vínculo con la suscripción recurrente (preapproval) que
-- Mercado Pago cobra por su cuenta.
-- ---------------------------------------------------------------------------

ALTER TABLE "Tenant" ADD COLUMN "billingCycle" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "mpPreapprovalId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "lastPaymentId" TEXT;

-- Dos clínicas no pueden compartir la misma autorización de cobro: si llegara
-- a pasar, un cobro extendería el periodo de la clínica equivocada.
CREATE UNIQUE INDEX "Tenant_mpPreapprovalId_key" ON "Tenant"("mpPreapprovalId");
