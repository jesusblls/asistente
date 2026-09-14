import { TWILIO_FRAME_BYTES, TWILIO_FRAME_MS, chunkMulaw, mulawRms } from './audio.js';
import type { SpeechToTextProvider, SttSession } from './stt.js';
import type { TextToSpeechProvider } from './tts.js';
import type { TranscriptStore, TranscriptTurn } from './transcriptStore.js';
import { silentVoiceLogger, type VoiceLogger } from './types.js';

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
}

export const VOICE_FALLBACK_REPLY =
  'Disculpe, no alcancé a escucharlo. ¿Me lo puede repetir, por favor?';
export const VOICE_MAX_TURNS_REPLY =
  'Le agradezco mucho su llamada. Para poder atenderle con calma, le pido marcar de nuevo en un momento o escribirnos por WhatsApp. Hasta luego.';
export const VOICE_HANDOVER_REPLY =
  'Le comunico con nuestro equipo de recepción. Le pido permanecer en la línea un momento, por favor.';
export const VOICE_FAREWELL_REPLY = 'Gracias por llamar. Hasta luego.';

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
    speechRmsThreshold: Number(env.VOICE_SPEECH_RMS_THRESHOLD) || 0.02,
    silenceMs: envNumber(env, 'VOICE_SILENCE_MS', 700),
    minSpeechMs: envNumber(env, 'VOICE_MIN_SPEECH_MS', 250),
    maxUtteranceMs: envNumber(env, 'VOICE_MAX_UTTERANCE_MS', 15000),
    maxTurns: envNumber(env, 'VOICE_MAX_TURNS', 30),
    maxCallMs: envNumber(env, 'VOICE_MAX_CALL_MS', 15 * 60 * 1000),
    bargeInEnabled: envBool(env, 'VOICE_BARGE_IN', true),
    bargeInFrames: envNumber(env, 'VOICE_BARGE_IN_FRAMES', 5),
    paceAudio: envBool(env, 'VOICE_PACE_AUDIO', true),
    markTimeoutMs: envNumber(env, 'VOICE_MARK_TIMEOUT_MS', 20000),
    shutdownDrainMs: envNumber(env, 'VOICE_DRAIN_TIMEOUT_MS', 5000),
    hangupOnHandover: envBool(env, 'VOICE_HANGUP_ON_HANDOVER', true),
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
      if (!speech) return;
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
      transcript = (await utterance.session.finalize()).trim();
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
    this.queue = this.queue
      .then(() => this.processTurn(transcript, options))
      .catch((error) => {
        this.logger.error('Error procesando un turno de voz', error, {
          callSid: this.callSid,
        });
      });
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

    const response = await this.agent.processMessage(transcript, context, [...this.history]);
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
      this.handoverRequested = true;
      await this.deps.transcriptStore?.markHandover(this.turnPayload(transcript));
      if (this.config.hangupOnHandover) {
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
    }
  }

  private async speak(text: string, options: { force?: boolean } = {}): Promise<void> {
    const force = options.force === true;
    const clean = text.replace(/\s+/g, ' ').trim();
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

    let audio: Buffer;
    try {
      audio = await this.tts.synthesize(clean, { signal: controller.signal });
    } catch (error) {
      this.speaking = false;
      this.synthesisController = null;
      if (
        token !== this.playbackToken ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        this.logger.debug('Síntesis cancelada por interrupción del paciente', {
          callSid: this.callSid,
        });
        return;
      }
      this.logger.error('No se pudo sintetizar la respuesta de voz', error, {
        callSid: this.callSid,
      });
      return;
    }

    if (token !== this.playbackToken) {
      this.speaking = false;
      return;
    }

    for (const frame of chunkMulaw(audio)) {
      if (token !== this.playbackToken || (!force && this.stopped)) {
        this.speaking = false;
        return;
      }
      this.deps.send({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload: frame.toString('base64') },
      });
      if (this.config.paceAudio) {
        await this.sleep(TWILIO_FRAME_MS);
      }
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
