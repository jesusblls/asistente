-- ---------------------------------------------------------------------------
-- Cita que sustituyó a otra al reagendar.
--
-- Al reagendar una cita con anticipo pendiente, el paciente ya tenía un link
-- de pago con la cita vieja como referencia. Sin este vínculo, pagar con ese
-- link acreditaba una cita cancelada y la nueva se liberaba sola por falta de
-- anticipo. Sin llave foránea a propósito: igual que el resto de referencias
-- de pago, solo se usa para redirigir y no debe impedir borrar historial.
-- ---------------------------------------------------------------------------

ALTER TABLE "Appointment" ADD COLUMN "rescheduledToId" TEXT;
