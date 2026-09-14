# Cola durable de webhooks y outbox

Resuelve el hallazgo **I3/I11** de la auditoría: los webhooks se procesaban
completos dentro del request HTTP. Meta reintenta un webhook cuando el handler
tarda o falla, así que el agente podía responder dos veces y agendar la misma
cita dos veces; además un fallo de WhatsApp perdía el mensaje.

```
POST /webhooks/meta
  ├─ valida X-Hub-Signature-256
  ├─ resuelve clínica (nunca "el primer tenant activo")
  ├─ upsert paciente + conversación
  ├─ persiste el mensaje entrante           ← visible ya en la bandeja
  ├─ descarta wamid repetido (idempotencia)
  └─ encola META_INBOUND_MESSAGE y responde 200 en ~20 ms

worker (in-process por defecto)
  ├─ reclama el trabajo con compare-and-swap
  ├─ ejecuta OmnichannelAgent (historial de 8 mensajes)
  ├─ persiste la respuesta como OUTBOUND/PENDING
  └─ encola WHATSAPP_SEND  → outbox con reintentos
```

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `src/services/queue/queue.ts` | Motor: reclamo atómico, reintentos, backoff, recuperación de trabajos abandonados, métricas |
| `src/services/queue/handlers.ts` | Handlers concretos (Meta, WhatsApp, seguimiento de voz) e instancia compartida `jobQueue` |
| `src/queue-test-suite.ts` | 26 pruebas: motor, webhook, idempotencia, outbox y post-llamada |

## Tabla `Job`

| Campo | Uso |
| --- | --- |
| `type` | `META_INBOUND_MESSAGE` \| `WHATSAPP_SEND` \| `VOICE_POST_CALL_FOLLOWUP` |
| `payload` | JSON del trabajo |
| `status` | `PENDING` → `RUNNING` → `DONE` \| `FAILED` (reintento) \| `DEAD` |
| `attempts` / `maxAttempts` | Control de reintentos |
| `runAt` | Cuándo es elegible (base del backoff) |
| `dedupeKey` | Índice único: idempotencia (`meta:<mensajeId>`, `wa:<mensajeId>`) |
| `lockedAt` / `lockedBy` | Reclamo del worker y detección de trabajos abandonados |
| `lastError` | Último motivo de fallo (truncado a 1000 caracteres) |

## Garantías

- **Idempotencia**: el mismo `wamid` de Meta no encola un segundo turno; el
  mismo `CallSid` no encola dos seguimientos; el mismo mensaje saliente no se
  envía dos veces.
- **Reintentos**: fallo de Gemini/Meta → `FAILED` con backoff exponencial
  (base 2 s, jitter 50 %, tope 5 min) hasta `JOBS_MAX_ATTEMPTS`, luego `DEAD`
  con el motivo en `lastError`.
- **Sin trabajos zombis**: al arrancar, lo que quedó `RUNNING` más de 2 minutos
  (deploy/OOM) vuelve a `FAILED` y se reintenta.
- **Sin pérdida silenciosa**: `Message.deliveryStatus` solo pasa a `SENT`
  cuando Meta confirma; si falla queda `PENDING` y el job se reintenta.
- **Errores permanentes**: si la entidad referenciada ya no existe (conversación
  o cita borrada), el job termina en `DEAD` al primer intento en lugar de
  reintentar cinco veces algo imposible.
- **Dead letter**: cuando un envío agota sus reintentos, un gancho marca el
  mensaje como `FAILED`, así la bandeja refleja el fallo real y no un `PENDING`
  eterno.
- **Apagado ordenado**: `SIGTERM`/`SIGINT` cierran primero el servidor y luego
  esperan el lote en curso (`jobQueue.stop()`).

## Operación

- `GET /health` ahora devuelve `queue` (conteo por estado), `queueWorker` y
  métricas en proceso (`queue_jobs_*`). Si `PENDING` crece de forma sostenida,
  el worker no está corriendo; si `DEAD` crece, hay un proveedor externo caído.
- Escalado horizontal: el reclamo es un compare-and-swap sobre `status` +
  `lockedAt`, así que varios workers pueden compartir la tabla sin duplicar
  trabajo. Para separar el worker del servidor HTTP, arranca una instancia con
  `QUEUE_WORKER_ENABLED=true` y el resto con `false`.

## Pendientes conocidos

1. **Transporte**: hoy la cola es la propia base de datos. Con SQLite hay un
   solo escritor, así que funciona bien en un proceso; para volumen alto
   conviene migrar a Redis/BullMQ o SQS manteniendo la misma interfaz
   (`enqueue` / handler), ya que el resto del código no conoce el transporte.
2. **Observabilidad externa**: las métricas son en proceso; falta exportarlas a
   Prometheus/CloudWatch para alertar sobre `DEAD` y profundidad de cola.
3. **Twilio y Mercado Pago**: siguen procesándose en línea porque sus
   respectivos flujos deben responder TwiML/código síncrono; solo el
   seguimiento post-llamada pasa por la cola.
4. **Reintento manual**: no hay endpoint para reencolar un trabajo `DEAD`; hoy
   se hace con una consulta a la tabla `Job`.
