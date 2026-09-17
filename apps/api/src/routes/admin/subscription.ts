import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, getPlanSummary } from '@asistente/database';
import { SubscriptionService } from '@asistente/ai-agent';
import {
  PLANES_CONTRATABLES,
  PLANS,
  esPlanContratable,
  importeDelCiclo,
  type BillingCycle,
} from '@asistente/shared-types';
import { actorFromRequest } from '../../lib/audit.js';
import { HttpError, requireAuthUser, requireEnum, requireRole } from '../../lib/http.js';

/**
 * Contratación y cancelación de la suscripción de la clínica.
 *
 * La plataforma nunca recibe datos de tarjeta: se crea la suscripción en
 * Mercado Pago y se devuelve el `init_point`, su página alojada, donde ocurre
 * la captura. Aquí solo viajan el plan y el correo de quien contrata.
 */

const checkoutSchema = {
  body: {
    type: 'object',
    required: ['planSlug', 'billingCycle'],
    properties: {
      planSlug: { type: 'string', enum: PLANES_CONTRATABLES as unknown as string[] },
      billingCycle: { type: 'string', enum: ['MONTHLY', 'ANNUAL'] },
    },
    additionalProperties: false,
  },
};

/**
 * A dónde regresa Mercado Pago tras autorizar. Se resuelve del entorno para no
 * quemar la URL, igual que el resto de las integraciones.
 */
function resolveBackUrl(): string {
  const base = (process.env.APP_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/dashboard/suscripcion?estado=autorizada`;
}

export async function subscriptionRoutes(fastify: FastifyInstance) {
  /** Plan contratado, consumo y catálogo con los importes de cada ciclo. */
  fastify.get('/api/subscription', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuthUser(request);
    const resumen = await getPlanSummary(user.tenantId);

    return reply.send({
      ...resumen,
      catalogo: PLANES_CONTRATABLES.map((slug) => {
        const plan = PLANS[slug];
        return {
          ...plan,
          importeMensual: importeDelCiclo(plan, 'MONTHLY'),
          importeAnual: importeDelCiclo(plan, 'ANNUAL'),
        };
      }),
    });
  });

  /**
   * Crea la suscripción en Mercado Pago y devuelve el link de autorización.
   *
   * No activa nada: el plan se activa cuando Mercado Pago confirma el primer
   * cobro por webhook. Crear el link no es haber cobrado.
   */
  fastify.post(
    '/api/subscription/checkout',
    { schema: checkoutSchema, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireRole(request, ['ADMIN']);
      const user = requireAuthUser(request);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const planSlug = String(body.planSlug);
      if (!esPlanContratable(planSlug)) {
        throw new HttpError(400, 'Ese plan no se puede contratar');
      }
      const billingCycle = requireEnum(
        body.billingCycle,
        ['MONTHLY', 'ANNUAL'] as const,
        'Ciclo de facturación'
      ) as BillingCycle;

      // El correo del administrador que contrata es el pagador ante Mercado
      // Pago; no se pide aparte para no capturar un dato que ya se tiene.
      const cuenta = await db.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId, isActive: true },
        select: { email: true },
      });
      if (!cuenta) throw new HttpError(401, 'Sesión inválida');

      const resultado = await SubscriptionService.createCheckout({
        tenantId: user.tenantId,
        planSlug,
        billingCycle,
        payerEmail: cuenta.email,
        backUrl: resolveBackUrl(),
        auditActor: actorFromRequest(request),
      });

      return reply.send(resultado);
    }
  );

  /**
   * Cancela la renovación automática.
   *
   * El acceso sigue vigente hasta el fin del periodo ya pagado: se responde con
   * esa fecha para poder decírselo con claridad a la clínica.
   */
  fastify.post(
    '/api/subscription/cancel',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireRole(request, ['ADMIN']);
      const user = requireAuthUser(request);

      await SubscriptionService.cancel(user.tenantId, actorFromRequest(request));

      const tenant = await db.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { currentPeriodEnd: true },
      });

      return reply.send({
        cancelada: true,
        accesoHasta: tenant.currentPeriodEnd?.toISOString() ?? null,
      });
    }
  );

  /**
   * Reintenta reactivar una suscripción en morosidad trasfondear la tarjeta.
   */
  fastify.post(
    '/api/subscription/retry',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireRole(request, ['ADMIN']);
      const user = requireAuthUser(request);

      const resultado = await SubscriptionService.retryPayment(
        user.tenantId,
        actorFromRequest(request)
      );

      return reply.send(resultado);
    }
  );

  /**
   * Historial de cargos y cobros periódicos de la clínica.
   */
  fastify.get('/api/subscription/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuthUser(request);
    const cargos = await SubscriptionService.getChargesHistory(user.tenantId);

    return reply.send({
      cargos: cargos.map((c) => ({
        id: c.id,
        amountMxn: c.amountMxn,
        status: c.status,
        statusDetail: c.statusDetail,
        failureReason: c.failureReason,
        paymentMethod: c.paymentMethod,
        lastFourDigits: c.lastFourDigits,
        periodStart: c.periodStart?.toISOString() ?? null,
        periodEnd: c.periodEnd?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  });
}
