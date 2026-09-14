# @asistente/api

Servidor backend de alto rendimiento impulsado por Fastify v5.2, WebSockets y soporte completo para webhooks oficiales de Meta WhatsApp Cloud API y Twilio Voice.

## 🚀 Arquitectura y Puertos
- **Puerto por defecto:** `3000` (configurable mediante variable `PORT`).
- **Plugins:** `@fastify/cors`, `@fastify/formbody`, `@fastify/websocket`.

## 📡 Rutas y Servicios (`src/routes/`)

### 1. Administración y Multi-Tenant (`src/routes/admin.ts`)
- **Tenants:** `GET /api/tenants`, `GET /api/tenants/:slug`, `POST /api/tenants`, `PATCH /api/tenants/:id`, `POST /api/tenants/:id/seed`, `DELETE /api/tenants/:id/reset`.
- **Doctores y Servicios:** `POST /api/tenants/:id/doctors`, `DELETE /api/doctors/:id`, `POST /api/tenants/:id/services`, `DELETE /api/services/:id`.
- **Disponibilidad y Citas:** `GET /api/availability`, `GET /api/appointments`, `POST /api/appointments`, `PATCH /api/appointments/:id`, `POST /api/appointments/:id/deposit-preference`, `DELETE /api/appointments/:id`.
- **Bandeja Omnicanal y Copiloto:** `GET /api/conversations`, `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/takeover`, `POST /api/conversations/:id/reply`.

### 2. Webhooks Oficiales (`src/routes/webhooks.ts`)
- **Meta (WhatsApp / IG / Messenger):**
  - `GET /webhooks/meta`: Verificación de suscripción con `hub.challenge` y `META_VERIFY_TOKEN`.
  - `POST /webhooks/meta`: Entrada de mensajes, fotos, audios y respuestas a botones interactivos (`confirm_...`, `reschedule_...`).
- **Twilio Voice:**
  - `POST /voice/incoming`: Respuesta TwiML con voz `Polly.Mia-Neural` y conexión de audio al WebSocket.
- **Mercado Pago:**
  - `POST /webhooks/mercadopago`: Acreditación automática de anticipos en MXN (`DEPOSIT_PAID`).

### 3. Telefonía y Voz en Tiempo Real (`src/routes/voice.ts` & `src/services/voiceStreamService.ts`)
- **`GET /voice/stream` (WebSocket):** Maneja la sesión bidireccional de Twilio Media Streams, eventos de conexión, paquetes mu-law 8kHz, barge-in (`clear`) y automatización post-llamada de seguimiento por WhatsApp.

## 🧪 Pruebas de Integración
```bash
npx tsx src/test-api.ts
```
