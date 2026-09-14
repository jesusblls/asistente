/**
 * Utilidades para normalización y validación de números telefónicos en México (+52)
 */

export function normalizeMexicanPhone(rawPhone: string): string {
  if (!rawPhone) return '';

  // Eliminar todos los caracteres no numéricos
  let digits = rawPhone.replace(/\D/g, '');

  // Caso: Inicia con 521 (antiguo formato móvil de WhatsApp en México) -> convertir a 52 + 10 dígitos
  if (digits.startsWith('521') && digits.length === 13) {
    digits = '52' + digits.slice(3);
  }

  // Caso: Inicia con prefijos locales antiguos de México (044 o 045)
  if (digits.startsWith('044') || digits.startsWith('045')) {
    digits = digits.slice(3);
  }

  // Caso: 10 dígitos nacionales (ej. 5512345678 o 3312345678 o 8112345678)
  if (digits.length === 10) {
    return `+52${digits}`;
  }

  // Caso: Ya incluye 52 y tiene 12 dígitos en total
  if (digits.startsWith('52') && digits.length === 12) {
    return `+${digits}`;
  }

  // Si ya tiene formato internacional con otro código de país (ej. +1, +34), retornar con +
  if (rawPhone.trim().startsWith('+')) {
    return `+${digits}`;
  }

  // Por defecto, retornar en formato E.164 si es de 10 dígitos
  return digits.length >= 10 ? `+52${digits.slice(-10)}` : `+${digits}`;
}

export function formatMexicanPhoneDisplay(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) {
    const area = digits.slice(2, 4); // ej: 55, 33, 81
    const part1 = digits.slice(4, 8);
    const part2 = digits.slice(8, 12);
    return `+52 (${area}) ${part1}-${part2}`;
  }
  return phoneE164;
}
