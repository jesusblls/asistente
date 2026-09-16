import { TWILIO_FRAME_BYTES, TWILIO_FRAME_MS, chunkMulaw, mulawRms } from './audio.js';
import type { SpeechToTextProvider, SttSession } from './stt.js';
import type { TextToSpeechProvider } from './tts.js';
import type { TranscriptStore, TranscriptTurn } from './transcriptStore.js';
import { silentVoiceLogger, type VoiceLogger } from './types.js';

/**
 * Limpia el texto del agente antes de sintetizarlo por voz. El mismo texto
 * sirve para WhatsApp/texto ("$850 MXN", "**Fecha:**"), pero leído en voz
 * alta Cartesia interpreta "$" como "dólares" y deja el "MXN" suelto (suena
 * "850 dólares M-X-N"); el markdown de negritas también se lee literal.
 */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/\$\s*([\d.,]+)(?:\s*MXN)?/gi, '$1 pesos')
    .replace(/\bMXN\b/gi, 'pesos')
    .replace(/\*\*/g, '')
    .replace(/(?<!\d)\*(?!\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Orquestador del ciclo conversacional de una llamada telefónica:
 *
 *   audio del paciente (mu-law 8 kHz)
 *     -> detección de voz y segmentación por silencio
 *     -> STT (Deepgram)
 *     -> OmnichannelAgent (triaje + agenda + FAQ)
 *     -> TTS (Cartesia)
 *     -> audio de vuelta a Twilio
 *
 * El pipeline es agnóstico del transporte: recibe y emite eventos de Twilio
 * Media Streams a través de `send`, y todas sus dependencias (agente, STT,
 * TTS, persistencia, reloj) son inyectables para poder probarlo sin red.
 */

export interface VoiceHistoryEntry {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface VoiceAgentContext {
  tenantId: string;
  patientPhone: string;
  patientName?: string;
  channel: 'PHONE_CALL';
  conversationId?: string;
}

export interface VoiceAgentResponse {
  replyText: string;
  appointmentBooked?: unknown;
  requiresHumanHandover?: boolean;
  triageAlert?: unknown;
  shouldEndCall?: boolean;
}

export interface VoiceAgent {
  processMessage(
    incomingText: string,
    context: VoiceAgentContext,
    conversationHistory: VoiceHistoryEntry[]
  ): Promise<VoiceAgentResponse>;
}

export interface VoiceTenant {
  id: string;
  name: string;
  timezone?: string;
}

export type VoicePipelineMode = 'auto' | 'on' | 'off';

export interface VoicePipelineConfig {
  mode: VoicePipelineMode;
  language: string;
  /** Energía RMS mínima (0..1) para considerar que hay voz humana. */
  speechRmsThreshold: number;
  /** Silencio continuo que cierra la utterance en curso. */
  silenceMs: number;
  /** Voz mínima acumulada para considerar la utterance válida. */
  minSpeechMs: number;
  /** Techo de duración de una utterance antes de forzar su cierre. */
  maxUtteranceMs: number;
  maxTurns: number;
  maxCallMs: number;
  bargeInEnabled: boolean;
  /** Tramas de voz consecutivas del paciente que cortan al bot. */
  bargeInFrames: number;
  paceAudio: boolean;
  markTimeoutMs: number;
  shutdownDrainMs: number;
  hangupOnHandover: boolean;
  /** Silencio total (sin utterance en curso, con el bot callado) antes de reinsistir. */
  silenceRepromptMs: number;
  /** Reinsistencias máximas antes de despedirse y colgar por silencio. */
  maxReprompts: number;
}

export const VOICE_FALLBACK_REPLY =
  'Disculpe, no alcancé a escucharlo. ¿Me lo puede repetir, por favor?';
export const VOICE_MAX_TURNS_REPLY =
  'Le agradezco mucho su llamada. Para poder atenderle con calma, le pido marcar de nuevo en un momento o escribirnos por WhatsApp. Hasta luego.';
export const VOICE_HANDOVER_REPLY =
  'Le comunico con nuestro equipo de recepción. Le pido permanecer en la línea un momento, por favor.';
export const VOICE_FAREWELL_REPLY = 'Gracias por llamar. Hasta luego.';
/** Se usa cuando Cartesia falla a media respuesta, para no dejar la línea muda. */
export const VOICE_TTS_ERROR_REPLY =
  'Disculpe, tuve un problema técnico. ¿Podría repetir su pregunta, por favor?';
/** Reinsistencia cuando el paciente deja de hablar por completo. */
export const VOICE_SILENCE_REPROMPT_REPLY = '¿Hola? ¿Sigue en la línea?';

function envNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const parsed = Number(env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on|si|sí)$/i.test(raw);
}

function envMode(env: NodeJS.ProcessEnv): VoicePipelineMode {
  const raw = (env.VOICE_PIPELINE_ENABLED || 'auto').toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(raw)) return 'on';
  if (['off', 'false', '0', 'no'].includes(raw)) return 'off';
  return 'auto';
}

export function resolveVoicePipelineConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<VoicePipelineConfig> = {}
): VoicePipelineConfig {
  return {
    mode: envMode(env),
    language: env.VOICE_LANGUAGE || env.DEEPGRAM_LANGUAGE || 'es',
    // 0.02 resultó demasiado sensible en llamadas reales: clics de teclado y
    // ruido de fondo del micrófono del teléfono lo cruzaban y el bot se
    // interrumpía solo (o abría una "utterance" sin voz real que Deepgram
    // nunca podía transcribir). 0.04 sigue detectando voz normal.
    speechRmsThreshold: Number(env.VOICE_SPEECH_RMS_THRESHOLD) || 0.04,
    silenceMs: envNumber(env, 'VOICE_SILENCE_MS', 700),
    minSpeechMs: envNumber(env, 'VOICE_MIN_SPEECH_MS', 250),
    maxUtteranceMs: envNumber(env, 'VOICE_MAX_UTTERANCE_MS', 15000),
    maxTurns: envNumber(env, 'VOICE_MAX_TURNS', 30),
    maxCallMs: envNumber(env, 'VOICE_MAX_CALL_MS', 15 * 60 * 1000),
    bargeInEnabled: envBool(env, 'VOICE_BARGE_IN', true),
    bargeInFrames: envNumber(env, 'VOICE_BARGE_IN_FRAMES', 8),
    paceAudio: envBool(env, 'VOICE_PACE_AUDIO', true),
    markTimeoutMs: envNumber(env, 'VOICE_MARK_TIMEOUT_MS', 20000),
    shutdownDrainMs: envNumber(env, 'VOICE_DRAIN_TIMEOUT_MS', 5000),
    hangupOnHandover: envBool(env, 'VOICE_HANGUP_ON_HANDOVER', true),
    silenceRepromptMs: envNumber(env, 'VOICE_SILENCE_REPROMPT_MS', 8000),
    maxReprompts: envNumber(env, 'VOICE_MAX_REPROMPTS', 2),
    ...overrides,
  };
}

