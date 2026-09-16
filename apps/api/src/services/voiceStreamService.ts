import { WebSocket } from 'ws';
import { PlanLimitError, assertCanTakeCall, db, recordUsage } from '@asistente/database';
import { OmnichannelAgent, normalizeMexicanPhone } from '@asistente/ai-agent';
import { createLogger, maskPhone } from '@asistente/observability';
import { WhatsAppService } from './whatsappService.js';
import { enqueueVoiceFollowUp } from './queue/handlers.js';
import {
  VoiceCallSession,
  isVoicePipelineEnabled,
  resolveVoicePipelineConfig,
  type VoiceAgent,
  type VoicePipelineConfig,
  type VoiceTenant,
} from './voice/pipeline.js';
import { DeepgramSpeechToTextProvider, type SpeechToTextProvider } from './voice/stt.js';
import { CartesiaTextToSpeechProvider, type TextToSpeechProvider } from './voice/tts.js';
import { createPrismaTranscriptStore, type TranscriptStore } from './voice/transcriptStore.js';
import { redirectCallToHuman } from './voice/handover.js';
import type { VoiceLogger } from './voice/types.js';

/**
 * Puente entre Twilio Media Streams y el pipeline de voz.
 *
 * Responsabilidades de este módulo:
 *  1. Resolver la clínica destino (parámetro firmado en el TwiML o número marcado).
 *  2. Rechazar el stream si no hay clínica, si el token de stream no coincide o
 *     si el pipeline no tiene STT/TTS configurados (mejor cerrar que dejar la
 *     línea muda).
 *  3. Traducir eventos de Twilio (`start`, `media`, `mark`, `stop`) al pipeline
 *     y cerrar la llamada con seguimiento por WhatsApp.
 *
 * Todas las dependencias son inyectables para poder probar el flujo completo
 * sin Twilio, sin red y sin llaves reales.
 */

export interface TwilioVoiceSession {
  streamSid: string;
  callSid: string;
  fromPhone: string;
  toPhone: string;
  tenantId: string;
}

