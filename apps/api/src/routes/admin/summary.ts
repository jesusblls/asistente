import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { db, recordAudit } from '@asistente/database';
import { actorFromRequest } from '../../lib/audit.js';
import { resolveTenantId } from '../../lib/http.js';

/**
 * Resumen del día para quien abre el panel ("hoy tienes 9 citas, 2 anticipos
 * pendientes, 1 chat esperando a recepción").
 *
 * Reúne en una sola consulta lo que recepción revisa cada mañana y que antes
 * había que deducir recorriendo la agenda y la bandeja. Se arma con datos, no
 * con un modelo de lenguaje: cada cifra se puede rastrear a una consulta y no
 * hay riesgo de que "resuma" algo que no pasó.
 *
 * "Hoy" y "mañana" se cortan en la zona horaria de la clínica, no del servidor
 * (que corre en UTC): a las 7 p. m. de la CDMX el servidor ya va en el día
 * siguiente.
 */

const NOT_HAPPENING = ['CANCELLED', 'NO_SHOW'];

function dayRange(now: Date, timeZone: string, offsetDays: number) {
  const localDate = formatInTimeZone(addDays(now, offsetDays), timeZone, 'yyyy-MM-dd');
  const start = fromZonedTime(`${localDate}T00:00:00`, timeZone);
  const end = fromZonedTime(`${formatInTimeZone(addDays(start, 1), timeZone, 'yyyy-MM-dd')}T00:00:00`, timeZone);
  return { start, end, localDate };
}

export async function summaryRoutes(fastify: FastifyInstance) {
  fastify.get('/api/summary/today', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const tenantId = resolveTenantId(request, query.tenantId);
    const now = new Date();

    const tenant = await db.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true, timezone: true },
    });
    const timeZone = tenant?.timezone || 'America/Mexico_City';
    const today = dayRange(now, timeZone, 0);
    const tomorrow = dayRange(now, timeZone, 1);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [todayAppointments, tomorrowCount, pendingDeposits, handedOver, failedMessages, bookedThisWeek] =
      await Promise.all([
        db.appointment.findMany({
          where: { tenantId, startTime: { gte: today.start, lt: today.end }, status: { notIn: NOT_HAPPENING } },
          orderBy: { startTime: 'asc' },
          select: {
            id: true,
            startTime: true,
            status: true,
            patientId: true,
            patient: { select: { fullName: true } },
            service: { select: { name: true } },
            doctor: { select: { name: true } },
          },
        }),
        db.appointment.count({
          where: { tenantId, startTime: { gte: tomorrow.start, lt: tomorrow.end }, status: { notIn: NOT_HAPPENING } },
        }),
        db.appointment.aggregate({
          where: {
            tenantId,
            paymentStatus: 'DEPOSIT_PENDING',
            status: { notIn: NOT_HAPPENING },
            startTime: { gte: now },
          },
          _count: { _all: true },
          _sum: { depositAmountMxn: true },
        }),
        db.conversation.count({ where: { tenantId, isHandedOverToHuman: true } }),
        db.message.count({
          where: { tenantId, direction: 'OUTBOUND', deliveryStatus: 'FAILED', createdAt: { gte: dayAgo } },
        }),
        db.appointment.groupBy({
          by: ['channelOrigin'],
          where: { tenantId, createdAt: { gte: weekAgo } },
          _count: { _all: true },
        }),
      ]);

    // Primera visita: el paciente no ha venido antes. Una cita pasada que se
    // canceló o a la que no se presentó no cuenta como visita.
    const patientIds = [...new Set(todayAppointments.map((appointment) => appointment.patientId))];
    const withHistory = patientIds.length
      ? await db.appointment.findMany({
          where: {
            tenantId,
            patientId: { in: patientIds },
            startTime: { lt: today.start },
            status: { notIn: NOT_HAPPENING },
          },
          select: { patientId: true },
          distinct: ['patientId'],
        })
      : [];
    const returning = new Set(withHistory.map((row) => row.patientId));
    const firstVisits = todayAppointments.filter((appointment) => !returning.has(appointment.patientId));

    const next = todayAppointments.find(
      (appointment) => appointment.startTime > now && appointment.status !== 'COMPLETED'
    );

    const byChannel = Object.fromEntries(bookedThisWeek.map((row) => [row.channelOrigin, row._count._all]));
    const assistantChannels = ['WHATSAPP', 'PHONE_CALL', 'WEB_PORTAL'];
    const bookedByAssistant = assistantChannels.reduce((sum, channel) => sum + (byChannel[channel] ?? 0), 0);

    // Leer el resumen expone nombres de pacientes (próxima cita, primeras
    // visitas): queda en la bitácora igual que listar la agenda.
    await recordAudit({
      tenantId,
      actor: actorFromRequest(request),
      action: 'LIST',
      entityType: 'APPOINTMENT',
      metadata: { view: 'summary_today', count: todayAppointments.length },
    });

    return reply.send({
      clinicName: tenant?.name ?? null,
      timeZone,
      date: today.localDate,
      today: {
        total: todayAppointments.length,
        completed: todayAppointments.filter((appointment) => appointment.status === 'COMPLETED').length,
        remaining: todayAppointments.filter(
          (appointment) => appointment.startTime > now && appointment.status !== 'COMPLETED'
        ).length,
        firstVisits: firstVisits.map((appointment) => ({
          patientName: appointment.patient.fullName,
          startTime: appointment.startTime.toISOString(),
        })),
        next: next
          ? {
              startTime: next.startTime.toISOString(),
              patientName: next.patient.fullName,
              serviceName: next.service.name,
              doctorName: next.doctor.name,
            }
          : null,
      },
      tomorrow: { total: tomorrowCount },
      deposits: {
        pendingCount: pendingDeposits._count._all,
        pendingAmountMxn: pendingDeposits._sum.depositAmountMxn ?? 0,
      },
      inbox: { waitingForStaff: handedOver, failedLast24h: failedMessages },
      week: { bookedByAssistant, byChannel },
    });
  });
}
