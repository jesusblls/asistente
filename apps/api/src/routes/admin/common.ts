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

export function requirePlatformAdmin(request: FastifyRequest): void {
  const user = requireRole(request, ['ADMIN']);
  const allowList = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new HttpError(403, 'La creación de clínicas requiere configurar PLATFORM_ADMIN_EMAILS');
    }
    return;
  }

  if (!allowList.includes(user.email.toLowerCase())) {
    throw new HttpError(403, 'Solo un administrador de plataforma puede crear clínicas');
  }
}
