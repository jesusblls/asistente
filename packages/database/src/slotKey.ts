/**
 * Clave del horario que ocupa una cita, usada por el índice único
 * `Appointment.slotKey` como candado contra dobles reservas.
 *
 * La comprobación de traslape del `SchedulerService` corre dentro de una
 * transacción, pero SQLite y Postgres permiten que dos transacciones lean
 * "horario libre" antes de que cualquiera inserte. El índice único cierra esa
 * ventana: la segunda inserción falla con P2002 en vez de duplicar la cita.
 *
 * Se devuelve `null` para las citas canceladas, porque los NULL no colisionan
 * entre sí en un índice único: el horario vuelve a quedar disponible.
 */
export function appointmentSlotKey(params: {
  doctorId: string;
  startTime: Date;
  status: string;
}): string | null {
  if (params.status === 'CANCELLED') return null;
  return `${params.doctorId}|${params.startTime.toISOString()}`;
}
