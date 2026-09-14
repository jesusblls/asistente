import { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@asistente/database';
import { normalizeMexicanPhone } from '@asistente/ai-agent';
import { AuthUser } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Captura el cuerpo JSON crudo (necesario para validar firmas HMAC de Meta).
 */
export function registerRawJsonBody(app: FastifyInstance): void {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
}

export function requireAuthUser(request: FastifyRequest): AuthUser {
  if (!request.authUser) {
    throw new HttpError(401, 'No autenticado');
  }
  return request.authUser;
}

/**
 * Valida que el recurso solicitado pertenezca a la clínica del usuario autenticado.
 * Si no se recibe tenantId, se usa el del token (nunca se permite "todas las clínicas").
 */
export function resolveTenantId(request: FastifyRequest, requestedTenantId?: string | null): string {
  const user = requireAuthUser(request);
  if (requestedTenantId && requestedTenantId !== user.tenantId) {
    throw new HttpError(403, 'No tienes acceso a esta clínica');
  }
  return user.tenantId;
}

export function requireRole(request: FastifyRequest, roles: string[]): AuthUser {
  const user = requireAuthUser(request);
  if (!roles.includes(user.role)) {
    throw new HttpError(403, 'Tu rol no tiene permisos para esta operación');
  }
  return user;
}

export function requireString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} es obligatorio`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} excede la longitud máxima permitida`);
  }
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLength = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} debe ser texto`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} excede la longitud máxima permitida`);
  }
  return trimmed;
}

export function requireNumber(value: unknown, field: string, opts?: { min?: number; max?: number }): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) throw new HttpError(400, `${field} debe ser numérico`);
  if (opts?.min !== undefined && num < opts.min) {
    throw new HttpError(400, `${field} debe ser mayor o igual a ${opts.min}`);
  }
  if (opts?.max !== undefined && num > opts.max) {
    throw new HttpError(400, `${field} debe ser menor o igual a ${opts.max}`);
  }
  return num;
}

/**
 * Límite de página acotado. Sin él, un listado de una clínica con un año de
 * operación devuelve decenas de miles de registros con relaciones anidadas en
 * cada refresco del panel.
 */
export function parseLimit(value: unknown, defaultLimit: number, maxLimit: number): number {
  if (value === undefined || value === null || value === '') return defaultLimit;
  const limit = Math.floor(requireNumber(value, 'limit', { min: 1, max: maxLimit }));
  return limit;
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpError(400, `${field} inválido. Valores permitidos: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function requireMexicanPhone(value: unknown, field = 'Teléfono'): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} es obligatorio`);
  }
  const normalized = normalizeMexicanPhone(value);
  if (!/^\+52\d{10}$/.test(normalized)) {
    throw new HttpError(400, `${field} inválido: se requiere un número mexicano E.164 (+52XXXXXXXXXX)`);
  }
  return normalized;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply.status(409).send({ error: 'El registro ya existe' });
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({ error: 'Recurso no encontrado' });
      }
      if (error.code === 'P2003') {
        return reply.status(400).send({ error: 'Referencia inválida en la solicitud' });
      }
      request.log.error({ err: error }, 'Prisma request error');
      return reply.status(500).send({ error: 'Error interno del servidor' });
    }

    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({ error: 'Datos de entrada inválidos' });
    }

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;

    request.log.error({ err: error }, 'Unhandled request error');
    return reply
      .status(statusCode)
      .send({ error: statusCode === 500 ? 'Error interno del servidor' : error.message });
  });
}
