import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, diffChanges, recordAudit } from '@asistente/database';
import { WhatsAppService } from '../../services/whatsappService.js';
import { actorFromRequest } from '../../lib/audit.js';
import {
  optionalString,
  parseLimit,
  requireAuthUser,
  requireString,
  resolveTenantId,
} from '../../lib/http.js';
import { takeoverSchema, replySchema } from './schemas.js';

export async function conversationRoutes(fastify: FastifyInstance) {
  /**
   * Conversaciones omnicanal de la clínica activa.
   */
  fastify.get('/api/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const tenantId = resolveTenantId(request, query.tenantId);

    const conversations = await db.conversation.findMany({
      where: { tenantId },
      select: {
        id: true,
        channel: true,
        externalChannelId: true,
        lastMessageAt: true,
        createdAt: true,
        isHandedOverToHuman: true,
        patient: {
          select: {
            id: true,
            fullName: true,
            phoneE164: true,
            appointments: {
              select: {
                id: true,
                startTime: true,
                status: true,
                paymentStatus: true,
                depositAmountMxn: true,
                symptoms: true,
                doctor: { select: { name: true, specialty: true } },
                service: { select: { name: true } },
              },
              orderBy: { startTime: 'desc' },
              take: 1,
            },
          },
        },
        messages: {
          select: { id: true, content: true, createdAt: true, senderRole: true, direction: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: parseLimit(query.limit, 100, 500),
    });

    await recordAudit({
      tenantId,
      actor: actorFromRequest(request),
      action: 'LIST',
      entityType: 'CONVERSATION',
      metadata: { count: conversations.length },
    });

    return reply.send(conversations);
  });

  /**
   * Historial de mensajes de una conversación de la clínica activa.
   */
  fastify.get(
    '/api/conversations/:id/messages',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string | undefined>;
      const user = requireAuthUser(request);

      const conversation = await db.conversation.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true, patientId: true },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversación no encontrada' });

      // Se traen los más recientes y se devuelven en orden cronológico, que es
      // como los pinta la bandeja.
      const messages = await db.message.findMany({
        where: { conversationId: id, tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        take: parseLimit(query.limit, 200, 500),
      });

      // Abrir un chat es leer el expediente de ese paciente. La bandeja
      // refresca cada 2 s; `recordAudit` deja una sola fila por ventana.
      await recordAudit({
        tenantId: user.tenantId,
        actor: actorFromRequest(request),
        action: 'READ',
        entityType: 'CONVERSATION',
        entityId: id,
        patientId: conversation.patientId,
      });

      return reply.send(messages.reverse());
    }
  );

  /**
   * Activa o desactiva el modo copiloto humano.
   */
  fastify.post(
    '/api/conversations/:id/takeover',
    { schema: takeoverSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = requireAuthUser(request);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const isHandedOver = body.isHandedOver === true;

      const conversation = await db.conversation.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversación no encontrada' });

      const updated = await db.$transaction(async (tx) => {
        const row = await tx.conversation.update({
          where: { id },
          data: { isHandedOverToHuman: isHandedOver },
        });

        await recordAudit(
          {
            tenantId: user.tenantId,
            actor: actorFromRequest(request),
            action: 'UPDATE',
            entityType: 'CONVERSATION',
            entityId: id,
            patientId: conversation.patientId,
            changes: diffChanges(conversation, { isHandedOverToHuman: isHandedOver }),
          },
          tx
        );

        return row;
      });

      return reply.send({ success: true, isHandedOverToHuman: updated.isHandedOverToHuman });
    }
  );

  /**
   * Respuesta manual del recepcionista.
   */
  fastify.post(
    '/api/conversations/:id/reply',
    { schema: replySchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = requireAuthUser(request);
      const body = (request.body ?? {}) as Record<string, unknown>;

      const text = requireString(body.text, 'Mensaje', 4000);
      const staffName = optionalString(body.staffName, 'Nombre del personal', 200);

      const conversation = await db.conversation.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { patient: true },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversación no encontrada' });

      // El contenido no se copia a la auditoría: ya vive en el propio mensaje, y
      // duplicarlo solo multiplica los lugares donde hay datos clínicos.
      const savedMessage = await db.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            conversationId: id,
            tenantId: user.tenantId,
            direction: 'OUTBOUND',
            senderRole: 'HUMAN_STAFF',
            content: staffName ? `[${staffName}]: ${text}` : text,
            channel: conversation.channel,
            deliveryStatus: conversation.channel === 'WHATSAPP' ? 'PENDING' : null,
          },
        });

        await recordAudit(
          {
            tenantId: user.tenantId,
            actor: actorFromRequest(request),
            action: 'CREATE',
            entityType: 'MESSAGE',
            entityId: message.id,
            patientId: conversation.patientId,
            metadata: { conversationId: id, channel: conversation.channel },
          },
          tx
        );

        return message;
      });

      let delivered: boolean | null = null;
      if (conversation.channel === 'WHATSAPP') {
        delivered = await WhatsAppService.sendMessage({
          toPhoneE164: conversation.patient.phoneE164,
          text,
        });
      }

      if (delivered !== null) {
        return reply.send(
          await db.message.update({
            where: { id: savedMessage.id },
            data: { deliveryStatus: delivered ? 'SENT' : 'FAILED' },
          })
        );
      }

      return reply.send(savedMessage);
    }
  );
}
