import type { WebSocket as WsSocket } from 'ws';
import {
  MULAW_SILENCE_BYTE,
  TWILIO_FRAME_BYTES,
  chunkMulaw,
  decodeMulawSample,
  encodeMulaw,
  encodeMulawSample,
  mulawRms,
  mulawToBase64,
} from './services/voice/audio.js';
import {
  DeepgramSpeechToTextProvider,
  type SpeechToTextProvider,
  type SttSession,
  type WebSocketLike,
} from './services/voice/stt.js';
import { CartesiaTextToSpeechProvider, type TextToSpeechProvider } from './services/voice/tts.js';
import {
  VoiceCallSession,
  isVoicePipelineEnabled,
  resolveVoicePipelineConfig,
  VOICE_SILENCE_REPROMPT_REPLY,
  VOICE_TTS_ERROR_REPLY,
  type VoiceAgent,
  type VoiceAgentContext,
  type VoiceAgentResponse,
  type VoiceCallSessionDeps,
  type VoicePipelineConfig,
} from './services/voice/pipeline.js';
import type { TranscriptStore, TranscriptTurn } from './services/voice/transcriptStore.js';
import { silentVoiceLogger } from './services/voice/types.js';
import { VoiceStreamService } from './services/voiceStreamService.js';
import { buildHumanHandoverTwiml, redirectCallToHuman } from './services/voice/handover.js';

/**
 * Suite del pipeline de voz: audio G.711, proveedores STT/TTS, segmentación por
 * silencio, barge-in, persistencia de turnos y puente con Twilio Media Streams.
 *
 * Todo se ejecuta sin red y sin llaves reales: los proveedores y sockets son
 * inyectables.
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await tick(5);
  }
  return predicate();
}

const silenceFrame = Buffer.alloc(TWILIO_FRAME_BYTES, MULAW_SILENCE_BYTE);

function toneFrame(): Buffer {
  const samples = Int16Array.from({ length: TWILIO_FRAME_BYTES }, (_, i) =>
    Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / 8000))
  );
  return encodeMulaw(samples);
}

function mediaEvent(frame: Buffer): string {
  return JSON.stringify({ event: 'media', media: { payload: mulawToBase64(frame) } });
}

class FakeProviderSocket implements WebSocketLike {
  readyState = 1;
  sent: unknown[] = [];
  closed = false;
  private listeners = new Map<string, ((...args: any[]) => void)[]>();

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.emit('close');
  }

  on(event: string, listener: (...args: any[]) => void): unknown {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

class FakeTwilioSocket {
  readyState = 1;
  received: Record<string, any>[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  private listeners = new Map<string, ((...args: any[]) => void)[]>();

  send(data: string): void {
    this.received.push(JSON.parse(data));
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
    this.emit('close');
  }

  on(event: string, listener: (...args: any[]) => void): unknown {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  eventsOfType(type: string): Record<string, any>[] {
    return this.received.filter((event) => event.event === type);
  }
}

class FakeSttProvider implements SpeechToTextProvider {
  readonly id = 'fake-stt';
  sessions = 0;
  pushedBytes = 0;

  constructor(
    readonly isConfigured: boolean,
    private readonly transcript: string
  ) {}

  openSession(): SttSession {
    this.sessions += 1;
    return {
      pushAudio: (chunk: Buffer) => {
        this.pushedBytes += chunk.length;
      },
      finalize: async () => this.transcript,
      close: async () => undefined,
    };
  }
}

class FakeTtsProvider implements TextToSpeechProvider {
  readonly id = 'fake-tts';
  calls: string[] = [];

  constructor(
    readonly isConfigured: boolean,
    private readonly audio: Buffer
  ) {}

  async synthesize(text: string): Promise<Buffer> {
    this.calls.push(text);
    return this.audio;
  }

  async synthesizeStream(text: string, options: { onChunk: (chunk: Buffer) => void }): Promise<void> {
    this.calls.push(text);
    if (this.audio.length > 0) options.onChunk(this.audio);
  }
}

/**
 * Simula a Cartesia fallando a media respuesta las primeras `failuresLeft`
 * veces que se le pide sintetizar; después de eso sintetiza con normalidad.
 */
class FailingTtsProvider implements TextToSpeechProvider {
  readonly id = 'failing-tts';
  calls: string[] = [];

  constructor(
    readonly isConfigured: boolean,
    private failuresLeft: number
  ) {}

  async synthesize(): Promise<Buffer> {
    throw new Error('Cartesia synth error (prueba)');
  }

  async synthesizeStream(
    text: string,
    options: { onChunk: (chunk: Buffer) => void }
  ): Promise<void> {
    this.calls.push(text);
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('Cartesia stream error (prueba)');
    }
    options.onChunk(Buffer.alloc(320, MULAW_SILENCE_BYTE));
  }
}

