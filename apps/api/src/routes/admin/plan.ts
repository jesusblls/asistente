import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPlanSummary } from '@asistente/database';
import { PLANS } from '@asistente/shared-types';
import { requireAuthUser } from '../../lib/http.js';

/**
 * Plan contratado y consumo del periodo en curso.
 *
 * Lo consume el panel para mostrar cuánto queda de la prueba y qué tan cerca
 * está la clínica de sus cupos, antes de que se tope con un 402 a media tarea.
 */
export async function planRoutes(fastify: FastifyInstance) {
  fastify.get('/api/plan', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuthUser(request);
    const summary = await getPlanSummary(user.tenantId);

    return reply.send({
      ...summary,
      // El catálogo completo viaja junto para que el panel pueda ofrecer la
      // mejora de plan sin una segunda petición ni duplicar los precios.
      catalog: Object.values(PLANS),
    });
  });
}