export interface VoiceStreamDependencies {
  logger?: VoiceLogger;
  agent?: VoiceAgent;
  stt?: SpeechToTextProvider;
  tts?: TextToSpeechProvider;
  config?: Partial<VoicePipelineConfig>;
  transcriptStore?: TranscriptStore;
  resolveTenant?: (params: { tenantId?: string; toPhone: string }) => Promise<VoiceTenant | null>;
  notifyFollowUp?: (params: {
    tenant: VoiceTenant;
    fromPhone: string;
    callSid: string;
  }) => Promise<unknown> | unknown;
  redirectToHuman?: (params: {
    tenant: VoiceTenant;
    callSid: string;
    fromPhone: string;
  }) => Promise<boolean> | boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface TwilioStreamMessage {
  event?: string;
  start?: {
    streamSid?: string;
    callSid?: string;
    from?: string;
    to?: string;
    customParameters?: Record<string, string>;
  };
  media?: { payload?: string };
  mark?: { name?: string };
  dtmf?: { digit?: string };
}

/** Mensaje de seguimiento post-llamada (mismo texto que la versión anterior). */
export function buildVoiceFollowUpMessage(tenant: VoiceTenant): string {
  return `🦷 *${tenant.name}*\n\n¡Muchas gracias por comunicarte con nosotros por teléfono!\n\nSi necesitas agendar o consultar cualquier duda sobre tus tratamientos, puedes escribirnos por este mismo chat de WhatsApp las 24 horas del día.`;
}

/**
 * Carga al plan los segundos que duró la llamada.
 *
 * Nunca hace fallar el cierre de la llamada: si el contador no se pudo
 * escribir, se registra y se sigue. Perder unos segundos de medición es
 * preferible a dejar una sesión de voz colgada por un error de base de datos.
 */
async function chargeVoiceUsage(session: VoiceCallSession, logger: VoiceLogger): Promise<void> {
  try {
    const seconds = Math.round(session.getStats().durationMs / 1000);
    if (seconds <= 0) return;
    await recordUsage(session.tenant.id, 'VOICE_SECONDS', seconds);
  } catch (error) {
    logger.warn('No se pudo registrar el consumo de voz de la llamada', {
      callSid: session.callSid,
      tenantId: session.tenant.id,
      err: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveTenantFromDatabase(params: {
  tenantId?: string;
  toPhone: string;
}): Promise<VoiceTenant | null> {
  if (params.tenantId) {
    const fromStream = await db.tenant.findFirst({
      where: { id: params.tenantId, isActive: true },
      select: { id: true, name: true, timezone: true },
    });
    if (fromStream) return fromStream;
  }

  // Ver nota equivalente en webhooks.ts::resolveTenantByPhone: aceptamos
  // cualquier E.164 válido, no solo +52, para poder probar con números de
  // otros países mientras se consigue uno mexicano para producción.
  const normalized = normalizeMexicanPhone(params.toPhone);
  if (!/^\+\d{8,15}$/.test(normalized)) return null;

  return db.tenant.findFirst({
    where: { isActive: true, phoneE164: normalized },
    select: { id: true, name: true, timezone: true },
  });
}

export class VoiceStreamService {
  /**
   * Inicializa la sesión de llamada telefónica desde el WebSocket de Twilio.
   */
  static handleConnection(ws: WebSocket, deps: VoiceStreamDependencies = {}): void {
    const logger = deps.logger ?? createLogger('api:voice');
    const config = resolveVoicePipelineConfig(process.env, deps.config);
    const stt = deps.stt ?? new DeepgramSpeechToTextProvider({ logger });
    const tts = deps.tts ?? new CartesiaTextToSpeechProvider({ logger });
    const agent = deps.agent ?? new OmnichannelAgent();
    const resolveTenant = deps.resolveTenant ?? resolveTenantFromDatabase;
    const transcriptStore = deps.transcriptStore ?? createPrismaTranscriptStore(logger);
    const expectedStreamToken = process.env.VOICE_STREAM_TOKEN;

    let session: VoiceCallSession | null = null;
    let closed = false;

    const send = (payload: Record<string, unknown>) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(payload));
    };

    const close = (code = 1000, reason = 'closed') => {
      if (closed) return;
      closed = true;
      try {
        ws.close(code, reason);
      } catch {
        // Cerrar un socket ya caído no es un error recuperable.
      }
    };

    ws.on('message', (raw: unknown) => {
      void (async () => {
        let message: TwilioStreamMessage;
        try {
          message = JSON.parse(String(raw)) as TwilioStreamMessage;
        } catch {
          logger.warn('Evento ilegible en el WebSocket de voz');
          return;
        }

        switch (message.event) {
          case 'connected':
            logger.debug('Twilio Media Streams conectado');
            break;

          case 'start': {
            const start = message.start ?? {};
            const custom = start.customParameters ?? {};
            const streamSid = start.streamSid ?? '';
            const callSid = start.callSid ?? '';
            const from = custom.from || start.from || '';
            const to = custom.to || start.to || '';

            if (expectedStreamToken && custom.authToken !== expectedStreamToken) {
              logger.warn('Se rechaza el stream de voz por token inválido', { callSid, streamSid });
              close(1008, 'invalid_stream_token');
              return;
            }

            const tenant = await resolveTenant({ tenantId: custom.tenantId, toPhone: to });
            if (!tenant) {
              logger.warn('Llamada rechazada: el número destino no está asociado a una clínica', {
                to: maskPhone(to),
                callSid,
              });
              close(1008, 'tenant_not_found');
              return;
            }

            // Cupo de voz del plan. Se verifica al inicio de la llamada y no
            // al final: cortar a medias a un paciente que está describiendo un
            // dolor sería peor que no contestarle, así que el último minuto
            // puede rebasar los incluidos.
            //
            // Solo un `PlanLimitError` cuelga la llamada. Cualquier otro fallo
            // (base de datos caída, fila de clínica ilegible) se registra y se
            // deja pasar: dejar sin línea a un paciente que marca por un dolor
            // es un daño mayor que regalar unos minutos de voz, y un corte de
            // base de datos no es culpa de quien está llamando.
            try {
              await assertCanTakeCall(tenant.id);
            } catch (error) {
              if (error instanceof PlanLimitError) {
                logger.warn('Llamada rechazada por el cupo del plan', {
                  callSid,
                  tenantId: tenant.id,
                  motivo: error.message,
                });
                close(1000, 'plan_limit_reached');
                return;
              }

              logger.error(
                'No se pudo verificar el cupo del plan; la llamada continúa',
                error instanceof Error ? error : undefined,
                { callSid, tenantId: tenant.id }
              );
            }

            if (!isVoicePipelineEnabled({ stt, tts, config })) {
              logger.error(
                'Pipeline de voz deshabilitado: faltan DEEPGRAM_API_KEY y/o CARTESIA_API_KEY',
                undefined,
                {
                  callSid,
                  tenantId: tenant.id,
                  sttConfigured: stt.isConfigured,
                  ttsConfigured: tts.isConfigured,
                  mode: config.mode,
                }
              );
              close(1000, 'voice_pipeline_disabled');
              return;
            }

            const fromPhone = normalizeMexicanPhone(from);
            session = new VoiceCallSession({
              streamSid,
              callSid,
              fromPhone,
              toPhone: to,
              tenant,
              patientName: custom.patientName,
              agent,
              stt,
              tts,
              send,
              close,
              logger,
              transcriptStore,
              config: deps.config,
              now: deps.now,
              sleep: deps.sleep,
              notifyFollowUp: async () => {
                if (deps.notifyFollowUp) {
                  return deps.notifyFollowUp({ tenant, fromPhone, callSid });
                }
                // El seguimiento se encola en el outbox: si Meta está caído se
                // reintenta con backoff sin bloquear el cierre de la llamada.
                try {
                  return await enqueueVoiceFollowUp({
                    tenantId: tenant.id,
                    toPhoneE164: fromPhone,
                    callSid,
                  });
                } catch (error) {
                  logger.warn('No se pudo encolar el seguimiento post-llamada; se envía directo', {
                    callSid,
                  });
                  return WhatsAppService.sendMessage({
                    toPhoneE164: fromPhone,
                    text: buildVoiceFollowUpMessage(tenant),
                  });
                }
              },
              onHumanHandover: async () => {
                if (deps.redirectToHuman) {
                  return deps.redirectToHuman({ tenant, callSid, fromPhone });
                }
                const redirected = await redirectCallToHuman({ callSid, callerId: to });
                if (!redirected) {
                  logger.warn(
                    'Transferencia a recepción no configurada; la llamada se cierra con aviso',
                    { callSid, tenantId: tenant.id }
                  );
                }
                return redirected;
              },
            });

            logger.info('Sesión de voz iniciada', {
              callSid,
              streamSid,
              tenantId: tenant.id,
              from: maskPhone(fromPhone),
            });
            break;
          }

          case 'media':
            session?.handleMedia(String(message.media?.payload ?? ''));
            break;

          case 'mark':
            session?.handleMark(message.mark?.name);
            break;

          case 'dtmf': {
            const digit = message.dtmf?.digit;
            logger.debug('DTMF recibido durante la llamada', { callSid: session?.callSid, digit });
            // '0' activa exactamente el mismo flujo de transferencia a
            // recepción humana que usa `requiresHumanHandover`; otras teclas
            // se ignoran (no hace falta responder).
            session?.handleDtmf(digit);
            break;
          }

          case 'stop': {
            const active = session;
            session = null;
            if (active) {
              await active.handleStop();
              await chargeVoiceUsage(active, logger);
            }
            close(1000, 'call_ended');
            break;
          }

          default:
            logger.debug('Evento de Twilio no manejado', { event: message.event });
        }
      })();
    });

    ws.on('error', (error: unknown) => {
      logger.warn('Error en el WebSocket de voz', {
        err: error instanceof Error ? error.message : String(error),
        callSid: session?.callSid,
      });
    });

    ws.on('close', () => {
      closed = true;
      const active = session;
      session = null;
      if (active) {
        // Una llamada que se cae sin evento 'stop' también consumió minutos:
        // no cobrarla dejaría una vía trivial para rebasar el cupo del plan.
        void active.handleStop().then(() => chargeVoiceUsage(active, logger));
      }
    });
  }

  /**
   * Envía el evento de interrupción (barge-in) a Twilio para silenciar al bot
   * de inmediato.
   */
  static sendBargeInClear(ws: WebSocket, streamSid: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          event: 'clear',
          streamSid,
        })
      );
    }
  }
}
