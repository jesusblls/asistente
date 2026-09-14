# Pipeline de voz en tiempo real

Implementación del ciclo conversacional telefónico sobre **Twilio Media Streams**:

```
llamada entrante
  └─ POST /voice/incoming            (webhooks.ts → TwiML con <Say> + <Connect><Stream>)
       └─ ws /voice/stream           (routes/voice.ts)
            └─ VoiceStreamService    (servicios/voiceStreamService.ts)
                 └─ VoiceCallSession (servicios/voice/pipeline.ts)
                      ├─ detección de voz (RMS) y segmentación por silencio
                      ├─ STT Deepgram Nova-2  → transcripción
                      ├─ OmnichannelAgent     → triaje + agenda + FAQ
                      ├─ TTS Cartesia Sonic   → audio mu-law 8 kHz
                      └─ TranscriptStore      → conversación PHONE_CALL en la bandeja
```

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `src/services/voice/audio.ts` | Códec G.711 (mu-law) y utilidades de tramas de 20 ms |
| `src/services/voice/stt.ts` | STT Deepgram sobre WebSocket, con factoría de socket inyectable |
| `src/services/voice/tts.ts` | TTS Cartesia (`/tts/bytes`) en mu-law 8 kHz |
| `src/services/voice/pipeline.ts` | Segmentación por silencio, turnos, barge-in, métricas |
| `src/services/voice/transcriptStore.ts` | Persistencia de la llamada como conversación `PHONE_CALL` |
| `src/services/voiceStreamService.ts` | Puente Twilio ↔ pipeline, resolución de clínica y cierre |
| `src/routes/voice.ts` | Endpoint WebSocket (con logger estructurado) |
| `src/voice-test-suite.ts` | 59 pruebas de audio, proveedores, pipeline, handover y puente (sin red) |
| `src/services/voice/handover.ts` | Redirección de la llamada viva a recepción vía API de Twilio |

Cada llamada queda en la base de datos como `Conversation` de canal `PHONE_CALL`
(`externalChannelId = CallSid`) con sus mensajes `INBOUND`/`OUTBOUND`, igual que
WhatsApp. Si el agente pide handover, la conversación se marca
`isHandedOverToHuman = true`, aparece en la bandeja y —si `TWILIO_HUMAN_NUMBER`
está configurado— la llamada viva se redirige con `<Dial>` al número humano
(`TWILIO_HUMAN_DIAL_TIMEOUT`, default 30 s). Sin esa configuración se cierra
con el aviso habitual.

## Variables de entorno

| Variable | Default | Uso |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | — | Si falta, el STT no está configurado |
| `DEEPGRAM_MODEL` | `nova-2` | Modelo de reconocimiento |
| `DEEPGRAM_LANGUAGE` | `es` | Idioma del reconocimiento |
| `DEEPGRAM_ENDPOINTING_MS` | `300` | Endpointing del proveedor |
| `CARTESIA_API_KEY` | — | Si falta, el TTS no está configurado |
| `CARTESIA_VOICE_ID` | — | Voz mexicana configurada en Cartesia |
| `CARTESIA_MODEL` | `sonic-2` | Modelo de síntesis |
| `VOICE_PIPELINE_ENABLED` | `auto` | `auto` \| `on` \| `off` |
| `VOICE_BARGE_IN` | `true` | Permite que el paciente interrumpa al bot |
| `VOICE_SILENCE_MS` | `700` | Silencio que cierra la utterance |
| `VOICE_MIN_SPEECH_MS` | `250` | Voz mínima para considerar la utterance válida |
| `VOICE_MAX_TURNS` | `30` | Turnos antes de cerrar la llamada |
| `VOICE_STREAM_TOKEN` | — | Token que el TwiML pasa como `authToken` y el WS valida |

## Degradación segura

- Sin `DEEPGRAM_API_KEY` y/o `CARTESIA_API_KEY`, en modo `auto` el WebSocket se
  cierra con `voice_pipeline_disabled` después del saludo del TwiML. Es
  preferible a dejar al paciente en una línea muda.
- Si la clínica no se puede resolver por `tenantId` ni por número marcado, la
  llamada se rechaza con `1008` (nunca se cae al "primer tenant activo").
- Un fallo de TTS no tumba la llamada: se registra y se sigue escuchando.
- Un fallo de persistencia no tumba la llamada: se registra como `warn`.

## Pendientes conocidos

1. **Latencia de extremo a extremo**: hoy la segmentación espera
   `VOICE_SILENCE_MS` de silencio antes de transcribir. Para conversación más
   fluida conviene usar el `speech_final` de Deepgram con streaming continuo
   (una sola sesión por llamada) en lugar de una sesión por utterance.
2. **Verificación con proveedores reales**: la suite cubre todo con transporte
   simulado; falta una prueba manual con llaves reales de Deepgram/Cartesia y
   un número de Twilio.
3. **Transferencia atendida**: si el humano no contesta dentro del `timeout`,
   Twilio corta el `<Dial>`; falta definir si se deja voicemail o se devuelve al bot.
