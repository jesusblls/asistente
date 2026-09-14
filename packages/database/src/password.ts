import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const PREFIX = 'scrypt';

/**
 * Hash inservible contra el que se compara cuando el correo no existe, para que
 * un login fallido cueste lo mismo exista o no la cuenta. Sin esto, la
 * diferencia de tiempo delata qué correos están dados de alta.
 */
const DUMMY_HASH = `${PREFIX}$${'0'.repeat(32)}$${'0'.repeat(KEY_LENGTH * 2)}`;

/**
 * Genera un hash de contraseña con scrypt y salt aleatorio.
 * Formato almacenado: scrypt$<saltHex>$<hashHex>
 *
 * Es asíncrono a propósito: `scryptSync` bloquea el hilo principal ~100 ms por
 * llamada, así que un puñado de logins simultáneos congela toda la API.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, KEY_LENGTH)).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}

/**
 * Verifica una contraseña contra el hash almacenado en tiempo constante.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;

  const [, salt, hash] = parts;
  if (!salt || !hash) return false;

  try {
    const expected = Buffer.from(hash, 'hex');
    const actual = await scryptAsync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Consume el mismo tiempo que una verificación real y siempre falla.
 * Se usa en el login cuando no se encontró usuario.
 */
export async function burnPasswordTiming(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
