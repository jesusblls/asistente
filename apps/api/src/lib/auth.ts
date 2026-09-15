import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { randomBytes } from 'node:crypto';
import { db } from '@asistente/database';
import { createLogger } from '@asistente/observability';

const logger = createLogger('auth');

export const AUTH_COOKIE_NAME = 'asistente_session';

/**
 * Por defecto la cookie es "Secure" en producción, pero un VPS recién
 * levantado sin dominio todavía sirve por HTTP plano (Caddy en `:80`, ver
 * deploy/Caddyfile) — un navegador real descarta silenciosamente cualquier
 * cookie Secure sobre HTTP, así que el login parecería fallar sin ningún
 * error visible. COOKIE_SECURE permite desactivarlo explícitamente durante
 * esa fase y se reactiva solo al pasar a `true` (o quitando la variable) en
 * cuanto haya dominio + HTTPS.
 */
function resolveCookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export function getAuthCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: resolveCookieSecure(),
    sameSite: 'lax' as const,
    maxAge: 12 * 60 * 60, // 12h en segundos
  };
}

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

/**
 * Resuelve el secreto de firma de sesiones.
 * En producción es obligatorio; en desarrollo se genera uno efímero para no
 * depender de un secreto hardcodeado en el repositorio.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres');
  }

  logger.warn(
    'JWT_SECRET no configurado (o menor a 32 caracteres). Se generó un secreto efímero: las sesiones se invalidarán al reiniciar el servidor.'
  );
  return randomBytes(32).toString('hex');
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: resolveJwtSecret(),
    sign: { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    let claims: AuthUser;
    try {
      const cookieToken = request.cookies?.[AUTH_COOKIE_NAME];
      if (cookieToken) {
        claims = app.jwt.verify<AuthUser>(cookieToken);
      } else {
        await request.jwtVerify();
        claims = request.user as AuthUser;
      }
    } catch {
      return reply.status(401).send({ error: 'No autenticado' });
    }

    // El token vive 12 h, así que la firma por sí sola no basta: dar de baja a
    // un empleado o desactivar una clínica debe cortar el acceso en la
    // siguiente petición, no cuando caduque el token. El rol también se relee,
    // para que degradar a alguien surta efecto de inmediato.
    const user = await db.user.findFirst({
      where: {
        id: claims.userId,
        tenantId: claims.tenantId,
        isActive: true,
        tenant: { isActive: true },
      },
      select: { id: true, tenantId: true, role: true, email: true },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Sesión inválida' });
    }

    request.authUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
  });
}
