/**
 * Utilidades de dinero en pesos mexicanos.
 *
 * El esquema usa `Float` por compatibilidad con SQLite, así que todos los
 * montos se normalizan a 2 decimales en los bordes de escritura para evitar
 * arrastrar errores de punto flotante (p. ej. 199.99999999).
 */

export function roundMxn(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Convierte pesos a centavos enteros (útil para comparaciones exactas). */
export function mxnToCents(value: number): number {
  return Math.round(roundMxn(value) * 100);
}
