export { LEGAL_VERSION } from '@asistente/shared-types';

/**
 * Datos de identidad del responsable que exige la LFPDPPP en el aviso de
 * privacidad. Van vacíos a propósito: no se deben inventar. Mientras falte
 * alguno, /privacidad y /terminos muestran un aviso de documento incompleto
 * y el dato faltante resaltado, en vez de publicar un domicilio o una razón
 * social ficticios como si fueran reales.
 *
 * Al cambiar el texto de los documentos (no solo estos datos), sube
 * LEGAL_VERSION en packages/shared-types.
 */
export const LEGAL_ENTITY = {
  /** Razón social completa, ej. "Nombre Comercial, S.A.P.I. de C.V." */
  razonSocial: '',
  /** Domicilio fiscal completo para oír y recibir notificaciones. */
  domicilio: '',
  /** Buzón para solicitudes ARCO y dudas de privacidad. */
  correoPrivacidad: '',
};

export const LEGAL_ENTITY_COMPLETE = Object.values(LEGAL_ENTITY).every((value) => value.trim() !== '');

/** Fecha de la versión vigente, en palabras, para el encabezado de los documentos. */
export function legalVersionLabel(version: string): string {
  const [year, month, day] = version.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  });
}
