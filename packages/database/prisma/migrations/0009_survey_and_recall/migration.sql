-- ---------------------------------------------------------------------------
-- Encuesta después de la cita y recordatorio de revisión periódica.
--
-- La encuesta mide cómo le fue al paciente (y avisa a tiempo de un paciente
-- inconforme); el recordatorio semestral trae de vuelta a quien ya no agendó
-- su siguiente limpieza. Ambos se pueden apagar por clínica.
-- ---------------------------------------------------------------------------

ALTER TABLE "Tenant" ADD COLUMN "surveyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "recallMonths" INTEGER DEFAULT 6;

ALTER TABLE "Appointment" ADD COLUMN "surveySentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "surveyScore" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "surveyAnsweredAt" TIMESTAMP(3);

ALTER TABLE "Patient" ADD COLUMN "recallSentAt" TIMESTAMP(3);
