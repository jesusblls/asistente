import { WebSocket as NodeWebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { TWILIO_SAMPLE_RATE } from './audio.js';
import type { VoiceLogger } from './types.js';

/**
 * Síntesis de voz (Text-to-Speech) para llamadas telefónicas.
 *
 * El proveedor por defecto es Cartesia Sonic. `synthesizeStream` usa el
 * WebSocket de Cartesia para entregar el audio en cuanto llega cada chunk
 * (primer audio en ~100-300ms), en vez de esperar la respuesta completa como
 * hace `synthesize` (REST `/tts/bytes`, que se conserva por compatibilidad y
 * para las pruebas existentes). `fetch`/el WebSocket son inyectables para
 * probar el cliente sin red.
 */

export interface TtsSynthesisOptions {
  signal?: AbortSignal;
}

export interface TtsStreamOptions extends TtsSynthesisOptions {
  /** Se invoca por cada bloque de audio mu-law 8 kHz mono recibido, en orden. */
  onChunk: (chunk: Buffer) => void;
}

export interface TextToSpeechProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  /** Devuelve audio mu-law 8 kHz mono listo para Twilio (espera el audio completo). */
  synthesize(text: string, options?: TtsSynthesisOptions): Promise<Buffer>;
  /** Igual que `synthesize`, pero entrega el audio por partes a medida que llega. */
  synthesizeStream(text: string, options: TtsStreamOptions): Promise<void>;
}

export interface WebSocketLike {
  readyState: number;
  send(data: unknown): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  on(event: 'open' | 'message' | 'error' | 'close', listener: (...args: unknown[]) => void): unknown;
}

export type TtsWebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;

const defaultWebSocketFactory: TtsWebSocketFactory = (url, headers) =>
  new NodeWebSocket(url, { headers }) as unknown as WebSocketLike;

export interface CartesiaOptions {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  language?: string;
  apiBase?: string;
  version?: string;
  timeoutMs?: number;
  logger?: VoiceLogger;
  fetchImpl?: typeof fetch;
  webSocketFactory?: TtsWebSocketFactory;
}

interface CartesiaChunkMessage {
  type?: string;
  data?: string;
  done?: boolean;
  context_id?: string;
  error?: string;
  message?: string;
}

export class CartesiaTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = 'cartesia';
  private readonly apiKey?: string;
  private readonly voiceId?: string;
  private readonly modelId: string;
  private readonly language: string;
  private readonly apiBase: string;
  private readonly version: string;
  private readonly timeoutMs: number;
  private readonly logger?: VoiceLogger;
  private readonly fetchImpl: typeof fetch;
  private readonly webSocketFactory: TtsWebSocketFactory;

  constructor(options: CartesiaOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.CARTESIA_API_KEY;
    this.voiceId = options.voiceId ?? process.env.CARTESIA_VOICE_ID;
    this.modelId = options.modelId ?? process.env.CARTESIA_MODEL ?? 'sonic-2';
    this.language = options.language ?? process.env.CARTESIA_LANGUAGE ?? 'es';
    this.apiBase = options.apiBase ?? process.env.CARTESIA_API_BASE ?? 'https://api.cartesia.ai';
    this.version = options.version ?? process.env.CARTESIA_VERSION ?? '2024-06-10';
    this.timeoutMs = Number(options.timeoutMs ?? process.env.CARTESIA_TIMEOUT_MS ?? 8000);
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.voiceId);
  }

  async synthesize(text: string, options: TtsSynthesisOptions = {}): Promise<Buffer> {
    const transcript = text.replace(/\s+/g, ' ').trim();
    if (!transcript) return Buffer.alloc(0);

    if (!this.apiKey || !this.voiceId) {
      throw new Error('Cartesia no está configurado: faltan CARTESIA_API_KEY y CARTESIA_VOICE_ID');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const response = await this.fetchImpl(`${this.apiBase}/tts/bytes`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Cartesia-Version': this.version,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: this.modelId,
          transcript,
          voice: { mode: 'id', id: this.voiceId },
          language: this.language,
          output_format: {
            container: 'raw',
            encoding: 'pcm_mulaw',
            sample_rate: TWILIO_SAMPLE_RATE,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `Cartesia respondió HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
        );
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger?.warn('Falló la síntesis de voz', {
        err: error instanceof Error ? error.message : String(error),
        characters: transcript.length,
      });
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  async synthesizeStream(text: string, options: TtsStreamOptions): Promise<void> {
    const transcript = text.replace(/\s+/g, ' ').trim();
    if (!transcript) return;

    if (!this.apiKey || !this.voiceId) {
      throw new Error('Cartesia no está configurado: faltan CARTESIA_API_KEY y CARTESIA_VOICE_ID');
    }

    const wsBase = this.apiBase.replace(/^http/, 'ws');
    const url = `${wsBase}/tts/websocket?cartesia_version=${encodeURIComponent(this.version)}`;
    const socket = this.webSocketFactory(url, { 'X-API-Key': this.apiKey });
    const contextId = randomUUID();

    const timer = setTimeout(() => {
      socket.close();
    }, this.timeoutMs);
    timer.unref?.();

    const onExternalAbort = () => {
      try {
        socket.close();
      } catch {
        // Cerrar un socket ya caído no es un error recuperable.
      }
    };
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (err?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        };

        socket.on('open', () => {
          socket.send(
            JSON.stringify({
              model_id: this.modelId,
              transcript,
              voice: { mode: 'id', id: this.voiceId },
              language: this.language,
              output_format: {
                container: 'raw',
                encoding: 'pcm_mulaw',
                sample_rate: TWILIO_SAMPLE_RATE,
              },
              context_id: contextId,
              continue: false,
            })
          );
        });

        socket.on('message', (raw: unknown) => {
          let msg: CartesiaChunkMessage;
          try {
            msg = JSON.parse(String(raw)) as CartesiaChunkMessage;
          } catch {
            return;
          }

          if (msg.type === 'error') {
            finish(new Error(`Cartesia devolvió un error: ${msg.error || msg.message || 'desconocido'}`));
            try {
              socket.close();
            } catch {
              // ignorar
            }
            return;
          }

          if (msg.data) {
            options.onChunk(Buffer.from(msg.data, 'base64'));
          }

          if (msg.done) {
            finish();
            try {
              socket.close();
            } catch {
              // ignorar
            }
          }
        });

        socket.on('error', (err: unknown) => {
          finish(err instanceof Error ? err : new Error(String(err)));
        });

        socket.on('close', () => {
          // Un cierre sin `done` (p. ej. por abort) no es un error de Cartesia;
          // simplemente dejamos de esperar más audio.
          finish();
        });
      });
    } catch (error) {
      this.logger?.warn('Falló la síntesis de voz en streaming', {
        err: error instanceof Error ? error.message : String(error),
        characters: transcript.length,
      });
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
