/**
 * Utilidades de audio para Twilio Media Streams.
 *
 * Twilio entrega y consume audio mu-law (G.711) mono a 8 kHz en tramas base64
 * de 20 ms (160 bytes = 160 muestras). Todo el pipeline de voz trabaja en ese
 * mismo formato para no transcodificar en cada salto del ciclo
 * paciente -> STT -> agente -> TTS -> paciente.
 */

/** Frecuencia de muestreo que Twilio usa en Media Streams. */
export const TWILIO_SAMPLE_RATE = 8000;
/** Bytes por trama de 20 ms (1 byte por muestra en mu-law). */
export const TWILIO_FRAME_BYTES = 160;
/** Duración de una trama de Twilio en milisegundos. */
export const TWILIO_FRAME_MS = 20;
/** Byte mu-law que representa silencio. */
export const MULAW_SILENCE_BYTE = 0xff;

const MULAW_BIAS = 0x84;
/** Techo del dominio de 14 bits usado por el codificador G.711 canónico. */
const MULAW_CLIP_14BIT = 32635 >> 2;
/** Límites superiores de cada segmento mu-law (tabla `seg_uend` de G.711). */
const MULAW_SEGMENT_ENDS = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];

function buildDecodeTable(): Int16Array {
  const table = new Int16Array(256);
  for (let byte = 0; byte < 256; byte += 1) {
    const inverted = ~byte & 0xff;
    const exponent = (inverted >> 4) & 0x07;
    const mantissa = inverted & 0x0f;
    const magnitude = (((mantissa << 3) + MULAW_BIAS) << exponent) - MULAW_BIAS;
    table[byte] = (inverted & 0x80) !== 0 ? -magnitude : magnitude;
  }
  return table;
}

const DECODE_TABLE = buildDecodeTable();

/** Decodifica un byte mu-law a una muestra PCM de 16 bits. */
export function decodeMulawSample(byte: number): number {
  return DECODE_TABLE[byte & 0xff];
}

/** Decodifica un bloque mu-law completo a PCM 16 bits. */
export function decodeMulaw(buffer: Buffer | Uint8Array): Int16Array {
  const samples = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    samples[i] = DECODE_TABLE[buffer[i] & 0xff];
  }
  return samples;
}

/**
 * Codifica una muestra PCM de 16 bits a mu-law (G.711).
 *
 * Se implementa el algoritmo canónico sobre el dominio de 14 bits
 * (`linear2ulaw` de Sun Microsystems), que es exactamente inverso del
 * decodificador de la tabla salvo el doble cero propio de G.711 (los códigos
 * 0x7F y 0xFF decodifican ambos a 0). La implementación directa sobre 16 bits
 * fallaba además en decenas de códigos, por eso se usa la canónica.
 */
export function encodeMulawSample(sample: number): number {
  let value = Math.round(sample);
  let mask: number;

  if (value < 0) {
    value = -value;
    mask = 0x7f;
  } else {
    mask = 0xff;
  }

  value >>= 2;
  if (value > MULAW_CLIP_14BIT) value = MULAW_CLIP_14BIT;
  value += MULAW_BIAS >> 2;

  let segment = 0;
  while (segment < MULAW_SEGMENT_ENDS.length && value > MULAW_SEGMENT_ENDS[segment]) {
    segment += 1;
  }

  if (segment >= MULAW_SEGMENT_ENDS.length) {
    return (0x7f ^ mask) & 0xff;
  }

  const encoded = (segment << 4) | ((value >> (segment + 1)) & 0x0f);
  return (encoded ^ mask) & 0xff;
}

/** Codifica PCM 16 bits a mu-law. */
export function encodeMulaw(samples: Int16Array | readonly number[]): Buffer {
  const buffer = Buffer.allocUnsafe(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    buffer[i] = encodeMulawSample(samples[i]);
  }
  return buffer;
}

/** Energía RMS normalizada (0..1) de un bloque PCM. */
export function rmsAmplitude(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const normalized = samples[i] / 32768;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}

/** Energía RMS normalizada (0..1) de un bloque mu-law, usada para detectar voz. */
export function mulawRms(buffer: Buffer | Uint8Array): number {
  return rmsAmplitude(decodeMulaw(buffer));
}

/** Decodifica el payload base64 de un evento `media` de Twilio. */
export function base64ToMulaw(payload: string): Buffer {
  return Buffer.from(payload, 'base64');
}

/** Codifica audio mu-law al base64 que espera Twilio en el evento `media`. */
export function mulawToBase64(audio: Buffer): string {
  return audio.toString('base64');
}

/** Duración en milisegundos de un bloque mu-law a 8 kHz (8 muestras por ms). */
export function durationMsOfMulaw(bytes: number): number {
  return (bytes / TWILIO_SAMPLE_RATE) * 1000;
}

/**
 * Divide audio mu-law en tramas de 20 ms. La última trama se rellena con
 * silencio para que Twilio siempre reciba bloques completos de 160 bytes.
 */
export function chunkMulaw(audio: Buffer, frameBytes = TWILIO_FRAME_BYTES): Buffer[] {
  if (audio.length === 0) return [];

  const frames: Buffer[] = [];
  for (let offset = 0; offset < audio.length; offset += frameBytes) {
    const slice = audio.subarray(offset, Math.min(offset + frameBytes, audio.length));
    if (slice.length === frameBytes) {
      frames.push(slice);
    } else {
      const padded = Buffer.alloc(frameBytes, MULAW_SILENCE_BYTE);
      slice.copy(padded);
      frames.push(padded);
    }
  }
  return frames;
}

/** Trama de silencio mu-law del tamaño exacto que espera Twilio. */
export function mulawSilenceFrame(frameBytes = TWILIO_FRAME_BYTES): Buffer {
  return Buffer.alloc(frameBytes, MULAW_SILENCE_BYTE);
}

/** Concatena varios bloques mu-law en uno solo. */
export function concatMulaw(chunks: readonly Buffer[]): Buffer {
  return Buffer.concat(chunks);
}
