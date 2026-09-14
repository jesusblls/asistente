-- Candado de doble reserva a nivel de base de datos.
--
-- La verificación de traslape de `SchedulerService` corre dentro de una
-- transacción, pero dos reservas simultáneas pueden leer "horario libre" antes
-- de que cualquiera inserte. Este índice único cierra la ventana: la segunda
-- inserción falla con P2002 y la aplicación responde "ese horario acaba de ser
-- reservado" en lugar de duplicar la cita.
--
-- Las citas canceladas llevan NULL (los NULL no colisionan entre sí en un
-- índice único), de modo que el horario vuelve a quedar libre para reagendar.

ALTER TABLE "Appointment" ADD COLUMN "slotKey" TEXT;

-- Backfill de las citas vigentes. `startTime` se almacena como epoch en
-- milisegundos, así que se reconstruye el mismo ISO 8601 que genera
-- `Date.toISOString()` en `appointmentSlotKey()`.
--
-- Si los datos actuales ya contienen dos citas del mismo doctor a la misma
-- hora, solo se marca una: así la migración no falla y el invariante queda
-- vigente de aquí en adelante.
UPDATE "Appointment"
SET "slotKey" =
      "doctorId" || '|' ||
      strftime('%Y-%m-%dT%H:%M:%S', "startTime" / 1000, 'unixepoch') || '.' ||
      substr('00' || ("startTime" % 1000), -3) || 'Z'
WHERE "status" <> 'CANCELLED'
  AND "id" IN (
    SELECT MIN("id")
    FROM "Appointment"
    WHERE "status" <> 'CANCELLED'
    GROUP BY "doctorId", "startTime"
  );

CREATE UNIQUE INDEX "Appointment_slotKey_key" ON "Appointment"("slotKey");
