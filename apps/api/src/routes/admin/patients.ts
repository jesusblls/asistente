import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, recordAudit } from '@asistente/database';
import { actorFromRequest } from '../../lib/audit.js';
import { parseLimit, requireAuthUser, resolveTenantId } from '../../lib/http.js';

export async function patientRoutes(fastify: FastifyInstance) {
  /**
   * Directorio de pacientes de la clínica activa: uno por número de teléfono
   * (llave real en BD, `@@unique([tenantId, phoneE164])`), con el total de
   * citas y llamadas de cada uno para no tener que abrir cada expediente.
   */
  fastify.get('/api/patients', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const tenantId = resolveTenantId(request, query.tenantId);
    const search = query.search?.trim();

    const patients = await db.patient.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' as const } },
                { phoneE164: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        phoneE164: true,
        isVip: true,
        createdAt: true,
        _count: { select: { appointments: true, conversations: true } },
        appointments: {
          select: {
            startTime: true,
            status: true,
            doctor: { select: { name: true } },
            service: { select: { name: true } },
          },
          orderBy: { startTime: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: parseLimit(query.limit, 100, 500),
    });

    // Las llamadas telefónicas son un canal más de Conversation; se cuentan
    // aparte porque "cuántas veces ha marcado" es una pregunta distinta de
    // "cuántas conversaciones tiene" (que incluye WhatsApp, IG, etc.).
    const callCounts = await db.conversation.groupBy({
      by: ['patientId'],
      where: { tenantId, channel: 'PHONE_CALL' },
      _count: { _all: true },
    });
    const callCountByPatient = new Map(callCounts.map((row) => [row.patientId, row._count._all]));

    const result = patients.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      phoneE164: p.phoneE164,
      isVip: p.isVip,
      createdAt: p.createdAt,
      appointmentsCount: p._count.appointments,
      conversationsCount: p._count.conversations,
      callsCount: callCountByPatient.get(p.id) ?? 0,
      lastAppointment: p.appointments[0] ?? null,
    }));

    await recordAudit({
      tenantId,
      actor: actorFromRequest(request),
      action: 'LIST',
      entityType: 'PATIENT',
      metadata: { count: result.length, search: search || null },
    });

    return reply.send(result);
  });

  /**
   * Expediente completo de un paciente: todas sus citas y todas sus
   * conversaciones (WhatsApp, llamadas, etc.) con la clínica activa.
   */
  fastify.get('/api/patients/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = requireAuthUser(request);

    const patient = await db.patient.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        appointments: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
            paymentStatus: true,
            depositAmountMxn: true,
            symptoms: true,
            channelOrigin: true,
            doctor: { select: { name: true, specialty: true } },
            service: { select: { name: true, priceMxn: true } },
          },
          orderBy: { startTime: 'desc' },
        },
        conversations: {
          select: {
            id: true,
            channel: true,
            externalChannelId: true,
            lastMessageAt: true,
            createdAt: true,
            isHandedOverToHuman: true,
            messages: {
              select: { id: true, content: true, createdAt: true, senderRole: true, direction: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { lastMessageAt: 'desc' },
        },
      },
    });

    if (!patient) return reply.status(404).send({ error: 'Paciente no encontrado' });

    // Ver el expediente completo de un paciente específico es exactamente el
    // acceso que NOM-024/LFPDPPP exige dejar rastreado.
    await recordAudit({
      tenantId: user.tenantId,
      actor: actorFromRequest(request),
      action: 'READ',
      entityType: 'PATIENT',
      entityId: patient.id,
      patientId: patient.id,
    });

    return reply.send(patient);
  });
}
