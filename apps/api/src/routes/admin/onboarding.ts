import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, recordAudit } from '@asistente/database';
import { actorFromRequest } from '../../lib/audit.js';
import { HttpError, requireAuthUser, requireEnum, requireRole } from '../../lib/http.js';

/**
 * Asistente de configuración inicial.
 *
 * Una clínica recién registrada nace sin doctores, horarios, precios ni
 * preguntas frecuentes. Si entrara al panel y conectara WhatsApp en ese
 * estado, el agente atendería pacientes reales sin nada que consultar: no
 * podría ofrecer un solo horario ni cotizar un tratamiento. Por eso el alta
 * deja `onboardingStep` marcado y el panel lleva a este flujo hasta
 * completarlo.
 */

/** Pasos en orden. El último ('listo') solo se marca al terminar. */
export const ONBOARDING_STEPS = ['clinica', 'doctores', 'tratamientos', 'faqs', 'listo'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const onboardingSchema = {
  body: {
    type: 'object',
    required: ['step'],
    properties: {
      step: { type: 'string', enum: ONBOARDING_STEPS as unknown as string[] },
      completed: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

export async function onboardingRoutes(fastify: FastifyInstance) {
  /** Estado actual del asistente, con lo que ya lleva capturado la clínica. */
  fastify.get('/api/onboarding', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuthUser(request);

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        phoneE164: true,
        address: true,
        welcomeMessage: true,
        emergencyInstructions: true,
        onboardingStep: true,
        onboardingCompletedAt: true,
      },
    });

    const [doctors, services, faqs] = await Promise.all([
      db.doctor.count({ where: { tenantId: user.tenantId, isActive: true } }),
      db.service.count({ where: { tenantId: user.tenantId, isActive: true } }),
      db.faqItem.count({ where: { tenantId: user.tenantId } }),
    ]);

    return reply.send({
      tenant,
      step: tenant.onboardingStep,
      completedAt: tenant.onboardingCompletedAt?.toISOString() ?? null,
      progress: { doctors, services, faqs },
    });
  });

  /** Guarda el avance, o cierra el asistente. */
  fastify.patch(
    '/api/onboarding',
    { schema: onboardingSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireRole(request, ['ADMIN']);
      const user = requireAuthUser(request);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const step = requireEnum(body.step, ONBOARDING_STEPS, 'Paso');
      const completed = body.completed === true;

      if (completed) {
        // No se puede dar por terminado sin lo mínimo que el agente necesita
        // para atender: un especialista con horario y un tratamiento con
        // precio. Sin eso, "terminado" sería una mentira que el paciente
        // descubre en la primera llamada.
        const [doctors, services] = await Promise.all([
          db.doctor.count({ where: { tenantId: user.tenantId, isActive: true } }),
          db.service.count({ where: { tenantId: user.tenantId, isActive: true } }),
        ]);

        if (doctors === 0) {
          throw new HttpError(400, 'Registra al menos un especialista antes de terminar');
        }
        if (services === 0) {
          throw new HttpError(400, 'Registra al menos un tratamiento antes de terminar');
        }
      }

      const updated = await db.$transaction(async (tx) => {
        const row = await tx.tenant.update({
          where: { id: user.tenantId },
          data: {
            onboardingStep: completed ? null : step,
            ...(completed && { onboardingCompletedAt: new Date() }),
          },
          select: { onboardingStep: true, onboardingCompletedAt: true },
        });

        if (completed) {
          await recordAudit(
            {
              tenantId: user.tenantId,
              actor: actorFromRequest(request),
              action: 'UPDATE',
              entityType: 'TENANT',
              entityId: user.tenantId,
              metadata: { onboarding: 'COMPLETADO' },
            },
            tx
          );
        }

        return row;
      });

      return reply.send({
        step: updated.onboardingStep,
        completedAt: updated.onboardingCompletedAt?.toISOString() ?? null,
      });
    }
  );
}
