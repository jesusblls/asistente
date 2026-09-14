# AsistentePro Clínicas 🇲🇽
> **Plataforma SaaS Multi-Tenant de Asistente IA Omnicanal para Clínicas y Consultorios Médicos / Dentales en México (+52)**

AsistentePro Clínicas es una solución integral que automatiza la recepción de pacientes 24/7 mediante **llamadas telefónicas con voz natural en tiempo real** (Twilio Voice sub-600ms) y **mensajería oficial** (WhatsApp Cloud API con botones interactivos, Instagram Direct, Facebook Messenger y Webchat). Incorpora triaje clínico inteligente, agendamiento anti-colisión y un **Escudo Anti-Inasistencias (*No-Show Shield*)** mediante cobro de anticipos con Mercado Pago México.

---

## 📑 Documentación Canónica

Para conocer todos los detalles técnicos, de negocio e ingeniería:
- **🤖 [AGENTS.md](AGENTS.md):** **Especificación canónica exhaustiva para agentes de Inteligencia Artificial** (arquitectura del monorepo, modelos Prisma, las 8 herramientas de Gemini 2.5 Flash, las 13 intenciones locales, reglas multi-tenant, endpoints y flujos).
- **📘 [CLAUDE.md](CLAUDE.md):** Manual técnico y de negocio para desarrollo con Claude y asistentes de código.
- **🎨 [PRODUCT.md](apps/web/PRODUCT.md):** Manifiesto de producto y principios Impeccable de diseño clínico.
- **📓 [BITACORA.md](BITACORA.md):** Registro cronológico de todos los cambios del repositorio, con el porqué de cada decisión.

### ⚠️ Antes de tu primer commit