class FakeAgent implements VoiceAgent {
  calls: { text: string; context: VoiceAgentContext }[] = [];

  constructor(private readonly response: VoiceAgentResponse = { replyText: 'Con gusto, le ayudo con su cita.' }) {}

  async processMessage(text: string, context: VoiceAgentContext): Promise<VoiceAgentResponse> {
    this.calls.push({ text, context });
    return this.response;
  }
}

class FakeTranscriptStore implements TranscriptStore {
  inbound: TranscriptTurn[] = [];
  outbound: TranscriptTurn[] = [];
  handovers: TranscriptTurn[] = [];

  async recordInbound(turn: TranscriptTurn): Promise<void> {
    this.inbound.push(turn);
  }

  async recordOutbound(turn: TranscriptTurn): Promise<void> {
    this.outbound.push(turn);
  }

  async markHandover(turn: TranscriptTurn): Promise<void> {
    this.handovers.push(turn);
  }
}

/** `sleep` controlable para probar barge-in sin depender del reloj real. */
class GatedSleep {
  private resolvers: (() => void)[] = [];

  readonly sleep = (): Promise<void> =>
    new Promise<void>((resolve) => {
      this.resolvers.push(resolve);
    });

  get pending(): number {
    return this.resolvers.length;
  }

  releaseAll(): void {
    const all = this.resolvers.splice(0);
    for (const resolve of all) resolve();
  }
}

const TEST_CONFIG: Partial<VoicePipelineConfig> = {
  paceAudio: false,
  bargeInEnabled: false,
  silenceMs: 60,
  minSpeechMs: 40,
  markTimeoutMs: 60,
  speechRmsThreshold: 0.02,
};

function buildSessionDeps(
  overrides: Partial<VoiceCallSessionDeps> = {}
): VoiceCallSessionDeps & { events: Record<string, any>[] } {
  const events: Record<string, any>[] = [];
  return {
    streamSid: 'stream-test',
    callSid: 'call-test',
    fromPhone: '+528112345678',
    toPhone: '+528198765432',
    tenant: { id: 'tenant-test', name: 'Clínica Test' },
    agent: new FakeAgent(),
    stt: new FakeSttProvider(true, 'quiero una cita'),
    tts: new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE)),
    send: (payload) => events.push(payload),
    close: () => undefined,
    logger: silentVoiceLogger,
    transcriptStore: new FakeTranscriptStore(),
    config: TEST_CONFIG,
    sleep: async () => undefined,
    events,
    ...overrides,
  };
}

