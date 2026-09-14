/**
 * Utilidades de formato de la UI clínica.
 *
 * Reglas de dominio (AGENTS.md):
 *  - Teléfonos en formato canónico E.164 `+52XXXXXXXXXX` y presentación visual `+52 (XX) XXXX-XXXX`.
 *  - Montos en pesos mexicanos (MXN).
 *  - Fechas y horas siempre presentadas en `America/Mexico_City`, nunca en la zona del navegador.
 */

export const MEXICO_CITY_TIMEZONE = 'America/Mexico_City';

/**
 * Formatea un teléfono mexicano para mostrarlo en la UI.
 * Acepta números ya normalizados (`+525512345678`), de 10 dígitos (`5512345678`)
 * o con separadores. Si no es reconocible, devuelve el texto limpio tal cual
 * (nunca inventa dígitos).
 */
export function formatMexicanPhone(phone?: string | null): string {
  if (!phone) return '';
  const clean = phone.trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) {
    return `+52 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
  }
  if (digits.length === 10) {
    return `+52 (${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  return clean;
}

/** Formatea un monto en pesos mexicanos: 850 -> "$850 MXN". */
export function formatMxn(amount?: number | null): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `$${value.toLocaleString('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} MXN`;
}

/** Hora local de CDMX en formato 12 h: "4:00 PM". Devuelve '' si la fecha es inválida. */
export function formatMexicoCityTime(value?: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-MX', {
    timeZone: MEXICO_CITY_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Fecha local de CDMX: "miércoles, 10 de septiembre". */
export function formatMexicoCityDate(value?: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', {
    timeZone: MEXICO_CITY_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Fecha corta de CDMX: "10 sep". */
export function formatMexicoCityDateShort(value?: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', {
    timeZone: MEXICO_CITY_TIMEZONE,
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Clave de fecha (YYYY-MM-DD) del día de hoy en CDMX.
 * No usar `toISOString()`: después de las 18:00 hora local devuelve el día siguiente.
 */
export function todayInMexicoCity(): string {
  return toMexicoCityDateKey(new Date());
}

/** Convierte una fecha al formato de clave YYYY-MM-DD en zona CDMX. */
export function toMexicoCityDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MEXICO_CITY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts;
}

/** Suma días a una clave YYYY-MM-DD sin depender de la zona del navegador. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const base = Date.UTC(year, month - 1, day, 12, 0, 0);
  const shifted = new Date(base + days * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * Formatea una clave YYYY-MM-DD (fecha ya localizada en CDMX) como "10 sep".
 * Usa mediodía UTC para evitar el clásico desfase de un día al parsear
 * `new Date('YYYY-MM-DD')` en zonas con offset negativo.
 */
export function formatDateKeyShort(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** Formatea una clave YYYY-MM-DD como "10 de septiembre". */
export function formatDateKeyLong(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
