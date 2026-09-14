import { db } from '@asistente/database';
import { normalizeMexicanPhone } from '@asistente/ai-agent';
import type { VoiceLogger } from './types.js';

/**
 * Persistencia de las llamadas telefónicas.
 *
 * Antes las llamadas vivían sólo en memoria: no aparecían en la bandeja
 * omnicanal ni dejaban rastro del triaje. Este store crea (o reutiliza) el
 * paciente y la conversación `PHONE_CALL` del `callSid` de Twilio, y guarda
 * cada turno como mensaje, reutilizando el mismo modelo que WhatsApp.
 */

export interface TranscriptTurn {
  tenantId: string;
  callSid: string;
  patientPhone: string;
  patientName?: string;
  content: string;
}

export interface TranscriptStore {
  recordInbound(turn: TranscriptTurn): Promise<void>;
  recordOutbound(turn: TranscriptTurn): Promise<void>;
  markHandover(turn: TranscriptTurn): Promise<void>;
}

export function createPrismaTranscriptStore(logger: VoiceLogger): TranscriptStore {
  const conversations = new Map<string, string>();

  async function ensureConversation(turn: TranscriptTurn): Promise<string | null> {
    const cached = conversations.get(turn.callSid);
    if (cached) return cached;

    const phoneE164 = normalizeMexicanPhone(turn.patientPhone);
    const patient = await db.patient.upsert({
      where: { tenantId_phoneE164: { tenantId: turn.tenantId, phoneE164 } },
      update: turn.patientName ? { fullName: turn.patientName } : {},
      create: {
        tenantId: turn.tenantId,
        fullName: turn.patientName || 'Paciente telefónico',
        phoneE164,
      },
    });

    const existing = await db.conversation.findFirst({
      where: { tenantId: turn.tenantId, channel: 'PHONE_CALL', externalChannelId: turn.callSid },
      select: { id: true },
    });

    const conversation =
      existing ??
      (await db.conversation.create({
        data: {
          tenantId: turn.tenantId,
          patientId: patient.id,
          channel: 'PHONE_CALL',
          externalChannelId: turn.callSid,
        },
        select: { id: true },
      }));

    conversations.set(turn.callSid, conversation.id);
    return conversation.id;
  }

  async function recordMessage(
    turn: TranscriptTurn,
    direction: 'INBOUND' | 'OUTBOUND',
    senderRole: 'PATIENT' | 'AI_AGENT'
  ): Promise<void> {
    try {
      const conversationId = await ensureConversation(turn);
      if (!conversationId) return;

      await db.message.create({
        data: {
          conversationId,
          tenantId: turn.tenantId,
          direction,
          senderRole,
          content: turn.content,
          channel: 'PHONE_CALL',
        },
      });
      await db.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
    } catch (error) {
      // Un fallo de persistencia nunca debe tumbar una llamada en curso.
      logger.warn('No se pudo persistir el turno de voz', {
        callSid: turn.callSid,
        direction,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    async recordInbound(turn) {
      await recordMessage(turn, 'INBOUND', 'PATIENT');
    },
    async recordOutbound(turn) {
      await recordMessage(turn, 'OUTBOUND', 'AI_AGENT');
    },
    async markHandover(turn) {
      try {
        const conversationId = await ensureConversation(turn);
        if (!conversationId) return;
        await db.conversation.update({
          where: { id: conversationId },
          data: { isHandedOverToHuman: true },
        });
      } catch (error) {
        logger.warn('No se pudo marcar la conversación de voz para atención humana', {
          callSid: turn.callSid,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
