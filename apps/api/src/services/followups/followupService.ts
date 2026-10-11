import { db, recordAudit, resolveTenantPlan, type Prisma } from '@asistente/database';
import { createLogger, incrementCounter } from '@asistente/observability';
import type { WhatsAppSendPayload } from '../queue/handlers.js';
import type { WhatsAppTemplate } from '../whatsappService.js';
import { resolveTenantSender } from '../reminders/reminderService.js';

/**
 * Seguimiento después de la cita, por WhatsApp:
 *
 * 1. **Encuesta** (2 h a 48 h después de una cita COMPLETADA): tres botones
 *    (excelente / bien / mejorable). Solo citas que recepción marcó como
 *    completadas: mandarla a quien no llegó sería un mensaje absurdo.
 * 2. **Revisión periódica** (`Tenant.recallMonths`, 6 por defecto): invita a
 *    agendar al paciente cuya última visita fue hace N meses y que no tiene
 *    otra cita en agenda. Es ingreso recurrente que hoy se pierde porque nadie
 *    lleva la cuenta.
 *
 * Mismas reglas que los recordatorios: candado atómico en base (dos
 * instancias no mandan doble), el trabajo `WHATSAPP_SEND` se escribe en la
 * misma transacción, nada se manda a un chat en manos de recepción ni de una
 * clínica suspendida, y fuera de la ventana de 24 h de WhatsApp solo sale con
 * plantilla aprobada (si no hay, no se intenta).
 */

const logger = createLogger('api:followups');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WHATSAPP_SERVICE_WINDOW_MS = 24 * HOUR_MS;
const BATCH_LIMIT = 200;
const DEFAULT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/** La encuesta se manda entre 2 h y 48 h después de terminada la cita. */
const SURVEY_MIN_DELAY_MS = 2 * HOUR_MS;
const SURVEY_MAX_DELAY_MS = 48 * HOUR_MS;

export const SURVEY_OPTIONS = [
  { score: 3, title: '😀 Excelente' },
  { score: 2, title: '🙂 Bien' },
  { score: 1, title: '😕 Mejorable' },
] as const;

export interface FollowUpSweepResult {
  surveys: number;
  recalls: number;
  skipped: number;
}

type TenantPlanFields = {
  id: string;
  name: string;
  isActive: boolean;
  planSlug: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

const TENANT_SELECT = {
  id: true,
  name: true,
  isActive: true,
  planSlug: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
} as const;

function maxAttempts(): number {
  const parsed = Number(process.env.JOBS_MAX_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function template(envName: string, bodyParameters: string[], quickReplyPayloads: string[]): WhatsAppTemplate | null {
  const name = process.env[envName]?.trim();
  if (!name) return null;
  return {
    name,
    languageCode: process.env.WHATSAPP_REMINDER_TEMPLATE_LANG?.trim() || 'es_MX',
    bodyParameters,
    quickReplyPayloads,
  };
}

type EnqueueOutcome = 'ENQUEUED' | 'HUMAN_TAKEOVER' | 'OUTSIDE_WINDOW' | 'ALREADY_CLAIMED';

/**
 * Reclama (con `claim`), deja el mensaje en la bandeja y escribe el trabajo de
 * envío, todo en una transacción. `claim` devuelve false si otro barrido ya lo
 * tomó.
 */
async function claimAndEnqueue(params: {
  tenantId: string;
  patientId: string;
  phoneE164: string;
  phoneNumberId: string | undefined;
  text: string;
  buttons: { id: string; title: string }[];
  fallbackTemplate: WhatsAppTemplate | null;
  dedupeKey: string;
  now: Date;
  claim: (tx: Prisma.TransactionClient) => Promise<boolean>;
  audit: Parameters<typeof recordAudit>[0];
}): Promise<EnqueueOutcome> {
  return db.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: { tenantId: params.tenantId, patientId: params.patientId, channel: 'WHATSAPP' },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, isHandedOverToHuman: true },
    });
    if (conversation?.isHandedOverToHuman) return 'HUMAN_TAKEOVER';

    const lastInbound = conversation
      ? await tx.message.findFirst({
          where: { conversationId: conversation.id, tenantId: params.tenantId, direction: 'INBOUND' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
      : null;
    const insideWindow =
      lastInbound !== null && params.now.getTime() - lastInbound.createdAt.getTime() < WHATSAPP_SERVICE_WINDOW_MS;
    if (!insideWindow && !params.fallbackTemplate) return 'OUTSIDE_WINDOW';

    if (!(await params.claim(tx))) return 'ALREADY_CLAIMED';

    const previous = await tx.job.findUnique({ where: { dedupeKey: params.dedupeKey }, select: { id: true, status: true } });
    if (previous && previous.status !== 'DEAD') return 'ENQUEUED';
    if (previous) await tx.job.delete({ where: { id: previous.id } });

    let messageId: string | undefined;
    if (conversation) {
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          tenantId: params.tenantId,
          direction: 'OUTBOUND',
          senderRole: 'SYSTEM',
          content: params.text,
          channel: 'WHATSAPP',
          deliveryStatus: 'PENDING',
        },
        select: { id: true },
      });
      messageId = message.id;
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: params.now } });
    }

    const payload: WhatsAppSendPayload = {
      kind: 'TEXT',
      toPhoneE164: params.phoneE164,
      text: params.text,
      phoneNumberId: params.phoneNumberId,
      messageId,
      interactiveButtons: params.buttons,
      ...(!insideWindow && params.fallbackTemplate ? { template: params.fallbackTemplate } : {}),
    };

    await tx.job.create({
      data: {
        type: 'WHATSAPP_SEND',
        tenantId: params.tenantId,
        dedupeKey: params.dedupeKey,
        payload: JSON.stringify(payload),
        maxAttempts: maxAttempts(),
        runAt: params.now,
      },
    });

    await recordAudit(params.audit, tx);
    return 'ENQUEUED';
  });
}

