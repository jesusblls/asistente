-- ---------------------------------------------------------------------------
-- Planes de suscripción, prueba gratuita, onboarding y consumo medido.
--
-- Hasta aquí los tres planes de la landing eran texto: ninguna clínica tenía
-- plan asociado y ningún cupo se aplicaba. Esta migración les da respaldo en
-- la base de datos.
-- ---------------------------------------------------------------------------

-- Las clínicas que ya existían son cuentas creadas a mano por la plataforma,
-- no prospectos en prueba: se les asigna el plan más alto y estado activo
-- para no cortarles el servicio al aplicar los cupos. Los DEFAULT de las
-- columnas ('trial'/'TRIALING') rigen solo para los registros nuevos.
ALTER TABLE "Tenant" ADD COLUMN "planSlug" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "Tenant" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIALING';
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "onboardingStep" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

UPDATE "Tenant"
SET "planSlug" = 'cadenas',
    "subscriptionStatus" = 'ACTIVE',
    "onboardingCompletedAt" = "createdAt";

-- Consumo que no tiene otra fuente de verdad. Las citas del mes se cuentan
-- directo en "Appointment": llevarlas también aquí abriría la puerta a que el
-- contador y la realidad se separen tras un borrado o un reagendado.
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageCounter_tenantId_metric_period_key"
    ON "UsageCounter"("tenantId", "metric", "period");

CREATE INDEX "UsageCounter_tenantId_period_idx"
    ON "UsageCounter"("tenantId", "period");

ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
