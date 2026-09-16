import { WebSocket as NodeWebSocket } from 'ws';
import { TWILIO_SAMPLE_RATE } from './audio.js';
import type { VoiceLogger } from './types.js';

/**
 * Reconocimiento de voz (Speech-to-Text) para llamadas telefónicas.
 *
 * El proveedor por defecto es Deepgram Nova-2 sobre WebSocket, con audio
 * mu-law 8 kHz tal cual lo entrega Twilio (sin transcodificar). El provider y
 * el socket son inyectables para poder probar el pipeline sin red ni llaves.
 */

export interface SttSessionOptions {
  language?: string;
  onPartial?: (text: string) => void;
}

export interface SttSession {
  /** Envía un bloque de audio mu-law 8 kHz al motor de reconocimiento. */
  pushAudio(chunk: Buffer): void;
  /** Cierra la utterance y devuelve la mejor transcripción disponible. */
  finalize(): Promise<string>;
  /** Libera recursos sin esperar transcripción. */
  close(): Promise<void>;
}

export interface SpeechToTextProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  openSession(options?: SttSessionOptions): SttSession;
}

export interface WebSocketLike {
  readyState: number;
  send(data: unknown): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  on(event: 'open' | 'message' | 'error' | 'close', listener: (...args: unknown[]) => void): unknown;
}

export type WebSocketFactory = (
  url: string,
  headers: Record<string, string>
) => WebSocketLike;

const defaultWebSocketFactory: WebSocketFactory = (url, headers) =>
  new NodeWebSocket(url, { headers }) as unknown as WebSocketLike;

export interface DeepgramOptions {
  apiKey?: string;
  model?: string;
  language?: string;
  endpointingMs?: number;
  finalizeTimeoutMs?: number;
  logger?: VoiceLogger;
  webSocketFactory?: WebSocketFactory;
}

interface DeepgramSessionConfig {
  apiKey: string;
  url: string;
  headers: Record<string, string>;
  finalizeTimeoutMs: number;
  logger?: VoiceLogger;
  factory: WebSocketFactory;
  onPartial?: (text: string) => void;
}

export class DeepgramSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = 'deepgram';
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly language: string;
  private readonly endpointingMs: number;
  private readonly finalizeTimeoutMs: number;
  private readonly logger?: VoiceLogger;
  private readonly factory: WebSocketFactory;

  constructor(options: DeepgramOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPGRAM_API_KEY;
    this.model = options.model ?? process.env.DEEPGRAM_MODEL ?? 'nova-2';
    this.language = options.language ?? process.env.DEEPGRAM_LANGUAGE ?? 'es';
    this.endpointingMs = Number(
      options.endpointingMs ?? process.env.DEEPGRAM_ENDPOINTING_MS ?? 300
    );
    this.finalizeTimeoutMs = Number(
      options.finalizeTimeoutMs ?? process.env.DEEPGRAM_FINALIZE_TIMEOUT_MS ?? 6000
    );
    this.logger = options.logger;
    this.factory = options.webSocketFactory ?? defaultWebSocketFactory;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /** URL de conexión (exportada para pruebas y diagnóstico). */
  buildUrl(language?: string): string {
    const params = new URLSearchParams({
      model: this.model,
      language: language ?? this.language,
      encoding: 'mulaw',
      sample_rate: String(TWILIO_SAMPLE_RATE),
      channels: '1',
      punctuate: 'true',
      smart_format: 'true',
      interim_results: 'true',
      endpointing: String(this.endpointingMs),
    });
    return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  }

  openSession(options: SttSessionOptions = {}): SttSession {
    if (!this.apiKey) {
      return new UnavailableSttSession('Deepgram no está configurado (falta DEEPGRAM_API_KEY)');
    }

    return new DeepgramSttSession({
      apiKey: this.apiKey,
      url: this.buildUrl(options.language),
      headers: { Authorization: `Token ${this.apiKey}` },
      finalizeTimeoutMs: this.finalizeTimeoutMs,
      logger: this.logger,
      factory: this.factory,
      onPartial: options.onPartial,
    });
  }
}

/** Sesión que no hace nada: se usa cuando el proveedor no tiene credenciales. */
export class UnavailableSttSession implements SttSession {
  constructor(private readonly reason: string) {}

  pushAudio(): void {
    // Sin proveedor configurado no hay nada que enviar.
  }

  async finalize(): Promise<string> {
    return '';
  }

  async close(): Promise<void> {
    // Sin recursos que liberar.
  }

  get unavailableReason(): string {
    return this.reason;
  }
}

class DeepgramSttSession implements SttSession {
  /**
   * Techo de audio en espera mientras el socket abre: 2 s de mu-law 8 kHz.
   * Evita crecimiento sin límite si el proveedor tarda o nunca responde.
   */
  private static readonly MAX_PENDING_AUDIO_BYTES = TWILIO_SAMPLE_RATE * 2;

