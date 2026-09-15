import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, verifyPassword, burnPasswordTiming, recordAudit } from '@asistente/database';
import { HttpError, requireString } from '../lib/http.js';
import { actorFromRequest } from '../lib/audit.js';
import { AUTH_COOKIE_NAME, getAuthCookieOptions, type AuthUser } from '../lib/auth.js';

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', minLength: 1, maxLength: 200 },
      password: { type: 'string', minLength: 1, maxLength: 200 },
      tenantSlug: { type: 'string', maxLength: 100 },
    },
    additionalProperties: false,
  },
};

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Inicio de sesión del personal de la clínica.
   */
  fastify.post(
    '/auth/login',
    {
      schema: loginSchema,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const email = requireString(body.email, 'Email', 200).toLowerCase();
      const password = requireString(body.password, 'Contraseña', 200);
      const tenantSlug =
        typeof body.tenantSlug === 'string' && body.tenantSlug.trim()
          ? body.tenantSlug.trim().toLowerCase()
          : undefined;

      const users = await db.user.findMany({
        where: {
          email,
          isActive: true,
          tenant: { isActive: true, ...(tenantSlug ? { slug: tenantSlug } : {}) },
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
        },
        take: 2,
      });

      // Si el correo existe en más de una clínica, se exige tenantSlug.
      const user = users.length === 1 ? users[0] : undefined;
      const passwordOk = user
        ? await verifyPassword(password, user.passwordHash)
        : await burnPasswordTiming(password);

      if (!user || !passwordOk) {
        // Se registra aunque no haya clínica atribuible: los intentos fallidos
        // repetidos contra un mismo correo son la huella de la fuerza bruta.
        // El motivo queda solo en la auditoría; al cliente siempre se le
        // responde lo mismo para no delatar qué cuentas existen.
        await recordAudit({
          tenantId: user?.tenantId ?? null,
          actor: { ...actorFromRequest(request), email },
          action: 'LOGIN_FAILED',
          entityType: 'SESSION',
          entityId: user?.id ?? null,
          metadata: {
            reason:
              users.length > 1 ? 'AMBIGUOUS_TENANT' : user ? 'BAD_PASSWORD' : 'NO_MATCHING_USER',
          },
        });
        throw new HttpError(401, 'Credenciales inválidas');
      }

      await recordAudit({
        tenantId: user.tenantId,
        actor: {
          ...actorFromRequest(request),
          type: 'USER',
          id: user.id,
          email: user.email,
          role: user.role,
        },
        action: 'LOGIN',
        entityType: 'SESSION',
        entityId: user.id,
      });

      const token = fastify.jwt.sign({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      });

      reply.setCookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

      return reply.send({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: user.tenant,
      });
    }
  );

  /**
   * Cierre de sesión: invalida la cookie de sesión y registra el evento de auditoría.
   */
  fastify.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    let claims: AuthUser | undefined;
    try {
      const cookieToken = request.cookies?.[AUTH_COOKIE_NAME];
      if (cookieToken) {
        claims = fastify.jwt.verify<AuthUser>(cookieToken);
      } else if (request.headers.authorization) {
        await request.jwtVerify();
        claims = request.user as AuthUser;
      }
    } catch {
      // Ignorar error de verificación si el token ya expiró o no es válido
    }

    if (claims) {
      await recordAudit({
        tenantId: claims.tenantId,
        actor: {
          ...actorFromRequest(request),
          type: 'USER',
          id: claims.userId,
          email: claims.email,
          role: claims.role,
        },
        action: 'LOGOUT',
        entityType: 'SESSION',
        entityId: claims.userId,
      });
    }

    reply.clearCookie(AUTH_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return reply.send({ ok: true });
  });

  /**
   * Datos de la sesión actual.
   */
  fastify.get('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authUser!;
    const user = await db.user.findFirst({
      where: { id: auth.userId, tenantId: auth.tenantId, isActive: true },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });

    if (!user) throw new HttpError(401, 'Sesión inválida');

    return reply.send({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: user.tenant,
    });
  });
}
