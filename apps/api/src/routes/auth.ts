import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, verifyPassword, burnPasswordTiming } from '@asistente/database';
import { HttpError, requireString } from '../lib/http.js';

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Inicio de sesión del personal de la clínica.
   */
  fastify.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
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
        throw new HttpError(401, 'Credenciales inválidas');
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      });

      return reply.send({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: user.tenant,
      });
    }
  );

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
