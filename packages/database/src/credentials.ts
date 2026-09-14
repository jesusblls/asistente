import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de `ChannelConfig.credentials` (tokens de WhatsApp, Twilio y demás
 * credenciales por clínica).
 *
 * Los tokens no pueden vivir en claro en la base: quien obtenga un respaldo
 * (o una copia del archivo SQLite) leería las credenciales de todas las
 * clínicas. El valor almacenado es `enc:v1:<base64(iv | tag | cuerpo)>` con
 * AES-256-GCM; el prefijo numera el esquema para poder rotar la llave sin
 * adivinar el formato: un cambio de algoritmo introduce `enc:v2:` y ambos
 * conviven mientras se re-cifra (ver `rotate-credentials.ts`).
 *
 * La llave vive fuera de la base, en `CREDENTIALS_ENCRYPTION_KEY` (32 bytes en
 * base64). Si falta:
 *  - en producción, guardar credenciales falla en cerrado;
 *  - en desarrollo se guarda en claro y se avisa una vez. Las filas legadas en
 *    claro también se siguen leyendo (migración perezosa).
 */
const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

let missingKeyWarned = false;

function resolveKey(override?: string): Buffer | null {
  const raw = override ?? process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) return null;

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY debe tener 32 bytes codificados en base64');
  }
  return key;
}

/** ¿El valor almacenado está cifrado, o es una fila legada en claro? */
export function isEncryptedCredential(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/**
 * Cifra un JSON de credenciales para guardarlo en `ChannelConfig.credentials`.
 * `keyBase64` permite usar una llave explícita (rotación); por defecto se usa
 * la variable de entorno.
 */
export function encryptCredentials(plaintext: string, keyBase64?: string): string {
  const key = resolveKey(keyBase64);
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY es obligatoria para guardar credenciales de canal en producción'
      );
    }
    if (!missingKeyWarned) {
      missingKeyWarned = true;
      console.warn(
        '⚠️ CREDENTIALS_ENCRYPTION_KEY no configurada: las credenciales de canal se guardarán en claro. Genera una con `openssl rand -base64 32`.'
      );
    }
    return plaintext;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

/**
 * Descifra un valor almacenado. Las filas legadas en claro se devuelven tal
 * cual: se cifran al primer re-guardado o con el script de rotación.
 */
export function decryptCredentials(stored: string, keyBase64?: string): string {
  if (!isEncryptedCredential(stored)) return stored;

  const key = resolveKey(keyBase64);
  if (!key) {
    throw new Error('Hay credenciales cifradas pero falta CREDENTIALS_ENCRYPTION_KEY');
  }

  const blob = Buffer.from(stored.slice(PREFIX.length), 'base64');
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Credenciales cifradas corruptas');
  }

  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = blob.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
