-- ---------------------------------------------------------------------------
-- Vencimiento y recordatorio de anticipos (No-Show Shield).
--
-- Hasta aquí una cita con anticipo pendiente apartaba el horario para
-- siempre: si el paciente nunca pagaba, nadie más podía tomar ese espacio.
--
-- `depositDeadlineAt`: hasta cuándo se espera el pago. Solo se llena cuando
--   el link de cobro se le envió al paciente de forma automática; las citas
--   que agenda recepción a mano (y las anteriores a esta migración) quedan en
--   NULL y el barrido nunca las cancela.
-- `depositReminderSentAt`: marca del único recordatorio de pago, para no
--   repetirlo aunque corran varias instancias del barrido a la vez.
-- ---------------------------------------------------------------------------

ALTER TABLE "Appointment" ADD COLUMN "depositDeadlineAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "depositReminderSentAt" TIMESTAMP(3);

CREATE INDEX "Appointment_paymentStatus_depositDeadlineAt_idx" ON "Appointment"("paymentStatus", "depositDeadlineAt");
