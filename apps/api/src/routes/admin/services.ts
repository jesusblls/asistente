import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, recordAudit } from '@asistente/database';
import { roundMxn } from '@asistente/ai-agent';
import { actorFromRequest } from '../../lib/audit.js';
import {
  optionalString,
  requireAuthUser,
  requireNumber,
  requireRole,
  requireString,
  resolveTenantId,
} from '../../lib/http.js';
import { createServiceSchema } from './schemas.js';

export async function serviceRoutes(fastify: FastifyInstance) {
  /**
   * Agrega un servicio a la clínica activa.
   */
  fastify.post(
    '/api/tenants/:id/services',
    { schema: createServiceSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      requireRole(request, ['ADMIN']);
      const tenantId = resolveTenantId(request, id);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const name = requireString(body.name, 'Nombre', 200);
      const durationMinutes = requireNumber(body.durationMinutes ?? 30, 'Duración', {
        min: 5,
        max: 600,
      });
      const priceMxn = roundMxn(requireNumber(body.priceMxn, 'Precio MXN', { min: 0, max: 10_000_000 }));
      const requiredDepositMxn = roundMxn(
        requireNumber(body.requiredDepositMxn ?? 0, 'Anticipo MXN', { min: 0, max: priceMxn })
      );

      const service = await db.$transaction(async (tx) => {
        const created = await tx.service.create({
          data: {
            tenantId,
            name,
            description: optionalString(body.description, 'Descripción', 1000) || null,
            durationMinutes,
            priceMxn,
            requiredDepositMxn,
            category: optionalString(body.category, 'Categoría', 120) || 'General',
          },
        });

        await recordAudit(
          {
            tenantId,
            actor: actorFromRequest(request),
            action: 'CREATE',
            entityType: 'SERVICE',
            entityId: created.id,
            metadata: { name, priceMxn, requiredDepositMxn },
          },
          tx
        );

        return created;
      });

      return reply.status(201).send(service);
    }
  );

  /**
   * Elimina un servicio de la clínica activa.
   */
  fastify.delete('/api/services/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const user = requireAuthUser(request);

    const service = await db.service.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!service) return reply.status(404).send({ error: 'Servicio no encontrado' });

    await db.$transaction(async (tx) => {
      const appointments = await tx.appointment.deleteMany({
        where: { serviceId: id, tenantId: user.tenantId },
      });
      await tx.service.delete({ where: { id } });

      await recordAudit(
        {
          tenantId: user.tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'SERVICE',
          entityId: id,
          metadata: { name: service.name, appointmentsDeleted: appointments.count },
        },
        tx
      );
    });

    return reply.send({ success: true });
  });
}
