import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  db,
  verifyPassword,
  burnPasswordTiming,
  hashPassword,
  recordAudit,
  resolveTenantPlan,
} from '@asistente/database';
import { TRIAL_DURATION_DAYS } from '@asistente/shared-types';
import { HttpError, requireString, requireMexicanPhone } from '../lib/http.js';
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

const registerSchema = {
  body: {
    type: 'object',
    required: ['clinicName', 'phoneE164', 'adminName', 'email', 'password'],
    properties: {
      clinicName: { type: 'string', minLength: 1, maxLength: 200 },
      phoneE164: { type: 'string', minLength: 1, maxLength: 30 },
      adminName: { type: 'string', minLength: 1, maxLength: 200 },
      email: { type: 'string', minLength: 3, maxLength: 200 },
      password: { type: 'string', minLength: 1, maxLength: 200 },
    },
    additionalProperties: false,
  },
};

/** Longitud mínima de contraseña para cuentas creadas desde la web. */
const MIN_PASSWORD_LENGTH = 10;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Alta autoservicio de una clínica con prueba gratuita.
   *
   * Es la única ruta pública que escribe en base de datos: hasta ahora no
   * existía forma de crear una cuenta sin que un administrador de plataforma
   * la diera de alta a mano, mientras la landing prometía una prueba de 14
   * días sin tarjeta. La clínica nace vacía y en `onboardingStep`, porque un
   * agente de IA sin doctores, horarios ni precios reales atendería pacientes
   * con datos inventados.
   */
  fastify.post(
    '/auth/register',
    {
      schema: registerSchema,
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const clinicName = requireString(body.clinicName, 'Nombre de la clínica', 200);
      const adminName = requireString(body.adminName, 'Tu nombre', 200);
      const phoneE164 = requireMexicanPhone(body.phoneE164, 'Teléfono de la clínica');
      const email = requireString(body.email, 'Email', 200).toLowerCase();
      const password = requireString(body.password, 'Contraseña', 200);

      if (!EMAIL_PATTERN.test(email)) {
        throw new HttpError(400, 'El correo electrónico no tiene un formato válido');
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new HttpError(
          400,
          `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
        );
      }

      // El correo debe ser único en toda la plataforma, no solo dentro de la
      // clínica: `/auth/login` resuelve la sesión por correo y exige
      // `tenantSlug` cuando encuentra más de uno. Permitir el duplicado aquí
      // dejaría a ambas cuentas sin poder entrar con el formulario normal.
      const existing = await db.user.findFirst({ where: { email }, select: { id: true } });
      if (existing) {
        throw new HttpError(409, 'Ya existe una cuenta con ese correo electrónico');
      }

      const baseSlug = clinicName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const slug = `${baseSlug || 'clinica'}-${Date.now().toString(36)}`;

      const passwordHash = await hashPassword(password);
      const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_DAYS * 86_400_000);

      const { tenant, user } = await db.$transaction(async (tx) => {
        const createdTenant = await tx.tenant.create({
          data: {
            name: clinicName,
            slug,
            phoneE164,
            timezone: 'America/Mexico_City',
            planSlug: 'trial',
            subscriptionStatus: 'TRIALING',
            trialEndsAt,
            onboardingStep: 'clinica',
            welcomeMessage: `¡Hola! Bienvenido a ${clinicName}. ¿En qué podemos apoyarte hoy?`,
          },
        });

        const createdUser = await tx.user.create({
          data: {
            tenantId: createdTenant.id,
            email,
            name: adminName,
            role: 'ADMIN',
            passwordHash,
          },
        });

        await recordAudit(
          {
            tenantId: createdTenant.id,
            actor: { ...actorFromRequest(request), email },
            action: 'CREATE',
            entityType: 'TENANT',
            entityId: createdTenant.id,
            metadata: { name: clinicName, slug, origin: 'SELF_SIGNUP', planSlug: 'trial' },
          },
          tx
        );

        return { tenant: createdTenant, user: createdUser };
      });

      const token = fastify.jwt.sign({
        userId: user.id,
        tenantId: tenant.id,
        role: user.role,
        email: user.email,
      });

      reply.setCookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

      return reply.status(201).send({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        trialEndsAt: trialEndsAt.toISOString(),
        onboardingStep: tenant.onboardingStep,
      });
    }
  );

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

    reply.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());

    return reply.send({ ok: true });
  });

  /**
   * Datos de la sesión actual.
   */
  fastify.get('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authUser!;
    const user = await db.user.findFirst({
      where: { id: auth.userId, tenantId: auth.tenantId, isActive: true },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            planSlug: true,
            subscriptionStatus: true,
            trialEndsAt: true,
            onboardingStep: true,
            onboardingCompletedAt: true,
          },
        },
      },
    });

    if (!user) throw new HttpError(401, 'Sesión inválida');

    // El panel necesita el estado de plan y onboarding en el mismo viaje que
    // la sesión: con ellos decide si manda al asistente de configuración o si
    // muestra el aviso de prueba por vencer, sin una segunda petición.
    const planState = resolveTenantPlan(user.tenant);

    return reply.send({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
      plan: {
        slug: planState.plan.slug,
        name: planState.plan.name,
        status: planState.status,
        trialEndsAt: planState.trialEndsAt?.toISOString() ?? null,
        trialDaysLeft: planState.trialDaysLeft,
        isSuspended: planState.isSuspended,
        limits: planState.limits,
      },
      onboarding: {
        step: user.tenant.onboardingStep,
        completedAt: user.tenant.onboardingCompletedAt?.toISOString() ?? null,
      },
    });
  });
}
