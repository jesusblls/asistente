import { FastifyRequest } from 'fastify';
import { HttpError, requireRole } from '../../lib/http.js';

export function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} es obligatorio`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field} no es una fecha válida`);
  }
  return date;
}

export function parseJsonField(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export interface PlatformAdminOptions {
  /**
   * Exige PLATFORM_ADMIN_EMAILS en todo entorno. Sin `strict`, en desarrollo
   * una lista vacía deja pasar a cualquier ADMIN (cómodo para dar de alta
   * clínicas en local); las vistas que cruzan datos de varias clínicas no
   * pueden permitírselo, porque el ADMIN de una vería pacientes de otras.
   */
  strict?: boolean;
  deniedMessage?: string;
}

export function requirePlatformAdmin(request: FastifyRequest, options: PlatformAdminOptions = {}): void {
  const user = requireRole(request, ['ADMIN']);
  const allowList = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const deniedMessage = options.deniedMessage ?? 'Solo un administrador de plataforma puede crear clínicas';

  if (allowList.length === 0) {
    if (options.strict) throw new HttpError(403, deniedMessage);
    if (process.env.NODE_ENV === 'production') {
      throw new HttpError(403, 'La creación de clínicas requiere configurar PLATFORM_ADMIN_EMAILS');
    }
    return;
  }

  if (!allowList.includes(user.email.toLowerCase())) {
    throw new HttpError(403, deniedMessage);
  }
}
