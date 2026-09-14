import { TWILIO_SAMPLE_RATE } from './audio.js';
import type { VoiceLogger } from './types.js';

/**
 * Síntesis de voz (Text-to-Speech) para llamadas telefónicas.
 *
 * El proveedor por defecto es Cartesia Sonic, que devuelve audio mu-law 8 kHz
 * listo para reenviar a Twilio sin recodificar. `fetch` es inyectable para
 * probar el cliente sin red.
 */

export interface TtsSynthesisOptions {
  signal?: AbortSignal;
}

export interface TextToSpeechProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  /** Devuelve audio mu-law 8 kHz mono listo para Twilio. */
  synthesize(text: string, options?: TtsSynthesisOptions): Promise<Buffer>;
}

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
}