async function sweepSurveys(now: Date, result: FollowUpSweepResult, guards: Guards) {
  const due = await db.appointment.findMany({
    where: {
      status: 'COMPLETED',
      surveySentAt: null,
      endTime: { gte: new Date(now.getTime() - SURVEY_MAX_DELAY_MS), lte: new Date(now.getTime() - SURVEY_MIN_DELAY_MS) },
      patient: { phoneE164: { startsWith: '+' } },
      tenant: { isActive: true, surveyEnabled: true },
    },
    orderBy: { endTime: 'asc' },
    take: BATCH_LIMIT,
    select: {
      id: true,
      tenantId: true,
      patientId: true,
      patient: { select: { fullName: true, phoneE164: true } },
      service: { select: { name: true } },
      tenant: { select: TENANT_SELECT },
    },
  });

  for (const appointment of due) {
    try {
      const sender = await guards.sender(appointment.tenant, now);
      if (sender === null) {
        result.skipped++;
        continue;
      }
      const firstName = appointment.patient.fullName.split(' ')[0];
      const text =
        `Hola ${firstName}, gracias por tu visita a *${appointment.tenant.name}* (${appointment.service.name}). ` +
        '¿Cómo te atendimos? Tu respuesta nos ayuda a mejorar.';
      const outcome = await claimAndEnqueue({
        tenantId: appointment.tenantId,
        patientId: appointment.patientId,
        phoneE164: appointment.patient.phoneE164,
        phoneNumberId: sender,
        text,
        buttons: SURVEY_OPTIONS.map((option) => ({ id: `survey_${appointment.id}_${option.score}`, title: option.title })),
        fallbackTemplate: template(
          'WHATSAPP_SURVEY_TEMPLATE',
          [firstName, appointment.tenant.name, appointment.service.name],
          SURVEY_OPTIONS.map((option) => `survey_${appointment.id}_${option.score}`)
        ),
        dedupeKey: `survey:${appointment.id}`,
        now,
        claim: async (tx) =>
          (
            await tx.appointment.updateMany({
              where: { id: appointment.id, tenantId: appointment.tenantId, surveySentAt: null, status: 'COMPLETED' },
              data: { surveySentAt: now },
            })
          ).count === 1,
        audit: {
          tenantId: appointment.tenantId,
          actor: { type: 'SYSTEM', id: 'followup-sweeper' },
          action: 'UPDATE',
          entityType: 'APPOINTMENT',
          entityId: appointment.id,
          patientId: appointment.patientId,
          changes: { surveySentAt: { before: null, after: now.toISOString() } },
          metadata: { reason: 'Encuesta post-cita encolada por WhatsApp' },
        },
      });
      if (outcome === 'ENQUEUED') {
        result.surveys++;
        incrementCounter('followup_surveys_enqueued_total');
      } else {
        result.skipped++;
      }
    } catch (error) {
      logger.error('No se pudo encolar la encuesta post-cita', error, { appointmentId: appointment.id });
    }
  }
}