  private readonly config: DeepgramSessionConfig;
  private socket: WebSocketLike | null = null;
  private opened = false;
  private failed = false;
  private closed = false;
  private pendingAudio: Buffer[] = [];
  private finals: string[] = [];
  private receivedFinal = false;
  private resolveFinal: ((text: string) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: DeepgramSessionConfig) {
    this.config = config;
    this.connect();
  }

  private connect(): void {
    try {
      this.socket = this.config.factory(this.config.url, this.config.headers);
    } catch (error) {
      this.failed = true;
      this.config.logger?.error('No se pudo abrir la conexión con Deepgram', error);
      return;
    }

    this.socket.on('open', () => {
      this.opened = true;
      for (const chunk of this.pendingAudio) {
        this.socket?.send(chunk);
      }
      this.pendingAudio = [];
    });

    this.socket.on('message', (data: unknown) => this.handleMessage(data));

    this.socket.on('error', (error: unknown) => {
      this.failed = true;
      this.config.logger?.warn('Error en la conexión de Deepgram', {
        err: error instanceof Error ? error.message : String(error),
      });
      this.resolvePendingFinal();
    });

    this.socket.on('close', () => {
      this.opened = false;
      // Deepgram puede cerrar el socket sin mandar ningún Results final
      // cuando no hubo nada que transcribir; eso también es una respuesta
      // definitiva (transcripción vacía), no un motivo para seguir esperando.
      this.receivedFinal = true;
      this.resolvePendingFinal();
    });
  }

  private handleMessage(data: unknown): void {
    try {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      const payload = JSON.parse(raw) as {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: { transcript?: string }[] };
      };

      if (payload.type !== 'Results') return;

      const transcript = payload.channel?.alternatives?.[0]?.transcript ?? '';

      if (payload.is_final) {
        // Un resultado final "vacío" (nada más que transcribir tras el
        // CloseStream) también cuenta como respuesta definitiva de Deepgram:
        // antes se descartaba silenciosamente y la llamada se quedaba
        // esperando los 6s completos del timeout aunque Deepgram ya hubiera
        // contestado que no había nada.
        if (transcript) this.finals.push(transcript);
        this.receivedFinal = true;
      }
      if (transcript) this.config.onPartial?.(transcript);
      this.resolvePendingFinal();
    } catch (error) {
      this.config.logger?.warn('Respuesta ilegible de Deepgram', {
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private transcript(): string {
    return this.finals.join(' ').trim();
  }

  private resolvePendingFinal(): void {
    if (!this.resolveFinal) return;
    if (this.finals.length === 0 && !this.failed && !this.closed && !this.receivedFinal) return;
    const resolve = this.resolveFinal;
    this.resolveFinal = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    resolve(this.transcript());
  }

  pushAudio(chunk: Buffer): void {
    if (this.closed || this.failed) return;
    if (this.opened && this.socket) {
      this.socket.send(chunk);
      return;
    }
    this.pendingAudio.push(chunk);
    let queued = this.pendingAudio.reduce((total, item) => total + item.length, 0);
    while (queued > DeepgramSttSession.MAX_PENDING_AUDIO_BYTES && this.pendingAudio.length > 1) {
      const dropped = this.pendingAudio.shift();
      queued -= dropped?.length ?? 0;
    }
  }

  async finalize(): Promise<string> {
    if (this.closed) return this.transcript();

    const already = this.transcript();
    if (already) {
      this.sendCloseStream();
      await this.close();
      return already;
    }

    if (this.failed || !this.socket) {
      await this.close();
      return '';
    }

    const done = new Promise<string>((resolve) => {
      this.resolveFinal = resolve;
      this.timer = setTimeout(() => {
        this.config.logger?.warn('Tiempo de espera agotado al cerrar la utterance en Deepgram');
        this.resolveFinal = null;
        this.timer = null;
        resolve(this.transcript());
      }, this.config.finalizeTimeoutMs);
      this.timer.unref?.();
    });

    this.sendCloseStream();

    const text = await done;
    await this.close();
    return text;
  }

  /** Cierra el stream de Deepgram de forma explícita (best-effort). */
  private sendCloseStream(): void {
    try {
      this.socket?.send(JSON.stringify({ type: 'CloseStream' }));
    } catch (error) {
      this.config.logger?.warn('No se pudo cerrar el stream de Deepgram', {
        err: error instanceof Error ? error.message : String(error),
      });
      this.resolvePendingFinal();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingAudio = [];
    try {
      this.socket?.close();
    } catch {
      // Cerrar un socket ya caído no es un error recuperable.
    }
    this.socket = null;
  }
}