Todo cambio en este repositorio exige una entrada en [`BITACORA.md`](BITACORA.md)
y un commit con formato [Conventional Commits](https://www.conventionalcommits.org/es/).
Activa el hook que lo verifica (una sola vez por clon):

```bash
git config core.hooksPath .githooks
```

El procedimiento completo está en [CLAUDE.md § 7](CLAUDE.md) y aplica por igual
a personas y a agentes de IA.

---

## 🏗️ Arquitectura del Monorepo

El proyecto está organizado con **npm workspaces**:

```
asistente/
├── AGENTS.md                  # Especificación canónica integral para agentes de IA
├── CLAUDE.md                  # Fuente de verdad técnica y de negocio
├── README.md                  # Este documento
├── packages/database/prisma/dev.db # Base de datos SQLite local para desarrollo
├── package.json               # Configuración raíz de npm workspaces
├── tsconfig.base.json         # Configuración estricta de TypeScript
│
├── packages/
│   ├── shared-types/          # Tipos e interfaces comunes compartidos (Tenant, Doctor, Appointment, etc.)
│   ├── database/              # Persistencia con Prisma ORM (schema.prisma, SQLite y seed)
│   └── ai-agent/              # Motor de IA (Gemini 2.5 Flash, Scheduler, Triage y Mercado Pago)
│
└── apps/
    ├── api/                   # Servidor Backend Fastify (Puerto 3000, REST, WebSockets, Webhooks)
    └── web/                   # Frontend Next.js 15 App Router (Puerto 3001, React 19, Tailwind)
```

---

## 🚀 Inicio Rápido

### Requisitos Previos
- **Node.js** v20 o v22+
- **npm** v10+

### 1. Clonar e Instalar Dependencias
```bash
# Instalar dependencias en todos los paquetes y apps
npm install
```

### 2. Configurar Variables de Entorno
Copia el archivo de ejemplo a `.env`:
```bash
cp .env.example .env
```
> **Nota:** Para desarrollo local, no es indispensable contar de inmediato con API keys de Gemini o Twilio; el sistema incluye un **motor heurístico inteligente de 13 intenciones** y simulador de WhatsApp/Voz que funciona 100% offline.

### 3. Inicializar y Poblar la Base de Datos
```bash
# Generar el cliente de Prisma
npm run db:generate

# Crear las tablas en SQLite (dev.db)
npm run db:push

# Poblar con la clínica modelo de Polanco (CDMX), doctores y citas
npm run db:seed

# Crear el administrador del panel (contraseña obligatoria, mínimo 8 caracteres)
SEED_ADMIN_EMAIL=admin@sonrisaspolanco.mx \
SEED_ADMIN_PASSWORD='CambiaEstaContrasena2026!' \
TENANT_SLUG=dental-polanco \
npm run admin:create
```

> **Seguridad:** la API requiere sesión en todas las rutas `/api/*`. Configura en `.env` un `JWT_SECRET` de al menos 32 caracteres, el `META_APP_SECRET` y los secretos de Twilio/Mercado Pago para que los webhooks acepten eventos. Sin ellos, los webhooks se rechazan (fail closed). El acceso al panel es en `http://localhost:3001/login`.

### 4. Iniciar los Servidores de Desarrollo

En dos terminales separadas:

```bash
# Terminal 1: Backend Fastify API (http://localhost:3000)
npm run dev --workspace=@asistente/api

# Terminal 2: Frontend Next.js 15 (http://localhost:3001)
npm run dev --workspace=@asistente/web
```

Abre tu navegador en **`http://localhost:3001`**:
- **Página de Inicio (`/`):** Landing page comercial con simulador interactivo de llamadas telefónicas y chat de WhatsApp en vivo.
- **Panel de Control (`/dashboard`):** Bandeja omnicanal, calendario interactivo, catálogo de especialistas y herramientas de sandbox (`+ Citas Demo`, `Limpiar Citas`).

---

## 🧪 Pruebas Automatizadas (QA)

El repositorio cuenta con seis suites de pruebas automatizadas (descubiertas por `apps/api/src/run-suites.ts`), más la batería del motor de IA:

```bash
# 1. Motor de IA: E.164, triaje, agenda, selección de servicio
npm test --workspace=@asistente/ai-agent

# 2. Suites de la API: integración, seguridad, pagos, cola, voz y observabilidad
npm test

# 3. Suite de estrés E2E (Multi-tenant, anti-colisión, Mercado Pago y Takeover)
npm run test:stress

# 4. Migraciones versionadas de base de datos
npm run db:migrate:status

# 5. E2E del panel real (Next + API + login + dashboard) con Playwright
npm run test:e2e
```

> El CI de GitHub Actions (`.github/workflows/ci.yml`) crea la BD, aplica migraciones, compila, corre ESLint, ejecuta todas las suites y las pruebas E2E de Playwright en cada push/PR.

### Mercado Pago y WhatsApp

- Con `MERCADOPAGO_ACCESS_TOKEN` configurado, el anticipo se crea contra la API real (`/checkout/preferences`) y el webhook reconsulta el pago (`/v1/payments/:id`) antes de acreditarlo, validando cita y monto. Sin token se usa un link simulado solo para desarrollo.
- Los envíos por WhatsApp reintentan `WHATSAPP_SEND_ATTEMPTS` veces con backoff y cada mensaje guarda `deliveryStatus` (`PENDING`/`SENT`/`FAILED`).

### Voz en tiempo real

Con `DEEPGRAM_API_KEY` (STT Nova-2) y `CARTESIA_API_KEY` + `CARTESIA_VOICE_ID` (TTS mu-law 8 kHz) el pipeline de Twilio Media Streams queda activo: audio del paciente → transcripción → agente → voz de vuelta, con `barge-in` y cierre limpio. Si el agente pide handover y `TWILIO_HUMAN_NUMBER` está configurado, la llamada viva se redirige con `<Dial>` a recepción. Sin llaves, la llamada se cierra con `voice_pipeline_disabled` en lugar de quedar muda. El detalle está en `apps/api/VOICE.md`.

### Cola durable y outbox

Los webhooks de Meta persisten el entrante y encolan su procesamiento en la tabla `Job`, respondiendo 200 de inmediato. El worker (habilitado con `QUEUE_WORKER_ENABLED`) aplica reintentos con backoff, idempotencia por `dedupeKey` y recuperación de trabajos abandonados; también procesa el outbox de WhatsApp y el seguimiento post-llamada. Ver `apps/api/QUEUE.md`.

### Observabilidad

Logging estructurado NDJSON (`packages/observability`), `GET /health` con estado de la cola y métricas, `GET /metrics` (JSON) y `GET /metrics/prometheus` (texto Prometheus 0.0.4), ambos protegidos con `METRICS_TOKEN` (en producción responden 404 si el token no está configurado).

### Migraciones

`packages/database/prisma/migrations/0001_baseline` es el baseline versionado. En una BD nueva: `npm run db:migrate`. En una BD de desarrollo creada con `db push`: `npx prisma migrate resolve --applied 0001_baseline` (ver `packages/database/prisma/migrations/README.md`).

---

## 🌐 Conexión de Webhooks Reales (Meta WhatsApp & Twilio)

Para recibir mensajes reales de WhatsApp Cloud API o llamadas de Twilio en tu máquina de desarrollo:

```bash
# Iniciar túnel seguro con ngrok
ngrok http 3000
```

1. **WhatsApp Cloud API (Meta Developers):**
   - URL de Callback: `https://<tu-subdominio>.ngrok-free.app/webhooks/meta`
   - Token de Verificación: `asistente_mexico_secret_2026`
   - Suscribirse al campo: `messages`
2. **Twilio Voice:**
   - En tu consola de Twilio, configura la URL de la llamada entrante (*A call comes in*):
   - `https://<tu-subdominio>.ngrok-free.app/voice/incoming` (HTTP POST)

---

## 🛡️ Reglas Fundamentales del Proyecto
1. **🇲🇽 México First:** Fechas en `America/Mexico_City`, moneda en `MXN`, teléfonos en `+52XXXXXXXXXX`.
2. **🔒 Aislamiento Multi-Tenant:** Todas las consultas a la base de datos deben incluir el filtro `tenantId`.
3. **📅 Anti-Colisión:** Ninguna cita puede solaparse con otra en la agenda del mismo especialista.
4. **👤 Copiloto Humano:** La IA se silencia por completo al activar el modo de toma de control (*takeover*).

---

Desarrollado para la transformación digital del sector salud en México.