async function runVoiceTests(): Promise<void> {
  section('🎧 Audio G.711 (mu-law 8 kHz)');
  {
    assert(encodeMulawSample(0) === MULAW_SILENCE_BYTE, 'PCM 0 se codifica como 0xFF (silencio)');
    assert(
      Math.abs(decodeMulawSample(MULAW_SILENCE_BYTE)) <= 1,
      'mu-law 0xFF decodifica a ~0 (silencio)'
    );

    const notRoundTripped: number[] = [];
    for (let byte = 0; byte < 256; byte += 1) {
      if (encodeMulawSample(decodeMulawSample(byte)) !== byte) {
        notRoundTripped.push(byte);
      }
    }
    assert(
      notRoundTripped.length === 0 || notRoundTripped.every((byte) => byte === 0x7f),
      'round-trip mu-law → PCM → mu-law sin pérdida (salvo el doble cero ±0 de G.711)'
    );

    const tone = toneFrame();
    assert(mulawRms(silenceFrame) < 0.001, 'la energía del silencio es prácticamente cero');
    assert(mulawRms(tone) > 0.2, 'la energía de una voz audible supera el umbral de detección');

    const frames = chunkMulaw(Buffer.alloc(320, MULAW_SILENCE_BYTE));
    assert(frames.length === 2, 'chunkMulaw divide el audio en tramas de 20 ms');
    assert(frames.every((frame) => frame.length === TWILIO_FRAME_BYTES), 'todas las tramas miden 160 bytes');
    assert(
      chunkMulaw(Buffer.alloc(100, MULAW_SILENCE_BYTE))[0].length === TWILIO_FRAME_BYTES,
      'la última trama incompleta se rellena con silencio'
    );
  }

  section('🎙️ STT (Deepgram) y TTS (Cartesia) con transporte inyectado');
  {
    const socket = new FakeProviderSocket();
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const provider = new DeepgramSpeechToTextProvider({
      apiKey: 'test-deepgram-key',
      webSocketFactory: (url, headers) => {
        capturedUrl = url;
        capturedHeaders = headers;
        return socket;
      },
    });

    const session = provider.openSession({ language: 'es-MX' });
    socket.emit('open');
    session.pushAudio(silenceFrame);

    assert(
      capturedUrl.includes('encoding=mulaw') &&
        capturedUrl.includes('sample_rate=8000') &&
        capturedUrl.includes('channels=1'),
      'Deepgram se abre en mu-law 8 kHz mono (sin transcodificar)'
    );
    assert(capturedUrl.includes('language=es-MX'), 'el idioma solicitado se propaga a Deepgram');
    assert(
      capturedHeaders.Authorization === 'Token test-deepgram-key',
      'la API key viaja en el header Authorization'
    );
    assert(
      socket.sent.some((item) => Buffer.isBuffer(item)),
      'pushAudio envía las tramas de audio como binario'
    );

    socket.emit(
      'message',
      JSON.stringify({
        type: 'Results',
        is_final: true,
        speech_final: true,
        channel: { alternatives: [{ transcript: 'quiero una cita' }] },
      })
    );

    const transcript = await session.finalize();
    assert(transcript === 'quiero una cita', 'finalize devuelve la transcripción final');
    assert(
      socket.sent.some((item) => typeof item === 'string' && item.includes('CloseStream')),
      'finalize cierra el stream de Deepgram de forma explícita'
    );

    const unconfigured = new DeepgramSpeechToTextProvider({ apiKey: '' });
    assert(unconfigured.isConfigured === false, 'sin DEEPGRAM_API_KEY el proveedor se marca no configurado');
    assert(
      (await unconfigured.openSession().finalize()) === '',
      'una sesión sin proveedor devuelve transcripción vacía en lugar de fallar'
    );

    let capturedBody: any = null;
    let capturedFetchHeaders: Record<string, string> = {};
    const cartesia = new CartesiaTextToSpeechProvider({
      apiKey: 'test-cartesia-key',
      voiceId: 'voice-123',
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body ?? '{}'));
        capturedFetchHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response(Buffer.from([1, 2, 3, 4]), { status: 200 });
      }) as typeof fetch,
    });

    const audio = await cartesia.synthesize('  Hola,   soy su asistente. ');
    assert(audio.length === 4, 'Cartesia devuelve los bytes de audio del proveedor');
    assert(
      capturedBody.output_format?.encoding === 'pcm_mulaw' &&
        capturedBody.output_format?.sample_rate === 8000,
      'Cartesia se solicita en mu-law 8 kHz listo para Twilio'
    );
    assert(capturedBody.transcript === 'Hola, soy su asistente.', 'el texto se normaliza antes de sintetizar');
    assert(capturedFetchHeaders['X-API-Key'] === 'test-cartesia-key', 'Cartesia recibe la API key');

    let threw = false;
    const failing = new CartesiaTextToSpeechProvider({
      apiKey: 'k',
      voiceId: 'v',
      fetchImpl: (async () => new Response('unauthorized', { status: 401 })) as typeof fetch,
    });
    try {
      await failing.synthesize('prueba');
    } catch {
      threw = true;
    }
    assert(threw, 'un error HTTP de Cartesia se propaga y no devuelve audio vacío');
    assert(
      new CartesiaTextToSpeechProvider({ apiKey: 'k' }).isConfigured === false,
      'Cartesia requiere API key y voice id para considerarse configurada'
    );
  }

  section('🔁 Segmentación por silencio y ciclo agente → voz');
  {
    const agent = new FakeAgent();
    const stt = new FakeSttProvider(true, 'quiero una cita');
    const tts = new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE));
    const store = new FakeTranscriptStore();
    const deps = buildSessionDeps({ agent, stt, tts, transcriptStore: store });
    const session = new VoiceCallSession(deps);

    for (let i = 0; i < 3; i += 1) session.handleMedia(mulawToBase64(toneFrame()));
    for (let i = 0; i < 4; i += 1) session.handleMedia(mulawToBase64(silenceFrame));

    const agentCalled = await waitFor(() => agent.calls.length === 1);
    assert(agentCalled, 'el silencio sostenido cierra la utterance y despierta al agente');
    assert(agent.calls[0]?.text === 'quiero una cita', 'el agente recibe la transcripción del STT');
    assert(
      agent.calls[0]?.context.channel === 'PHONE_CALL',
      'el contexto del agente usa el canal PHONE_CALL'
    );
    assert(stt.sessions === 1, 'se abre una sesión de STT por utterance');
    assert(stt.pushedBytes > 0, 'el audio se envía al STT durante la utterance');

    const audioSent = await waitFor(() => deps.events.some((event) => event.event === 'media'));
    assert(audioSent, 'la respuesta del agente se convierte en audio hacia Twilio');
    assert(
      deps.events.some((event) => event.event === 'mark'),
      'se emite un mark para saber cuándo terminó la reproducción'
    );
    assert(store.inbound.length === 1 && store.inbound[0].content === 'quiero una cita', 'el turno entrante se persiste');
    assert(
      store.outbound.length === 1 && store.outbound[0].content.includes('cita'),
      'la respuesta del agente se persiste en la conversación telefónica'
    );
    assert(tts.calls.length === 1, 'el TTS sintetiza exactamente una respuesta por turno');
  }

  section('✋ Barge-in (el paciente interrumpe al bot)');
  {
    const gate = new GatedSleep();
    const store = new FakeTranscriptStore();
    const deps = buildSessionDeps({
      transcriptStore: store,
      sleep: gate.sleep,
      tts: new FakeTtsProvider(true, Buffer.alloc(3200, MULAW_SILENCE_BYTE)),
      config: { ...TEST_CONFIG, paceAudio: true, bargeInEnabled: true, bargeInFrames: 3 },
    });
    const session = new VoiceCallSession(deps);

    for (let i = 0; i < 3; i += 1) session.handleMedia(mulawToBase64(toneFrame()));
    for (let i = 0; i < 4; i += 1) session.handleMedia(mulawToBase64(silenceFrame));

    await waitFor(() => deps.events.some((event) => event.event === 'media'));
    const mediaBeforeInterrupt = deps.events.filter((event) => event.event === 'media').length;

    for (let i = 0; i < 3; i += 1) session.handleMedia(mulawToBase64(toneFrame()));

    assert(
      deps.events.some((event) => event.event === 'clear'),
      'la voz del paciente dispara un evento clear a Twilio'
    );
    assert(session.getStats().bargeIns === 1, 'el barge-in se contabiliza en las métricas de la llamada');

    gate.releaseAll();
    await tick(30);
    const mediaAfterInterrupt = deps.events.filter((event) => event.event === 'media').length;
    assert(
      mediaAfterInterrupt - mediaBeforeInterrupt <= 1,
      'la reproducción del bot se detiene tras la interrupción'
    );
  }

  section('📞 Puente con Twilio Media Streams');
  {
    // Token de stream inválido
    process.env.VOICE_STREAM_TOKEN = 'token-de-prueba';
    try {
      const socket = new FakeTwilioSocket();
      VoiceStreamService.handleConnection(socket as unknown as WsSocket, {
        logger: silentVoiceLogger,
        agent: new FakeAgent(),
        stt: new FakeSttProvider(true, 'hola'),
        tts: new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE)),
        resolveTenant: async () => ({ id: 'tenant-test', name: 'Clínica Test' }),
        transcriptStore: new FakeTranscriptStore(),
        config: TEST_CONFIG,
        assertCanTakeCall: async () => undefined,
        recordVoiceUsage: async () => undefined,
      });
      socket.emit(
        'message',
        JSON.stringify({
          event: 'start',
          start: {
            streamSid: 's1',
            callSid: 'c1',
            from: '+528112345678',
            to: '+528198765432',
            customParameters: { tenantId: 'tenant-test', authToken: 'token-incorrecto' },
          },
        })
      );
      await tick(20);
      assert(socket.closedWith?.code === 1008, 'un token de stream inválido cierra el WebSocket (1008)');
    } finally {
      delete process.env.VOICE_STREAM_TOKEN;
    }

    // Número sin clínica
    const orphan = new FakeTwilioSocket();
    VoiceStreamService.handleConnection(orphan as unknown as WsSocket, {
      logger: silentVoiceLogger,
      agent: new FakeAgent(),
      stt: new FakeSttProvider(true, 'hola'),
      tts: new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE)),
      resolveTenant: async () => null,
      transcriptStore: new FakeTranscriptStore(),
      config: TEST_CONFIG,
      assertCanTakeCall: async () => undefined,
      recordVoiceUsage: async () => undefined,
    });
    orphan.emit(
      'message',
      JSON.stringify({ event: 'start', start: { streamSid: 's2', callSid: 'c2', from: '+528112345678', to: '+520000000000' } })
    );
    await tick(20);
    assert(orphan.closedWith?.code === 1008, 'una llamada sin clínica asociada se rechaza');

    // Sin llaves de STT/TTS el stream se cierra en lugar de dejar la línea muda
    const disabled = new FakeTwilioSocket();
    VoiceStreamService.handleConnection(disabled as unknown as WsSocket, {
      logger: silentVoiceLogger,
      agent: new FakeAgent(),
      stt: new FakeSttProvider(false, ''),
      tts: new FakeTtsProvider(false, Buffer.alloc(0)),
      resolveTenant: async () => ({ id: 'tenant-test', name: 'Clínica Test' }),
      transcriptStore: new FakeTranscriptStore(),
      config: TEST_CONFIG,
      assertCanTakeCall: async () => undefined,
      recordVoiceUsage: async () => undefined,
    });
    disabled.emit(
      'message',
      JSON.stringify({ event: 'start', start: { streamSid: 's3', callSid: 'c3', from: '+528112345678', to: '+528198765432' } })
    );
    await tick(20);
    assert(
      disabled.closedWith?.code === 1000 && disabled.closedWith?.reason === 'voice_pipeline_disabled',
      'sin proveedores configurados el stream se cierra de forma explícita'
    );

    // Flujo completo: start → media → stop con seguimiento post-llamada
    const socket = new FakeTwilioSocket();
    const store = new FakeTranscriptStore();
    const followUps: string[] = [];
    VoiceStreamService.handleConnection(socket as unknown as WsSocket, {
      logger: silentVoiceLogger,
      agent: new FakeAgent(),
      stt: new FakeSttProvider(true, 'necesito una limpieza'),
      tts: new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE)),
      resolveTenant: async () => ({ id: 'tenant-test', name: 'Clínica Test' }),
      transcriptStore: store,
      notifyFollowUp: () => {
        followUps.push('seguimiento');
      },
      config: TEST_CONFIG,
      sleep: async () => undefined,
      assertCanTakeCall: async () => undefined,
      recordVoiceUsage: async () => undefined,
    });

    socket.emit('message', JSON.stringify({ event: 'connected' }));
    socket.emit(
      'message',
      JSON.stringify({
        event: 'start',
        start: {
          streamSid: 's4',
          callSid: 'c4',
          from: '+528112345678',
          to: '+528198765432',
          customParameters: { tenantId: 'tenant-test' },
        },
      })
    );
    await tick(20);
    assert(socket.closedWith === null, 'la sesión permanece abierta cuando todo está configurado');

    for (let i = 0; i < 3; i += 1) socket.emit('message', mediaEvent(toneFrame()));
    for (let i = 0; i < 4; i += 1) socket.emit('message', mediaEvent(silenceFrame));

    const persisted = await waitFor(() => store.inbound.length === 1);
    assert(persisted && store.inbound[0].content === 'necesito una limpieza', 'el turno de voz queda en la conversación');
    assert(socket.eventsOfType('media').length > 0, 'Twilio recibe el audio de respuesta del bot');

    socket.emit('message', JSON.stringify({ event: 'stop' }));
    const followedUp = await waitFor(() => followUps.length === 1);
    assert(followedUp, 'al colgar se dispara el seguimiento post-llamada');

    // Un evento ilegible no debe tumbar la llamada
    const malformed = new FakeTwilioSocket();
    VoiceStreamService.handleConnection(malformed as unknown as WsSocket, {
      logger: silentVoiceLogger,
      agent: new FakeAgent(),
      stt: new FakeSttProvider(true, 'hola'),
      tts: new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE)),
      resolveTenant: async () => ({ id: 'tenant-test', name: 'Clínica Test' }),
      transcriptStore: new FakeTranscriptStore(),
      config: TEST_CONFIG,
      assertCanTakeCall: async () => undefined,
      recordVoiceUsage: async () => undefined,
    });
    malformed.emit('message', 'esto-no-es-json');
    await tick(10);
    assert(malformed.closedWith === null, 'un evento ilegible se ignora sin cerrar la llamada');
  }

  section('⚙️ Configuración y degradación');
  {
    const config = resolveVoicePipelineConfig({
      VOICE_SILENCE_MS: '900',
      VOICE_BARGE_IN: 'false',
      VOICE_PIPELINE_ENABLED: 'off',
      VOICE_MAX_TURNS: '5',
    } as NodeJS.ProcessEnv);
    assert(config.silenceMs === 900, 'VOICE_SILENCE_MS se respeta');
    assert(config.bargeInEnabled === false, 'VOICE_BARGE_IN=false desactiva la interrupción');
    assert(config.mode === 'off', 'VOICE_PIPELINE_ENABLED=off desactiva el pipeline');
    assert(config.maxTurns === 5, 'VOICE_MAX_TURNS se respeta');

    const auto = resolveVoicePipelineConfig({} as NodeJS.ProcessEnv);
    assert(auto.mode === 'auto', 'sin variable el modo por defecto es auto');
    assert(
      isVoicePipelineEnabled({
        stt: new FakeSttProvider(false, ''),
        tts: new FakeTtsProvider(false, Buffer.alloc(0)),
        config: auto,
      }) === false,
      'en modo auto, sin proveedores configurados el pipeline queda deshabilitado'
    );
    assert(
      isVoicePipelineEnabled({
        stt: new FakeSttProvider(true, ''),
        tts: new FakeTtsProvider(true, Buffer.alloc(0)),
        config: auto,
      }) === true,
      'en modo auto, con STT y TTS configurados el pipeline se habilita'
    );
    assert(
      isVoicePipelineEnabled({
        stt: new FakeSttProvider(true, ''),
        tts: new FakeTtsProvider(true, Buffer.alloc(0)),
        config: { ...auto, mode: 'on' },
      }) === true,
      'con VOICE_PIPELINE_ENABLED=on y proveedores listos el pipeline se habilita'
    );
  }

  section('☎️ Transferencia a recepción humana');
  {
    let handoverCalled = false;
    const handoverDeps = buildSessionDeps({
      agent: new FakeAgent({ replyText: 'Le transfiero con recepción.', requiresHumanHandover: true }),
      onHumanHandover: async () => {
        handoverCalled = true;
        return true;
      },
    });
    const handoverSession = new VoiceCallSession(handoverDeps);

    for (let i = 0; i < 3; i += 1) handoverSession.handleMedia(mulawToBase64(toneFrame()));
    for (let i = 0; i < 4; i += 1) handoverSession.handleMedia(mulawToBase64(silenceFrame));

    const transferred = await waitFor(() => handoverCalled);
    assert(transferred, 'cuando el agente pide handover se invoca la transferencia a recepción');
    assert(
      handoverSession.getStats().handoverRequested,
      'la estadística de handover queda marcada en la llamada'
    );

    const twiml = buildHumanHandoverTwiml({
      humanNumber: '+525555000000',
      callerId: '+525555123456',
      timeoutSeconds: 20,
    });
    assert(
      twiml ===
        '<Response><Dial timeout="20" callerId="+525555123456">+525555000000</Dial></Response>',
      'el TwiML de transferencia usa Dial con timeout y callerId'
    );

    let fetchCalledWithoutConfig = false;
    const missingConfig = await redirectCallToHuman(
      { callSid: 'CA1' },
      {
        env: {} as NodeJS.ProcessEnv,
        fetchImpl: (async () => {
          fetchCalledWithoutConfig = true;
          return new Response('{}', { status: 200 });
        }) as typeof fetch,
      }
    );
    assert(
      missingConfig === false && fetchCalledWithoutConfig === false,
      'sin credenciales de Twilio no se llama a la API ni se transfiere'
    );

    let captured: { url: string; init: any } | null = null;
    const redirected = await redirectCallToHuman(
      { callSid: 'CA123', callerId: '+525555123456' },
      {
        env: {
          TWILIO_ACCOUNT_SID: 'AC123',
          TWILIO_AUTH_TOKEN: 'secret',
          TWILIO_HUMAN_NUMBER: '+525555000000',
          TWILIO_HUMAN_DIAL_TIMEOUT: '15',
        } as NodeJS.ProcessEnv,
        fetchImpl: (async (url: unknown, init: unknown) => {
          captured = { url: String(url), init };
          return new Response('{}', { status: 200 });
        }) as typeof fetch,
      }
    );
    assert(redirected === true, 'con credenciales y 200 de Twilio la transferencia es exitosa');
    assert(
      captured?.url ===
        'https://api.twilio.com/2010-04-01/Accounts/AC123/Calls/CA123.json',
      'la transferencia llama al endpoint correcto de Twilio'
    );
    assert(
      String(captured?.init?.body).includes('Twiml=') &&
        String(captured?.init?.headers?.Authorization).startsWith('Basic '),
      'la transferencia envía TwiML y autenticación Basic'
    );

    const failedTransfer = await redirectCallToHuman(
      { callSid: 'CA9' },
      {
        env: {
          TWILIO_ACCOUNT_SID: 'AC',
          TWILIO_AUTH_TOKEN: 't',
          TWILIO_HUMAN_NUMBER: '+525555000000',
        } as NodeJS.ProcessEnv,
        fetchImpl: (async () => new Response('err', { status: 500 })) as typeof fetch,
      }
    );
    assert(failedTransfer === false, 'un error de Twilio devuelve false sin romper la llamada');

    let fetchCalledWithoutSignalwireConfig = false;
    const missingSignalwireConfig = await redirectCallToHuman(
      { callSid: 'CA1' },
      {
        env: {
          SIGNALWIRE_PROJECT_ID: 'PROJ1',
          SIGNALWIRE_API_TOKEN: 'tok',
          // Falta SIGNALWIRE_SPACE_URL y no hay credenciales de Twilio: no debe
          // llamar a ninguna API.
          TWILIO_HUMAN_NUMBER: '+525555000000',
        } as NodeJS.ProcessEnv,
        fetchImpl: (async () => {
          fetchCalledWithoutSignalwireConfig = true;
          return new Response('{}', { status: 200 });
        }) as typeof fetch,
      }
    );
    assert(
      missingSignalwireConfig === false && fetchCalledWithoutSignalwireConfig === false,
      'sin credenciales completas de SignalWire no se llama a su API'
    );

    let capturedSignalwire: { url: string; init: any } | null = null;
    const redirectedSignalwire = await redirectCallToHuman(
      { callSid: 'CA456', callerId: '+525555123456' },
      {
        env: {
          SIGNALWIRE_PROJECT_ID: 'PROJ1',
          SIGNALWIRE_API_TOKEN: 'secret-token',
          SIGNALWIRE_SPACE_URL: 'https://jesusblls.signalwire.com/',
          TWILIO_HUMAN_NUMBER: '+525555000000',
          TWILIO_HUMAN_DIAL_TIMEOUT: '15',
        } as NodeJS.ProcessEnv,
        fetchImpl: (async (url: unknown, init: unknown) => {
          capturedSignalwire = { url: String(url), init };
          return new Response('{}', { status: 200 });
        }) as typeof fetch,
      }
    );
    assert(
      redirectedSignalwire === true,
      'con credenciales completas de SignalWire y 200 la transferencia es exitosa'
    );
    assert(
      capturedSignalwire?.url ===
        'https://jesusblls.signalwire.com/api/laml/2010-04-01/Accounts/PROJ1/Calls/CA456.json',
      'la transferencia llama al endpoint correcto de SignalWire (espacio y Project ID normalizados)'
    );
    assert(
      String(capturedSignalwire?.init?.body).includes('Twiml=') &&
        String(capturedSignalwire?.init?.headers?.Authorization).startsWith('Basic '),
      'la transferencia a SignalWire envía TwiML y autenticación Basic'
    );

    const failedSignalwireTransfer = await redirectCallToHuman(
      { callSid: 'CA9' },
      {
        env: {
          SIGNALWIRE_PROJECT_ID: 'PROJ1',
          SIGNALWIRE_API_TOKEN: 'secret-token',
          SIGNALWIRE_SPACE_URL: 'jesusblls.signalwire.com',
          TWILIO_HUMAN_NUMBER: '+525555000000',
        } as NodeJS.ProcessEnv,
        fetchImpl: (async () => new Response('err', { status: 500 })) as typeof fetch,
      }
    );
    assert(
      failedSignalwireTransfer === false,
      'un error HTTP de SignalWire devuelve false sin romper la llamada'
    );
  }

  section('🛠️ Falla de TTS a media respuesta (silencio total → recuperación)');
  {
    // Cartesia falla en el primer intento (la respuesta normal del agente);
    // el pipeline debe intentar una disculpa breve en vez de dejar la
    // llamada en silencio total.
    const tts = new FailingTtsProvider(true, 1);
    const store = new FakeTranscriptStore();
    const deps = buildSessionDeps({ tts, transcriptStore: store });
    const session = new VoiceCallSession(deps);

    for (let i = 0; i < 3; i += 1) session.handleMedia(mulawToBase64(toneFrame()));
    for (let i = 0; i < 4; i += 1) session.handleMedia(mulawToBase64(silenceFrame));

    const recovered = await waitFor(() => tts.calls.length === 2);
    assert(recovered, 'tras un error de Cartesia se intenta una disculpa breve de recuperación');
    assert(
      tts.calls[1] === VOICE_TTS_ERROR_REPLY,
      'la disculpa de recuperación usa el mensaje VOICE_TTS_ERROR_REPLY'
    );
    assert(session.getStats().stopped === false, 'la llamada sigue abierta tras recuperarse del error');

    // Si la recuperación TAMBIÉN falla, no debe reintentar indefinidamente:
    // se cuelga de forma segura tras el segundo intento.
    let closedReason: string | undefined;
    const tts2 = new FailingTtsProvider(true, 2);
    const deps2 = buildSessionDeps({
      tts: tts2,
      close: (_code, reason) => {
        closedReason = reason;
      },
    });
    const session2 = new VoiceCallSession(deps2);

    for (let i = 0; i < 3; i += 1) session2.handleMedia(mulawToBase64(toneFrame()));
    for (let i = 0; i < 4; i += 1) session2.handleMedia(mulawToBase64(silenceFrame));

    const gaveUp = await waitFor(() => session2.getStats().stopped === true);
    assert(gaveUp, 'si la recuperación también falla, la llamada se cuelga en vez de quedar muda');
    assert(
      tts2.calls.length === 2,
      'no hay un tercer intento de síntesis tras la recuperación fallida (sin loop infinito)'
    );
    assert(closedReason === 'tts_error', 'el cierre por doble falla de TTS se marca con el motivo tts_error');
  }

  section('🤐 Silencio total del paciente (reinsistencia y colgado)');
  {
    const tts = new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE));
    const deps = buildSessionDeps({
      tts,
      config: { ...TEST_CONFIG, silenceRepromptMs: 100, maxReprompts: 1 },
    });
    const session = new VoiceCallSession(deps);

    // El paciente nunca dice nada: silencio sostenido desde el inicio.
    for (let i = 0; i < 8; i += 1) session.handleMedia(mulawToBase64(silenceFrame));

    const reprompted = await waitFor(() => tts.calls.includes(VOICE_SILENCE_REPROMPT_REPLY));
    assert(
      reprompted,
      'tras el silencio configurado (VOICE_SILENCE_REPROMPT_MS) se reinsiste preguntando si sigue en la línea'
    );

    await waitFor(() => !session.isSpeaking);

    // Sigue sin responder tras la reinsistencia: se agota maxReprompts y cuelga
    // en vez de dejar la llamada abierta hasta maxCallMs.
    for (let i = 0; i < 8; i += 1) session.handleMedia(mulawToBase64(silenceFrame));

    const hungUp = await waitFor(() => session.getStats().stopped === true);
    assert(
      hungUp,
      'si el paciente sigue sin responder tras agotar las reinsistencias, se despide y cuelga'
    );
    assert(
      tts.calls.filter((text) => text === VOICE_SILENCE_REPROMPT_REPLY).length === 1,
      'con VOICE_MAX_REPROMPTS=1 solo se reinsiste una vez antes de colgar'
    );

    // El bot hablando o un turno en curso no deben disparar la reinsistencia.
    const busyDeps = buildSessionDeps({
      tts: new FakeTtsProvider(true, Buffer.alloc(320, MULAW_SILENCE_BYTE)),
      config: { ...TEST_CONFIG, silenceRepromptMs: 40, maxReprompts: 3 },
    });
    const busySession = new VoiceCallSession(busyDeps);
    for (let i = 0; i < 3; i += 1) busySession.handleMedia(mulawToBase64(toneFrame()));
    // Silencio dentro de la ventana normal de cierre de utterance: no debe
    // contarse como "silencio total del paciente".
    for (let i = 0; i < 2; i += 1) busySession.handleMedia(mulawToBase64(silenceFrame));
    assert(
      !(busyDeps.tts as FakeTtsProvider).calls.includes(VOICE_SILENCE_REPROMPT_REPLY),
      'la reinsistencia no dispara mientras hay una utterance en curso'
    );
  }

  section('📟 Tono DTMF 0: transferencia inmediata a recepción humana');
  {
    let handoverCalled = false;
    const store = new FakeTranscriptStore();
    const deps = buildSessionDeps({
      transcriptStore: store,
      onHumanHandover: async () => {
        handoverCalled = true;
        return true;
      },
    });
    const session = new VoiceCallSession(deps);

    session.handleDtmf('0');

    const transferred = await waitFor(() => handoverCalled);
    assert(
      transferred,
      "presionar '0' activa el mismo flujo de transferencia a recepción que requiresHumanHandover"
    );
    assert(session.getStats().handoverRequested, 'el handover por DTMF queda marcado en las estadísticas');
    assert(store.handovers.length === 1, 'el handover por DTMF se registra en la conversación');

    // Otras teclas no hacen nada.
    let otherKeyHandoverCalled = false;
    const otherKeyDeps = buildSessionDeps({
      onHumanHandover: async () => {
        otherKeyHandoverCalled = true;
        return true;
      },
    });
    const otherKeySession = new VoiceCallSession(otherKeyDeps);
    otherKeySession.handleDtmf('5');
    await tick(20);
    assert(!otherKeyHandoverCalled, "una tecla distinta de '0' no dispara ninguna acción");

    // Presionar '0' dos veces no duplica la transferencia (idempotente).
    let handoverCount = 0;
    const doublePressDeps = buildSessionDeps({
      onHumanHandover: async () => {
        handoverCount += 1;
        return true;
      },
    });
    const doublePressSession = new VoiceCallSession(doublePressDeps);
    doublePressSession.handleDtmf('0');
    doublePressSession.handleDtmf('0');
    await waitFor(() => handoverCount >= 1);
    await tick(30);
    assert(handoverCount === 1, "presionar '0' dos veces no duplica la transferencia a recepción");
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO VOZ: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runVoiceTests().catch((error) => {
  console.error('Error en la suite de voz:', error);
  process.exit(1);
});