async function sweepRecalls(now: Date, result: FollowUpSweepResult, guards: Guards) {
  const tenants = await db.tenant.findMany({
    where: { isActive: true, recallMonths: { not: null, gt: 0 } },
    select: { ...TENANT_SELECT, recallMonths: true },
  });

  for (const tenant of tenants) {
    const months = tenant.recallMonths!;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);
    // No se persigue a pacientes que dejaron de venir hace años: si la última
    // visita fue hace más de un año extra, el recordatorio ya no aplica.
    const oldest = new Date(cutoff.getTime() - 365 * DAY_MS);

    try {
      const sender = await guards.sender(tenant, now);
      if (sender === null) continue;

      // Última visita completada de cada paciente, dentro del rango.
      const lastVisits = await db.appointment.groupBy({
        by: ['patientId'],
        where: { tenantId: tenant.id, status: 'COMPLETED' },
        _max: { endTime: true },
        having: { endTime: { _max: { lte: cutoff, gte: oldest } } },
        orderBy: { patientId: 'asc' },
        // Tope por clínica y barrido; los ya invitados se descartan abajo.
        take: 1000,
      });

      for (const visit of lastVisits) {
        const lastVisitAt = visit._max.endTime!;
        const patient = await db.patient.findFirst({
          where: { id: visit.patientId, tenantId: tenant.id, phoneE164: { startsWith: '+' } },
          select: { id: true, fullName: true, phoneE164: true, recallSentAt: true },
        });
        if (!patient) continue;
        // Ya se le invitó después de esta visita.
        if (patient.recallSentAt && patient.recallSentAt > lastVisitAt) continue;
        // Tiene otra cita después de esa visita (agendada, futura o no completada aún).
        const upcoming = await db.appointment.findFirst({
          where: {
            tenantId: tenant.id,
            patientId: patient.id,
            startTime: { gt: lastVisitAt },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          },
          select: { id: true },
        });
        if (upcoming) continue;

        const firstName = patient.fullName.split(' ')[0];
        const text =
          `Hola ${firstName}, ya pasaron ${months} meses desde tu última visita a *${tenant.name}*. ` +
          'Es buen momento para tu revisión. ¿Te ayudamos a agendarla?';
        const outcome = await claimAndEnqueue({
          tenantId: tenant.id,
          patientId: patient.id,
          phoneE164: patient.phoneE164,
          phoneNumberId: sender,
          text,
          buttons: [{ id: `recall_${patient.id}`, title: 'Agendar revisión' }],
          fallbackTemplate: template('WHATSAPP_RECALL_TEMPLATE', [firstName, tenant.name, String(months)], [`recall_${patient.id}`]),
          dedupeKey: `recall:${patient.id}:${lastVisitAt.toISOString()}`,
          now,
          claim: async (tx) =>
            (
              await tx.patient.updateMany({
                where: {
                  id: patient.id,
                  tenantId: tenant.id,
                  OR: [{ recallSentAt: null }, { recallSentAt: { lte: lastVisitAt } }],
                },
                data: { recallSentAt: now },
              })
            ).count === 1,
          audit: {
            tenantId: tenant.id,
            actor: { type: 'SYSTEM', id: 'followup-sweeper' },
            action: 'UPDATE',
            entityType: 'PATIENT',
            entityId: patient.id,
            patientId: patient.id,
            changes: { recallSentAt: { before: patient.recallSentAt?.toISOString() ?? null, after: now.toISOString() } },
            metadata: { reason: `Invitación a revisión de ${months} meses encolada por WhatsApp` },
          },
        });
        if (outcome === 'ENQUEUED') {
          result.recalls++;
          incrementCounter('followup_recalls_enqueued_total');
        } else {
          result.skipped++;
        }
      }
    } catch (error) {
      logger.error('No se pudieron revisar las invitaciones a revisión de la clínica', error, { tenantId: tenant.id });
    }
  }
}

