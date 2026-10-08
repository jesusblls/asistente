import { FastifyRequest } from 'fastify';
import { HttpError, requireRole } from '../../lib/http.js';
import { isPlatformAdmin, platformAdminAllowList } from '../../lib/platformAdmin.js';

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

/**
 * Exige un administrador de plataforma (ver `lib/platformAdmin.ts`). `accion`
 * completa el mensaje: "Solo un administrador de plataforma puede <accion>".
 */
export function requirePlatformAdmin(request: FastifyRequest, accion = 'crear clínicas'): void {
  const user = requireRole(request, ['ADMIN']);

  if (platformAdminAllowList().length === 0 && process.env.NODE_ENV === 'production') {
    throw new HttpError(403, `Para ${accion} hay que configurar PLATFORM_ADMIN_EMAILS`);
  }

  if (!isPlatformAdmin(user)) {
    throw new HttpError(403, `Solo un administrador de plataforma puede ${accion}`);
  }
}
