import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, recordAudit } from '@asistente/database';
import { actorFromRequest } from '../../lib/audit.js';
import {
  optionalString,
  requireAuthUser,
  requireMexicanPhone,
  requireRole,
  requireString,
  resolveTenantId,
} from '../../lib/http.js';
import { createDoctorSchema } from './schemas.js';
import { parseAvailabilityRules, serializeAvailabilityRules } from '../../lib/availability.js';

export async function doctorRoutes(fastify: FastifyInstance) {
  /**
   * Agrega un doctor a la clínica activa.
   */
  fastify.post(
    '/api/tenants/:id/doctors',
    { schema: createDoctorSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      requireRole(request, ['ADMIN']);
      const tenantId = resolveTenantId(request, id);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const name = requireString(body.name, 'Nombre', 200);
      const specialty = requireString(body.specialty, 'Especialidad', 200);
      const phone =
        body.phone !== undefined && body.phone !== null && body.phone !== ''
          ? requireMexicanPhone(body.phone, 'Teléfono del doctor')
          : null;
      const email = optionalString(body.email, 'Email', 200) || null;

      // Sin horario capturado el especialista cae en el horario por defecto
      // del `SchedulerService` (L-J 9-18, V 9-17, S 10-14), que casi nunca es
      // el real: el panel debe mandarlo y aquí se valida antes de guardarlo.
      const availabilityRules =
        body.availabilityRules === undefined || body.availabilityRules === null
          ? null
          : serializeAvailabilityRules(parseAvailabilityRules(body.availabilityRules));

      const doctor = await db.$transaction(async (tx) => {
        const created = await tx.doctor.create({
          data: { tenantId, name, specialty, phone, email, availabilityRules },
        });

        await recordAudit(
          {
            tenantId,
            actor: actorFromRequest(request),
            action: 'CREATE',
            entityType: 'DOCTOR',
            entityId: created.id,
            metadata: { name, specialty, horarioCapturado: availabilityRules !== null },
          },
          tx
        );

        return created;
      });

      return reply.status(201).send(doctor);
    }
  );

  /**
   * Elimina un doctor de la clínica activa y sus citas asociadas.
   */
  fastify.delete('/api/doctors/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    requireRole(request, ['ADMIN']);
    const user = requireAuthUser(request);

    const doctor = await db.doctor.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doctor) return reply.status(404).send({ error: 'Doctor no encontrado' });

    await db.$transaction(async (tx) => {
      const appointments = await tx.appointment.deleteMany({
        where: { doctorId: id, tenantId: user.tenantId },
      });
      await tx.doctor.delete({ where: { id } });

      await recordAudit(
        {
          tenantId: user.tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'DOCTOR',
          entityId: id,
          metadata: { name: doctor.name, appointmentsDeleted: appointments.count },
        },
        tx
      );
    });

    return reply.send({ success: true });
  });
}