interface Guards {
  /** Número desde el que escribe la clínica; `null` = no escribir (suspendida o credenciales ilegibles). */
  sender: (tenant: TenantPlanFields, now: Date) => Promise<string | undefined | null>;
}

/** Un barrido completo. Exportado para pruebas; recibe `now` para no depender del reloj. */
export async function runFollowUpSweep(now: Date = new Date()): Promise<FollowUpSweepResult> {
  const result: FollowUpSweepResult = { surveys: 0, recalls: 0, skipped: 0 };
  const senderCache = new Map<string, string | undefined | null>();
  const guards: Guards = {
    sender: async (tenant, at) => {
      if (!senderCache.has(tenant.id)) {
        senderCache.set(
          tenant.id,
          resolveTenantPlan(tenant, at).isSuspended ? null : await resolveTenantSender(tenant.id)
        );
      }
      return senderCache.get(tenant.id)!;
    },
  };

  await sweepSurveys(now, result, guards);
  await sweepRecalls(now, result, guards);

  if (result.surveys + result.recalls > 0) {
    logger.info('Seguimientos post-cita encolados', { ...result });
  }
  return result;
}

let sweepTimer: NodeJS.Timeout | null = null;
let inFlight: Promise<unknown> = Promise.resolve();
let stopped = true;

export function followUpsEnabled(): boolean {
  if (process.env.FOLLOWUPS_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

export function startFollowUpSweeper(): void {
  if (!stopped) return;
  stopped = false;
  const parsed = Number(process.env.FOLLOWUP_SWEEP_INTERVAL_MS);
  const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SWEEP_INTERVAL_MS;

  const tick = () => {
    if (stopped) return;
    inFlight = runFollowUpSweep()
      .catch((error) => logger.error('Falló el barrido de seguimientos post-cita', error))
      .finally(() => {
        if (!stopped) sweepTimer = setTimeout(tick, intervalMs);
      });
  };

  tick();
  logger.info('Barrido de seguimientos post-cita activo', { intervalMs });
}

export async function stopFollowUpSweeper(): Promise<void> {
  stopped = true;
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  await inFlight;
}

/**
 * Guarda la respuesta de la encuesta (botón `survey_<cita>_<puntaje>`). Solo
 * la primera respuesta cuenta, y solo de la cita del mismo paciente y clínica.
 * Devuelve el texto de respuesta al paciente.
 */
export async function recordSurveyAnswer(params: {
  tenantId: string;
  patientId: string;
  appointmentId: string;
  score: number;
}): Promise<{ replyText: string; lowScore: boolean }> {
  const option = SURVEY_OPTIONS.find((candidate) => candidate.score === params.score);
  if (!option) return { replyText: '¡Gracias por tu respuesta!', lowScore: false };

  const answeredAt = new Date();
  const saved = await db.$transaction(async (tx) => {
    const updated = await tx.appointment.updateMany({
      where: {
        id: params.appointmentId,
        tenantId: params.tenantId,
        patientId: params.patientId,
        surveySentAt: { not: null },
        surveyScore: null,
      },
      data: { surveyScore: option.score, surveyAnsweredAt: answeredAt },
    });
    if (updated.count === 0) return false;
    await recordAudit(
      {
        tenantId: params.tenantId,
        actor: { type: 'SYSTEM', id: 'survey' },
        action: 'UPDATE',
        entityType: 'APPOINTMENT',
        entityId: params.appointmentId,
        patientId: params.patientId,
        changes: { surveyScore: { before: null, after: option.score } },
        metadata: { reason: 'Respuesta de encuesta post-cita' },
      },
      tx
    );
    return true;
  });

  if (!saved) return { replyText: '¡Gracias! Ya teníamos registrada tu opinión.', lowScore: false };
  if (option.score === 1) {
    return {
      replyText: 'Gracias por decírnoslo. Lamentamos que tu experiencia no haya sido buena; alguien del equipo te escribirá para saber qué pasó.',
      lowScore: true,
    };
  }
  return { replyText: '¡Muchas gracias por tu opinión! Nos da gusto atenderte. 😊', lowScore: false };
}
