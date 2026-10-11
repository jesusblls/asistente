-- ---------------------------------------------------------------------------
-- Portal público de citas: el paciente agenda solo en /agenda/<slug>.
-- Activo por defecto (solo se publica una clínica con onboarding terminado);
-- cada clínica lo puede apagar en Ajustes.
-- ---------------------------------------------------------------------------

ALTER TABLE "Tenant" ADD COLUMN "publicBookingEnabled" BOOLEAN NOT NULL DEFAULT true;