/**
 * En modo `auto` la voz sólo se habilita cuando STT y TTS están configurados.
 * Así, sin llaves, el WebSocket se cierra de forma explícita en lugar de dejar
 * al paciente en una línea muda.
 */
export function isVoicePipelineEnabled(params: {
  stt: SpeechToTextProvider;
  tts: TextToSpeechProvider;
  config: VoicePipelineConfig;
}): boolean {
  if (params.config.mode === 'off') return false;
  // Tanto en `auto` como en `on` hacen falta ambos proveedores: sin STT no hay
  // nada que escuchar y sin TTS no hay nada que responder.
  return params.stt.isConfigured && params.tts.isConfigured;
}

export interface VoiceCallSessionDeps {
  streamSid: string;
  callSid: string;
  fromPhone: string;
  toPhone: string;
  tenant: VoiceTenant;
  patientName?: string;
  agent: VoiceAgent;
  stt: SpeechToTextProvider;
  tts: TextToSpeechProvider;
  /** Envía un evento JSON a Twilio Media Streams. */
  send: (payload: Record<string, unknown>) => void;
  /** Cierra el WebSocket (código, motivo). */
  close: (code?: number, reason?: string) => void;
  logger?: VoiceLogger;
  transcriptStore?: TranscriptStore;
  /** Seguimiento post-llamada (normalmente WhatsApp). */
  notifyFollowUp?: () => Promise<unknown> | unknown;
  /** Transfiere la llamada en curso a recepción humana (Twilio redirect). */
  onHumanHandover?: () => Promise<unknown> | unknown;
  config?: Partial<VoicePipelineConfig>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface VoiceCallStats {
  turns: number;
  utterances: number;
  bargeIns: number;
  durationMs: number;
  handoverRequested: boolean;
  appointmentBooked: boolean;
  stopped: boolean;
}

interface ActiveUtterance {
  session: SttSession;
  silenceMs: number;
  speechMs: number;
  durationMs: number;
}

export class VoiceCallSession {
  readonly streamSid: string;
  readonly callSid: string;
  readonly fromPhone: string;
  readonly toPhone: string;
  readonly tenant: VoiceTenant;

