import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, diffChanges, recordAudit } from '@asistente/database';
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
import { createServiceSchema, updateServiceSchema } from './schemas.js';

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
   * Corrige un tratamiento del catálogo.
   *
   * Los precios de una clínica cambian; sin esta ruta, ajustar uno obligaba a
   * borrar el tratamiento y volverlo a crear, lo que borra en cascada todas
   * las citas agendadas con él.
   */
  fastify.patch(
    '/api/services/:id',
    { schema: updateServiceSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      requireRole(request, ['ADMIN']);
      const user = requireAuthUser(request);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const service = await db.service.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!service) return reply.status(404).send({ error: 'Tratamiento no encontrado' });

      const priceMxn =
        body.priceMxn !== undefined
          ? roundMxn(requireNumber(body.priceMxn, 'Precio MXN', { min: 0, max: 10_000_000 }))
          : service.priceMxn;

      // El anticipo se valida contra el precio que va a quedar, no contra el
      // que había: bajar el precio sin ajustar el anticipo dejaría al paciente
      // pagando por adelantado más de lo que cuesta el tratamiento.
      const requiredDepositMxn =
        body.requiredDepositMxn !== undefined
          ? roundMxn(requireNumber(body.requiredDepositMxn, 'Anticipo MXN', { min: 0, max: priceMxn }))
          : Math.min(service.requiredDepositMxn, priceMxn);

      const data = {
        ...(body.name !== undefined && { name: requireString(body.name, 'Nombre', 200) }),
        ...(body.description !== undefined && {
          description: optionalString(body.description, 'Descripción', 1000) || null,
        }),
        ...(body.durationMinutes !== undefined && {
          durationMinutes: requireNumber(body.durationMinutes, 'Duración', { min: 5, max: 600 }),
        }),
        ...(body.category !== undefined && {
          category: optionalString(body.category, 'Categoría', 120) || 'General',
        }),
        ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
        priceMxn,
        requiredDepositMxn,
      };

      const updated = await db.$transaction(async (tx) => {
        const row = await tx.service.update({ where: { id }, data });

        await recordAudit(
          {
            tenantId: user.tenantId,
            actor: actorFromRequest(request),
            action: 'UPDATE',
            entityType: 'SERVICE',
            entityId: id,
            changes: diffChanges(service, data),
          },
          tx
        );

        return row;
      });

      return reply.send(updated);
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
