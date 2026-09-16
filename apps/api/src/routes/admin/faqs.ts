import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, diffChanges, recordAudit } from '@asistente/database';
import { actorFromRequest } from '../../lib/audit.js';
import {
  optionalString,
  requireAuthUser,
  requireRole,
  requireString,
  resolveTenantId,
} from '../../lib/http.js';
import { createFaqSchema, updateFaqSchema } from './schemas.js';

/**
 * Preguntas frecuentes de la clínica.
 *
 * El agente las consulta con la herramienta `consultar_faq_clinica`, así que
 * son literalmente el guion con el que contesta lo que no está en la agenda:
 * estacionamiento, aseguradoras, formas de pago, cuidados posoperatorios. El
 * modelo existía y el seed las llenaba, pero no había forma de administrarlas
 * desde el panel: una clínica nueva se quedaba sin ninguna, y el asistente
 * respondía esas preguntas con lo que se le ocurriera.
 */
export async function faqRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tenants/:id/faqs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = resolveTenantId(request, id);

    const items = await db.faqItem.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
    });

    return reply.send(items);
  });

  fastify.post(
    '/api/tenants/:id/faqs',
    { schema: createFaqSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      requireRole(request, ['ADMIN']);
      const tenantId = resolveTenantId(request, id);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const question = requireString(body.question, 'Pregunta', 500);
      const answer = requireString(body.answer, 'Respuesta', 2000);

      const created = await db.$transaction(async (tx) => {
        const row = await tx.faqItem.create({
          data: {
            tenantId,
            question,
            answer,
            category: optionalString(body.category, 'Categoría', 120) || 'General',
            keywords: optionalString(body.keywords, 'Palabras clave', 500) || null,
          },
        });

        await recordAudit(
          {
            tenantId,
            actor: actorFromRequest(request),
            action: 'CREATE',
            entityType: 'FAQ_ITEM',
            entityId: row.id,
            metadata: { question },
          },
          tx
        );

        return row;
      });

      return reply.status(201).send(created);
    }
  );

  fastify.patch(
    '/api/faqs/:id',
    { schema: updateFaqSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      requireRole(request, ['ADMIN']);
      const user = requireAuthUser(request);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const faq = await db.faqItem.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!faq) return reply.status(404).send({ error: 'Pregunta no encontrada' });

      const data = {
        ...(body.question !== undefined && {
          question: requireString(body.question, 'Pregunta', 500),
        }),
        ...(body.answer !== undefined && { answer: requireString(body.answer, 'Respuesta', 2000) }),
        ...(body.category !== undefined && {
          category: optionalString(body.category, 'Categoría', 120) || 'General',
        }),
        ...(body.keywords !== undefined && {
          keywords: optionalString(body.keywords, 'Palabras clave', 500) || null,
        }),
      };

      const updated = await db.$transaction(async (tx) => {
        const row = await tx.faqItem.update({ where: { id }, data });

        await recordAudit(
          {
            tenantId: user.tenantId,
            actor: actorFromRequest(request),
            action: 'UPDATE',
            entityType: 'FAQ_ITEM',
            entityId: id,
            changes: diffChanges(faq, data),
          },
          tx
        );

        return row;
      });

      return reply.send(updated);
    }
  );

  fastify.delete('/api/faqs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const user = requireAuthUser(request);

    const faq = await db.faqItem.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!faq) return reply.status(404).send({ error: 'Pregunta no encontrada' });

    await db.$transaction(async (tx) => {
      await tx.faqItem.delete({ where: { id } });

      await recordAudit(
        {
          tenantId: user.tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'FAQ_ITEM',
          entityId: id,
          metadata: { question: faq.question },
        },
        tx
      );
    });

    return reply.send({ success: true });
  });
}