  private readonly agent: VoiceAgent;
  private readonly stt: SpeechToTextProvider;
  private readonly tts: TextToSpeechProvider;
  private readonly deps: VoiceCallSessionDeps;
  private readonly logger: VoiceLogger;
  private readonly config: VoicePipelineConfig;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly history: VoiceHistoryEntry[] = [];

  private utterance: ActiveUtterance | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pendingMark: { name: string; resolve: () => void } | null = null;
  private synthesisController: AbortController | null = null;
  private playbackToken = 0;
  private loudDuringPlayback = 0;
  private turnCount = 0;
  private utteranceCount = 0;
  private bargeInCount = 0;
  private speaking = false;
  private stopped = false;
  private handoverRequested = false;
  private appointmentBooked = false;
  private readonly startedAt: number;
  /** Milisegundos de silencio total (bot callado, sin utterance) acumulados. */
  private silenceSinceActivityMs = 0;
  private repromptCount = 0;
  /** true mientras un turno está en cola/procesándose (STT ya cerró, agente y TTS en vuelo). */
  private busy = false;

  constructor(deps: VoiceCallSessionDeps) {
    this.deps = deps;
    this.streamSid = deps.streamSid;
    this.callSid = deps.callSid;
    this.fromPhone = deps.fromPhone;
    this.toPhone = deps.toPhone;
    this.tenant = deps.tenant;
    this.agent = deps.agent;
    this.stt = deps.stt;
    this.tts = deps.tts;
    this.logger = deps.logger ?? silentVoiceLogger;
    this.config = resolveVoicePipelineConfig(process.env, deps.config);
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.startedAt = this.now();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get historyLength(): number {
    return this.history.length;
  }

  getStats(): VoiceCallStats {
    return {
      turns: this.turnCount,
      utterances: this.utteranceCount,
      bargeIns: this.bargeInCount,
      durationMs: this.now() - this.startedAt,
      handoverRequested: this.handoverRequested,
      appointmentBooked: this.appointmentBooked,
      stopped: this.stopped,
    };
  }

  /** Procesa un evento `media` de Twilio (payload base64 mu-law). */
  handleMedia(payloadBase64: string): void {
    if (this.stopped || !payloadBase64) return;
    const frame = Buffer.from(payloadBase64, 'base64');
    if (frame.length === 0) return;
    this.onFrame(frame);
  }

  /** Confirma la reproducción de un `mark` enviado a Twilio. */
  handleMark(name?: string): void {
    if (!name || !this.pendingMark) return;
    if (this.pendingMark.name === name) {
      this.pendingMark.resolve();
    }
  }

  /** Interrupción manual (barge-in externo o fin de llamada). */
  interrupt(reason = 'manual'): void {
    if (!this.speaking) return;
    this.interruptPlayback(reason);
  }

  /** Cierra la sesión: drena turnos en vuelo y dispara el seguimiento. */
  async handleStop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    const active = this.utterance;
    this.utterance = null;
    if (active) {
      await active.session.close().catch(() => undefined);
    }

    await Promise.race([
      this.queue.catch(() => undefined),
      this.sleep(this.config.shutdownDrainMs),
    ]);

    const stats = this.getStats();
    this.logger.info('Llamada de voz finalizada', {
      callSid: this.callSid,
      tenantId: this.tenant.id,
      turns: stats.turns,
      bargeIns: stats.bargeIns,
      durationMs: stats.durationMs,
      handoverRequested: stats.handoverRequested,
      appointmentBooked: stats.appointmentBooked,
    });

    if (this.deps.notifyFollowUp) {
      try {
        await this.deps.notifyFollowUp();
      } catch (error) {
        this.logger.warn('No se pudo enviar el seguimiento post-llamada', {
          callSid: this.callSid,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private onFrame(frame: Buffer): void {
    const frameMs = (frame.length / TWILIO_FRAME_BYTES) * TWILIO_FRAME_MS;

    if (this.now() - this.startedAt > this.config.maxCallMs) {
      void this.endCall('max_duration');
      return;
    }

    const speech = mulawRms(frame) >= this.config.speechRmsThreshold;

    if (this.speaking) {
      if (speech && this.config.bargeInEnabled) {
        this.loudDuringPlayback += 1;
        if (this.loudDuringPlayback >= this.config.bargeInFrames) {
          this.interruptPlayback('barge_in');
        }
      } else if (!speech) {
        this.loudDuringPlayback = 0;
      }
    }

    if (!this.utterance) {
      if (!speech) {
        // Solo cuenta como "silencio total" cuando el bot no está hablando y
        // no hay un turno en vuelo (STT/agente/TTS): de lo contrario la
        // latencia normal del agente podría disparar una reinsistencia falsa.
        if (this.speaking || this.busy || this.stopped) {
          this.silenceSinceActivityMs = 0;
        } else {
          this.silenceSinceActivityMs += frameMs;
          this.checkSilenceReprompt();
        }
        return;
      }
      this.silenceSinceActivityMs = 0;
      this.repromptCount = 0;
      this.utterance = {
        session: this.stt.openSession({
          language: this.config.language,
          onPartial: (text) =>
            this.logger.debug('Transcripción parcial de voz', {
              callSid: this.callSid,
              characters: text.length,
            }),
        }),
        silenceMs: 0,
        speechMs: 0,
        durationMs: 0,
      };
      this.utteranceCount += 1;
    } else {
      this.silenceSinceActivityMs = 0;
    }

    const utterance = this.utterance;
    utterance.session.pushAudio(frame);
    utterance.durationMs += frameMs;
    if (speech) {
      utterance.speechMs += frameMs;
      utterance.silenceMs = 0;
    } else {
      utterance.silenceMs += frameMs;
    }

    if (
      utterance.silenceMs >= this.config.silenceMs ||
      utterance.durationMs >= this.config.maxUtteranceMs
    ) {
      void this.finishUtterance();
    }
  }

  /**
   * Si el paciente no ha dicho nada (ni hay turno en curso) durante
   * `silenceRepromptMs`, se le pregunta si sigue en la línea. Tras agotar
   * `maxReprompts` intentos sin respuesta, se despide y cuelga en vez de
   * dejar la llamada abierta hasta `maxCallMs`.
   */
  private checkSilenceReprompt(): void {
    if (this.silenceSinceActivityMs < this.config.silenceRepromptMs) return;
    this.silenceSinceActivityMs = 0;
    this.repromptCount += 1;

    if (this.repromptCount > this.config.maxReprompts) {
      this.logger.info('Silencio total del paciente agotó las reinsistencias; se cuelga', {
        callSid: this.callSid,
        repromptCount: this.repromptCount,
      });
      void this.endCall('silence_timeout');
      return;
    }

    this.logger.info('Silencio total del paciente; se reinsiste', {
      callSid: this.callSid,
      repromptCount: this.repromptCount,
    });
    void this.speak(VOICE_SILENCE_REPROMPT_REPLY);
  }

  private async finishUtterance(): Promise<void> {
    const utterance = this.utterance;
    if (!utterance) return;
    this.utterance = null;

    if (utterance.speechMs < this.config.minSpeechMs) {
      await utterance.session.close().catch(() => undefined);
      return;
    }

    let transcript = '';
    try {
      const sttStartedAt = this.now();
      transcript = (await utterance.session.finalize()).trim();
      this.logger.info('Latencia STT (Deepgram finalize)', {
        callSid: this.callSid,
        durationMs: this.now() - sttStartedAt,
      });
    } catch (error) {
      this.logger.warn('No se pudo transcribir el turno de voz', {
        callSid: this.callSid,
        err: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!transcript) {
      this.logger.debug('Turno de voz sin transcripción; se solicita repetir', {
        callSid: this.callSid,
      });
      this.enqueueTurn('', { repeat: true });
      return;
    }

    this.enqueueTurn(transcript, { repeat: false });
  }

  private enqueueTurn(transcript: string, options: { repeat: boolean }): void {
    this.busy = true;
    this.queue = this.queue
      .then(() => this.processTurn(transcript, options))
      .catch((error) => {
        this.logger.error('Error procesando un turno de voz', error, {
          callSid: this.callSid,
        });
      })
      .finally(() => {
        this.busy = false;
      });
  }

  /** Procesa el tono DTMF '0': transferencia inmediata a recepción humana. */
  handleDtmf(digit?: string): void {
    if (this.stopped || !digit || digit !== '0') return;
    this.logger.info('El paciente presionó 0: se solicita transferencia a recepción', {
      callSid: this.callSid,
    });
    this.busy = true;
    this.queue = this.queue
      .then(() => this.triggerHumanHandover())
      .catch((error) => {
        this.logger.error('Error procesando la transferencia por DTMF', error, {
          callSid: this.callSid,
        });
      })
      .finally(() => {
        this.busy = false;
      });
  }

  /**
   * Flujo único de transferencia a recepción humana, compartido entre el
   * handover que pide el agente (`requiresHumanHandover`) y el tono DTMF '0'.
   * Idempotente: si ya se solicitó handover en esta llamada, no repite nada.
   */
  private async triggerHumanHandover(transcriptForRecord = ''): Promise<void> {
    if (this.handoverRequested || this.stopped) return;
    this.handoverRequested = true;
    await this.deps.transcriptStore?.markHandover(this.turnPayload(transcriptForRecord));

    if (!this.config.hangupOnHandover) return;

    await this.speak(VOICE_HANDOVER_REPLY);
    if (this.deps.onHumanHandover) {
      try {
        await this.deps.onHumanHandover();
      } catch (error) {
        this.logger.warn('No se pudo transferir la llamada a recepción', {
          callSid: this.callSid,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.endCall('handover', false);
  }

  private turnPayload(content: string): TranscriptTurn {
    return {
      tenantId: this.tenant.id,
      callSid: this.callSid,
      patientPhone: this.fromPhone,
      patientName: this.deps.patientName,
      content,
    };
  }

  private async processTurn(transcript: string, options: { repeat: boolean }): Promise<void> {
    if (this.stopped) return;

    if (options.repeat) {
      await this.speak(VOICE_FALLBACK_REPLY);
      return;
    }

    this.turnCount += 1;
    if (this.turnCount > this.config.maxTurns) {
      await this.speak(VOICE_MAX_TURNS_REPLY);
      await this.endCall('max_turns', false);
      return;
    }

    await this.deps.transcriptStore?.recordInbound(this.turnPayload(transcript));

    const context: VoiceAgentContext = {
      tenantId: this.tenant.id,
      patientPhone: this.fromPhone,
      patientName: this.deps.patientName,
      channel: 'PHONE_CALL',
    };

    const agentStartedAt = this.now();
    const response = await this.agent.processMessage(transcript, context, [...this.history]);
    this.logger.info('Latencia del agente (LLM + herramientas)', {
      callSid: this.callSid,
      durationMs: this.now() - agentStartedAt,
    });
    const reply = (response?.replyText ?? '').trim();

    this.history.push(
      { role: 'user', parts: [{ text: transcript }] },
      { role: 'model', parts: [{ text: reply }] }
    );
    if (this.history.length > 16) {
      this.history.splice(0, this.history.length - 16);
    }

    this.logger.info('Turno de voz procesado', {
      callSid: this.callSid,
      tenantId: this.tenant.id,
      userCharacters: transcript.length,
      replyCharacters: reply.length,
      channel: 'PHONE_CALL',
    });

    if (reply) {
      await this.deps.transcriptStore?.recordOutbound(this.turnPayload(reply));
      await this.speak(reply);
    }

    if (response?.appointmentBooked) {
      this.appointmentBooked = true;
    }

    if (response?.requiresHumanHandover) {
      await this.triggerHumanHandover(transcript);
    }

    // La despedida ya se dijo como parte de `reply`; no hace falta otra frase
    // de cierre genérica, solo colgar.
    if (response?.shouldEndCall && !this.stopped) {
      await this.endCall('farewell', false);
    }
  }

  private async speak(
    text: string,
    options: { force?: boolean; isRecoveryAttempt?: boolean } = {}
  ): Promise<void> {
    const force = options.force === true;
    const isRecoveryAttempt = options.isRecoveryAttempt === true;
    const clean = sanitizeForSpeech(text);
    if (!clean) return;

    if (!this.tts.isConfigured) {
      this.logger.warn('TTS sin configurar: no se puede responder por voz', {
        callSid: this.callSid,
      });
      return;
    }
    if (this.stopped && !force) return;

    const token = (this.playbackToken += 1);
    const controller = new AbortController();
    this.synthesisController = controller;
    this.speaking = true;
    this.loudDuringPlayback = 0;

    const ttsStartedAt = this.now();
    let firstChunkAt: number | null = null;

    // Cola de tramas de 20ms (160 bytes) que se va llenando a medida que
    // llega audio de Cartesia por WebSocket, para poder mandarlo a Twilio a
    // ritmo real sin esperar la respuesta completa (antes esto era la
    // principal fuente de silencio muerto: ~6s con el REST /tts/bytes).
    const frames: Buffer[] = [];
    let remainder = Buffer.alloc(0);
    let streamEnded = false;
    let streamError: Error | null = null;
    let waiter: (() => void) | null = null;

    const wake = () => {
      if (waiter) {
        const resolveWaiter = waiter;
        waiter = null;
        resolveWaiter();
      }
    };

    const streamPromise = this.tts
      .synthesizeStream(clean, {
        signal: controller.signal,
        onChunk: (chunk) => {
          if (firstChunkAt === null) firstChunkAt = this.now();
          const data = Buffer.concat([remainder, chunk]);
          const cut = Math.floor(data.length / TWILIO_FRAME_BYTES) * TWILIO_FRAME_BYTES;
          for (const frame of chunkMulaw(data.subarray(0, cut))) frames.push(frame);
          remainder = data.subarray(cut);
          wake();
        },
      })
      .catch((error: unknown) => {
        streamError = error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        if (remainder.length > 0) {
          for (const frame of chunkMulaw(remainder)) frames.push(frame);
          remainder = Buffer.alloc(0);
        }
        streamEnded = true;
        wake();
      });

    try {
      while (true) {
        if (token !== this.playbackToken || (!force && this.stopped)) {
          this.speaking = false;
          controller.abort();
          await streamPromise;
          return;
        }

        const frame = frames.shift();
        if (frame) {
          this.deps.send({
            event: 'media',
            streamSid: this.streamSid,
            media: { payload: frame.toString('base64') },
          });
          if (this.config.paceAudio) {
            await this.sleep(TWILIO_FRAME_MS);
          }
          continue;
        }

        if (streamEnded) break;
        await new Promise<void>((resolve) => {
          waiter = resolve;
        });
      }
    } finally {
      if (firstChunkAt !== null) {
        this.logger.info('Latencia TTS (Cartesia, primer audio)', {
          callSid: this.callSid,
          durationMs: firstChunkAt - ttsStartedAt,
          totalDurationMs: this.now() - ttsStartedAt,
          replyCharacters: clean.length,
        });
      }
    }

    if (streamError) {
      this.speaking = false;
      this.synthesisController = null;
      this.logger.error('No se pudo sintetizar la respuesta de voz', streamError, {
        callSid: this.callSid,
        isRecoveryAttempt,
      });

      // Antes esto dejaba la llamada en silencio total si Cartesia fallaba a
      // media respuesta. Se intenta una disculpa breve una sola vez: si ESE
      // intento también falla (`isRecoveryAttempt`), no se reintenta de nuevo
      // (evita un loop infinito) y se cuelga de forma segura sin más TTS.
      if (isRecoveryAttempt) {
        await this.endCall('tts_error', false);
        return;
      }
      await this.speak(VOICE_TTS_ERROR_REPLY, { force, isRecoveryAttempt: true });
      return;
    }

    if (token !== this.playbackToken) {
      this.speaking = false;
      return;
    }

    const markName = `voice-${this.turnCount}-${token}`;
    this.deps.send({ event: 'mark', streamSid: this.streamSid, mark: { name: markName } });
    await this.waitForMark(markName);
    this.speaking = false;
    this.synthesisController = null;
  }

  private waitForMark(name: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const finish = () => {
        if (this.pendingMark?.name === name) this.pendingMark = null;
        resolve();
      };

      const timer = setTimeout(finish, this.config.markTimeoutMs);
      timer.unref?.();

      this.pendingMark = {
        name,
        resolve: () => {
          clearTimeout(timer);
          finish();
        },
      };
    });
  }

  private interruptPlayback(reason: string): void {
    this.playbackToken += 1;
    this.loudDuringPlayback = 0;
    this.bargeInCount += 1;
    this.synthesisController?.abort();
    this.synthesisController = null;
    this.deps.send({ event: 'clear', streamSid: this.streamSid });
    this.pendingMark?.resolve();
    this.speaking = false;
    this.logger.info('El paciente interrumpió al bot', {
      callSid: this.callSid,
      reason,
      bargeIns: this.bargeInCount,
    });
  }

  private async endCall(reason: string, speakFarewell = true): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (speakFarewell) {
      await this.speak(VOICE_FAREWELL_REPLY, { force: true });
    }
    this.logger.info('Se cierra la llamada de voz', { callSid: this.callSid, reason });
    try {
      this.deps.close(1000, reason);
    } catch {
      // Cerrar un socket ya caído no es un error recuperable.
    }
  }
}
