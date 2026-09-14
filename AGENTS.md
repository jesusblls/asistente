# AGENTS.md — Especificación Canónica de AsistentePro Clínicas
> **Guía Técnica de Referencia y Reglas de Negocio para Agentes de Inteligencia Artificial**

Este documento es la **fuente de verdad canónica e integral** para cualquier agente de IA (Claude, GPT, Gemini, Cursor, Devin, OpenCode, Antigravity, etc.) que trabaje en el repositorio **AsistentePro Clínicas**. Contiene la descripción exhaustiva de la arquitectura del monorepo, modelos de base de datos, flujos de inteligencia artificial, servicios de telefonía y mensajería, API REST/WebSockets, frontend y reglas de ingeniería obligatorias.

> ⚠️ **Regla 0, antes que cualquier otra cosa:** todo cambio exige una entrada en
> [`BITACORA.md`](BITACORA.md) y un commit con formato Conventional Commits,
> verificado por el hook `.githooks/commit-msg`. Ver
> [§ 8 — Reglas de Código Inviolables](#8-reglas-de-código-inviolables-para-agentes-de-ia)
> y [CLAUDE.md § 7](CLAUDE.md). Activa el hook una vez por clon con
> `git config core.hooksPath .githooks`.

---

## 📑 Tabla de Contenidos

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Reglas de Dominio y Contexto Regional (México +52)](#2-reglas-de-dominio-y-contexto-regional-méxico-52)
3. [Arquitectura del Monorepo (Workspaces)](#3-arquitectura-del-monorepo-workspaces)
4. [Modelo de Datos y Esquema Prisma (`schema.prisma`)](#4-modelo-de-datos-y-esquema-prisma-schemaprisma)
5. [Motor de Inteligencia Artificial (`@asistente/ai-agent`)](#5-motor-de-inteligencia-artificial-asistenteai-agent)
   - [5.1 Capas de Decisión del Agente](#51-capas-de-decisión-del-agente)
   - [5.2 Herramientas de Gemini 2.5 Flash (Tool Calling)](#52-herramientas-de-gemini-25-flash-tool-calling)
   - [5.3 Motor de Respaldo Heurístico (13 Intenciones)](#53-motor-de-respaldo-heurístico-13-intenciones)
   - [5.4 Protocolo de Triaje Clínico en 3 Niveles](#54-protocolo-de-triaje-clínico-en-3-niveles)
   - [5.5 Motor de Calendario y Anti-Colisión](#55-motor-de-calendario-y-anti-colisión)
   - [5.6 Escudo Anti-Inasistencias con Mercado Pago](#56-escudo-anti-inasistencias-con-mercado-pago)
6. [Servidor Backend Fastify (`apps/api`)](#6-servidor-backend-fastify-appsapi)
   - [6.1 Catálogo de Endpoints REST](#61-catálogo-de-endpoints-rest)
   - [6.2 Webhooks (Meta WhatsApp & Twilio Voice)](#62-webhooks-meta-whatsapp--twilio-voice)
   - [6.3 WebSocket Twilio Media Streams (Audio Bidireccional)](#63-websocket-twilio-media-streams-audio-bidireccional)
7. [Frontend Web Next.js 15 (`apps/web`)](#7-frontend-web-nextjs-15-appsweb)
   - [7.1 Rutas y Estructura del App Router](#71-rutas-y-estructura-del-app-router)
   - [7.2 Estado Global Dual: Sandbox en Vivo vs. Showcase Demo](#72-estado-global-dual-sandbox-en-vivo-vs-showcase-demo)
   - [7.3 Sistema de Diseño Clínico (Principios Impeccable)](#73-sistema-de-diseño-clínico-principios-impeccable)
8. [Reglas de Código Inviolables para Agentes de IA](#8-reglas-de-código-inviolables-para-agentes-de-ia)
9. [Variables de Entorno y Configuración](#9-variables-de-entorno-y-configuración)
10. [Comandos Operativos y Baterías de Pruebas](#10-comandos-operativos-y-baterías-de-pruebas)

---

## 1. Visión General del Sistema

**AsistentePro Clínicas** es una plataforma SaaS B2B Multi-Tenant diseñada para consultorios médicos, clínicas dentales y centros de salud en México.

### El Problema que Resuelve
- **Sobrecarga en Recepción:** Las clínicas pierden hasta el 35% de pacientes potenciales porque las líneas telefónicas están ocupadas o los mensajes de WhatsApp quedan sin responder fuera de horario laboral.
- **Inasistencias (*No-Shows*):** Hasta un 30% de los pacientes agendados no se presentan, generando huecos no recuperables en las agendas de los doctores.
- **Urgencias no Detectadas:** Pacientes con dolor agudo o hemorragias reciben respuestas genéricas o demoradas en vez de triaje prioritario.

### La Solución de la Plataforma
- **Atención Omnicanal 24/7:** Recepción de llamadas telefónicas en tiempo real (Twilio Voice con voz natural mexicana) y mensajería instantánea oficial (WhatsApp Business Cloud API, Instagram Direct, Facebook Messenger y Webchat).
- **Triaje Clínico Inteligente:** Clasificación inmediata de síntomas en 3 niveles (Emergencia 911 vs Urgencia Dental vs Consulta de Rutina).
- **Agendamiento Anti-Colisiones:** Cálculo dinámico de espacios disponibles por doctor, respetando horarios de comida, descansos y buffers sanitarios.
- **Escudo Anti-Inasistencias (*No-Show Shield*):** Generación automática de links de pago de anticipos con Mercado Pago México (SPEI, tarjeta, OXXO) y confirmación automática por WhatsApp.
- **Modo Copiloto Humano (*Takeover*):** Botón de intervención para pausar la IA y permitir que el personal de recepción asuma el control de cualquier conversación con un clic.

---

## 2. Reglas de Dominio y Contexto Regional (México +52)

Cualquier cambio de código debe adherirse de forma estricta a los estándares de la República Mexicana:

### 2.1 Localización y Zona Horaria
- **Huso Horario Oficial:** `America/Mexico_City` (GMT-6 / Tiempo del Centro).
- **Almacenamiento:** En base de datos (SQLite / PostgreSQL), las fechas siempre se almacenan en formato UTC (ISO 8601).
- **Presentación al Usuario y Pacientes:** Toda fecha y hora calculada o mostrada debe transformarse a `America/Mexico_City` usando librerías de zona horaria (`date-fns-tz`).
- **Formatos de Hora:** Preferir formato de 12 horas con indicador AM/PM para el paciente (ej. `04:00 PM`) y formato largo en español para fechas (ej. `Martes 10 de Septiembre de 2026`).

### 2.2 Moneda y Aspectos Fiscales
- **Moneda:** Pesos Mexicanos (`MXN`, símbolo `$`).
- **Precios:** Todos los precios de consulta, procedimientos y anticipos deben expresarse con sufijo o contexto claro en MXN (ej. `$450 MXN`, `$850 MXN`).
- **Facturación Mexicana (CFDI 4.0):** El sistema contempla en sus FAQ y respuestas soporte para emisión de factura fiscal mexicana con RFC y constancia de situación fiscal.
- **Aseguradoras Nacionales:** Respuestas preparadas para tramitar reembolso con compañías de seguros líderes en México: GNP Seguros, MetLife, AXA Seguros, Seguros Monterrey New York Life y Mapfre.

### 2.3 Normalización Telefónica Canónica E.164 (`packages/ai-agent/src/utils/phone.ts`)
Todo número de teléfono entrante o saliente debe procesarse a través de `normalizeMexicanPhone()` para garantizar consistencia en la base de datos:
1. **Formato Canónico:** `+52XXXXXXXXXX` (exactamente 12 caracteres con el signo `+`).
2. **Casos especiales gestionados:**
   - **Prefijo móvil WhatsApp legacy (`521`):** Convierte `+52 1 55 1234 5678` ➔ `+525512345678` (elimina el `1` móvil obsoleto).
   - **Prefijos locales obsoletos (`044`, `045`):** Convierte `044 55 1234 5678` ➔ `+525512345678`.
   - **Nacionales de 10 dígitos:** Convierte `5512345678` (CDMX), `8128651819` (Monterrey) o `3312345678` (Guadalajara) ➔ `+52XXXXXXXXXX`.
   - **Formato visual para UI:** `formatMexicanPhoneDisplay()` formatea a `+52 (XX) XXXX-XXXX`.

---

## 3. Arquitectura del Monorepo (Workspaces)

El repositorio está estructurado como un monorepo administrado con **npm workspaces**:

```
asistente/
├── package.json               # Configuración raíz de npm workspaces
├── tsconfig.base.json         # Opciones estrictas de TypeScript
├── dev.db                     # Base de datos SQLite local
├── AGENTS.md                  # Especificación canónica para agentes de IA (este archivo)
├── CLAUDE.md                  # Especificación sincronizada para Claude
├── README.md                  # Introducción y guía de inicio rápido
│
├── packages/
│   ├── shared-types/          # @asistente/shared-types: Interfaces y enums comunes
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts       # Tenant, Doctor, Service, Appointment, ChannelType, etc.
│   │
│   ├── database/              # @asistente/database: Capa de persistencia con Prisma
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/schema.prisma # Esquema relacional con 10 modelos
│   │   └── src/
│   │       ├── index.ts       # Singleton exportado: db
│   │       └── seed.ts        # Datos iniciales (Clínica Dental Sonrisas Polanco)
│   │
│   └── ai-agent/              # @asistente/ai-agent: Motor conversacional e inteligencia clínica
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts       # Re-export de módulos
│           ├── agent/
│           │   └── geminiAgent.ts # OmnichannelAgent (Gemini 2.5 Flash + 13 fallbacks)
│           ├── calendar/
│           │   └── scheduler.ts   # SchedulerService (disponibilidad, colisiones, reservas)
│           ├── triage/
│           │   └── triageEngine.ts # evaluateTriage (clasificación de síntomas 911 vs urgencia)
│           ├── payment/
│           │   └── mercadoPagoService.ts # MercadoPagoService (No-Show Shield en MXN)
│           ├── utils/
│           │   └── phone.ts       # normalizeMexicanPhone, formatMexicanPhoneDisplay
│           ├── test-suite.ts      # Batería unitaria rápida (12 pruebas)
│           └── stress-test-suite.ts # Suite E2E exhaustiva (aislamiento, colisiones, webhooks)
│
└── apps/
    ├── api/                   # @asistente/api: Servidor Fastify (Puerto 3000)
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts       # Entrypoint Fastify, CORS, FormBody, WebSockets
    │       ├── routes/
    │       │   ├── admin.ts   # CRUD tenants, doctores, servicios, citas, conversaciones
    │       │   ├── webhooks.ts# Webhooks de Meta (WhatsApp), Twilio Voice y Mercado Pago
    │       │   └── voice.ts   # WebSocket /voice/stream para streaming de audio
    │       ├── services/
    │       │   ├── whatsappService.ts    # Meta Cloud API (mensajes de texto y botones)
    │       │   └── voiceStreamService.ts # Twilio Voice Sessions, barge-in y post-llamada
    │       └── test-api.ts    # Pruebas de integración in-memory para Fastify
    │
    └── web/                   # @asistente/web: Frontend Next.js 15 App Router (Puerto 3001)
        ├── package.json
        ├── tsconfig.json
        ├── tailwind.config.ts
        ├── PRODUCT.md         # Ficha de producto bajo estándar Impeccable
        └── src/
            ├── context/
            │   └── TenantContext.tsx # Estado global de modo (Live vs Demo) y clínica activa
            ├── components/
            │   ├── dashboard/
            │   │   └── DashboardShell.tsx # Shell con selector de clínica y toggles
            │   └── landing/          # Hero, Simulador, ROI, Testimonios, Pricing, FAQ
            └── app/
                ├── layout.tsx        # Root layout HTML/Body
                ├── page.tsx          # Landing page comercial con Simulador Interactivo
                └── dashboard/
                    ├── layout.tsx    # Layout envuelto con TenantProvider y DashboardShell
                    ├── page.tsx      # Métricas, KPIs, citas de hoy, reproductor de audio
                    ├── inbox/page.tsx# Bandeja omnicanal en tiempo real con botón Takeover
                    ├── calendar/page.tsx # Vista de agenda por doctor y filtros
                    ├── team/page.tsx # Catálogo de médicos y servicios con precios MXN
                    └── settings/page.tsx # Parámetros de clínica, E.164 y prompt de IA
```

---

## 4. Modelo de Datos y Esquema Prisma (`schema.prisma`)

El esquema de base de datos (`packages/database/prisma/schema.prisma`) utiliza SQLite para desarrollo local (`dev.db`) con soporte nativo para migrar a PostgreSQL en producción.

### Resumen de Modelos y Relaciones

| Modelo | Propósito Principal | Campos Clave / Claves Foráneas | Restricciones / Índices Únicos |
| :--- | :--- | :--- | :--- |
| **`Tenant`** | Entidad de clínica o consultorio (aislamiento multi-tenant) | `id`, `name`, `slug`, `phoneE164`, `timezone`, `address`, `welcomeMessage`, `emergencyInstructions`, `isActive` | `@unique([slug])` |
| **`User`** | Personal médico y administrativo con acceso al panel | `id`, `tenantId`, `email`, `passwordHash`, `name`, `role` (`ADMIN`, `RECEPTIONIST`, `DOCTOR`, `STAFF`) | `@unique([tenantId, email])` |
| **`Doctor`** | Especialistas que ofrecen consulta en la clínica | `id`, `tenantId`, `name`, `specialty`, `phone`, `email`, `calendarId`, `availabilityRules` (JSON) | Relación obligatoria con `Tenant` |
| **`Service`** | Procedimientos clínicos ofrecidos | `id`, `tenantId`, `name`, `description`, `durationMinutes`, `priceMxn`, `requiredDepositMxn`, `category` | Relación obligatoria con `Tenant` |
| **`Patient`** | Directorio de pacientes de la clínica | `id`, `tenantId`, `fullName`, `phoneE164`, `whatsappId`, `instagramId`, `messengerId`, `email`, `isVip` | `@unique([tenantId, phoneE164])` |
| **`Appointment`** | Reservas y citas médicas/dentales | `id`, `tenantId`, `patientId`, `doctorId`, `serviceId`, `startTime`, `endTime`, `status`, `paymentStatus`, `depositAmountMxn`, `depositPaymentUrl`, `channelOrigin`, `symptoms` | Índices por doctor, paciente y fecha |
| **`Conversation`** | Hilo de comunicación omnicanal con un paciente | `id`, `tenantId`, `patientId`, `channel`, `externalChannelId`, `isHandedOverToHuman`, `lastMessageAt` | `@unique([tenantId, channel, externalChannelId])` |
| **`Message`** | Mensaje individual entrante o saliente | `id`, `conversationId`, `tenantId`, `direction` (`INBOUND`, `OUTBOUND`), `senderRole`, `content`, `channel`, `mediaUrl` | Relación en cascada con `Conversation` |
| **`ChannelConfig`** | Credenciales y API keys por canal de comunicación | `id`, `tenantId`, `channelType`, `credentials` (JSON), `webhookSecret`, `isActive` | `@unique([tenantId, channelType])` |
| **`FaqItem`** | Banco de preguntas frecuentes y respuestas oficiales | `id`, `tenantId`, `question`, `answer`, `category`, `keywords` | Relación obligatoria con `Tenant` |
| **`Job`** | Cola durable de webhooks/outbox (ver sección 11.3) | `id`, `tenantId?`, `type`, `payload`, `status`, `attempts`, `maxAttempts`, `runAt`, `dedupeKey` | `@unique([dedupeKey])`, índices por `status/runAt` y `tenantId/type` |

### Enums y Estados Canónicos (`@asistente/shared-types`)
- **`ChannelType`:** `'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'PHONE_CALL' | 'WEBCHAT'`
- **`AppointmentStatus`:** `'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | 'NO_SHOW'`
- **`PaymentStatus`:** `'NONE' | 'DEPOSIT_PENDING' | 'DEPOSIT_PAID' | 'FULLY_PAID' | 'REFUNDED'`
- **`MessageDirection`:** `'INBOUND' | 'OUTBOUND'`
- **`MessageSenderRole`:** `'PATIENT' | 'AI_AGENT' | 'HUMAN_STAFF' | 'SYSTEM'`

---

## 5. Motor de Inteligencia Artificial (`@asistente/ai-agent`)

El agente principal es la clase `OmnichannelAgent` (`packages/ai-agent/src/agent/geminiAgent.ts`).

### 5.1 Capas de Decisión del Agente

```
Mensaje Entrante (Voz, WhatsApp, IG, FB, Web)
        │
        ▼
[Capa 1: Triaje Clínico Vital Inmediato]
   ¿Presenta riesgo vital o síntomas de emergencia crítica (911)?
        ├── SÍ ──► Respuesta de emergencia médica inmediata + Alerta a recepción
        │          (requiresHumanHandover = true; NO intenta agendar cita)
        └── NO
             │
             ▼
[Capa 2: Motor Gemini 2.5 Flash con Tool Calling]
   ¿Existe GEMINI_API_KEY configurada y funcional?
        ├── SÍ ──► Bucle de Function Calling (hasta 5 iteraciones)
        │          Ejecuta herramientas sobre DB Prisma y devuelve respuesta final
        └── NO / Error de cuota / Fallo de red
             │
             ▼
[Capa 3: Motor Heurístico y Local de Respaldo (13 Intenciones)]
   Clasificación determinista con persistencia en DB,
   consultas de citas reales y respuestas contextuales en español mexicano.
```

### 5.2 Herramientas de Gemini 2.5 Flash (Tool Calling)

Cuando Gemini 2.5 Flash procesa la conversación, dispone de 8 declaraciones de función oficiales:

1. **`consultar_disponibilidad`:**
   - *Parámetros:* `fecha` (YYYY-MM-DD, obligatorio), `servicioId` (opcional), `doctorId` (opcional), `preferenciaTurno` (`morning` | `afternoon` | `any`).
   - *Acción:* Llama a `SchedulerService.getAvailableSlots()` respetando horarios hábiles, comidas y buffers.
2. **`agendar_cita`:**
   - *Parámetros:* `nombrePaciente`, `telefonoPaciente`, `servicioId`, `doctorId`, `horarioInicioIso`, `sintomas`.
   - *Acción:* Valida anti-colisión, crea/actualiza paciente en E.164 y genera cita en base de datos.
3. **`evaluar_urgencia_sintomas`:**
   - *Parámetros:* `sintomas` (obligatorio), `nivelDolor` (número del 1 al 10).
   - *Acción:* Ejecuta `evaluateTriage()` y sugiere canalización hospitalaria o especialista prioritario.
4. **`consultar_faq_clinica`:**
   - *Parámetros:* `consulta` (texto de la pregunta).
   - *Acción:* Recupera respuestas de la tabla `FaqItem` para la clínica activa.
5. **`confirmar_asistencia_cita`:**
   - *Parámetros:* `telefonoPaciente`.
   - *Acción:* Localiza la cita activa del paciente y actualiza su estado a `CONFIRMED`.
6. **`consultar_citas_paciente`:**
   - *Parámetros:* `telefonoPaciente`.
   - *Acción:* Consulta fecha, hora, doctor y estatus de la próxima cita del paciente.
7. **`cancelar_cita_paciente`:**
   - *Parámetros:* `telefonoPaciente`, `motivo`.
   - *Acción:* Marca la cita como `CANCELLED` en la base de datos sin penalización.
8. **`transferir_a_recepcionista_humano`:**
   - *Parámetros:* `motivo`, `resumen`.
   - *Acción:* Marca `requiresHumanHandover: true` y notifica a la recepción para silenciar a la IA.

### 5.3 Motor de Respaldo Heurístico (13 Intenciones)

Si no se dispone de conexión a Google Gemini o falla el servicio externo, el agente activa su motor heurístico (`handleFallbackProcessing`), garantizando **cero tiempo de inactividad**:

- **Intención 0: Urgencias Dentales Agudas:** Detecta dolor severo (nivel ≥ 7, abscesos, traumatismos) y canaliza con el cirujano maxilofacial o endodoncista el mismo día.
- **Intención 1: Confirmación de Asistencia:** Detecta frases como `"asistencia"`, `"confirmo"`, `"sí confirmo"`, `"allá nos vemos"`. Actualiza la cita en BD y devuelve confirmación con dirección y valet parking.
- **Intención 2: Agradecimientos y Cortesías:** Responde amablemente a `"gracias"`, `"muchas gracias"`, `"excelente día"`, recordando el horario de su cita agendada si existe.
- **Intención 3: Consulta de Cita:** Responde a `"¿cuándo es mi cita?"`, `"¿a qué hora es?"`, consultando la cita en BD y mostrándola en horario de CDMX.
- **Intención 4: Cancelación de Cita:** Cancela la cita activa sin penalizaciones ante expresiones como `"no voy a poder ir"`, `"cancelar cita"`.
- **Intención 5: Reagendar Cita:** Ofrece de inmediato los 3 mejores horarios del día siguiente al solicitar `"reagendar"` o `"cambiar fecha"`.
- **Intención 6: Selección de Turno (1, 2, 3 o por hora):** Permite al paciente responder con `"la 1"`, `"el 2"`, `"a las 4"` para apartar el slot y formalizar la cita.
- **Intención 7: Respuestas Afirmativas Contextuales:** Si el mensaje previo del asistente ofrecía agendar y el paciente dice `"sí"`, `"por favor"`, `"va"`, despliega los horarios disponibles.
- **Intención 8: Detección de Tratamiento Específico:** Identifica menciones de `"limpieza"`, `"blanqueamiento"`, `"resina"`, `"muela del juicio"` y ofrece el precio en MXN y slots de agenda.
- **Intención 9: Precios y Menú de Servicios (Opción 2):** Envía la lista de precios oficiales de la clínica en Pesos Mexicanos.
- **Intención 10: Ubicación, Estacionamiento y Seguros (Opción 3):** Explica dirección física, valet parking, pagos a MSI y aseguradoras con convenio de reembolso.
- **Intención 11: Solicitud General de Cita (Opción 1):** Presenta slots para el día siguiente con opciones numeradas.
- **Intención 12: Saludo Inicial y Menú Principal:** Despliega el menú de bienvenida con las opciones 1️⃣, 2️⃣ y 3️⃣.

### 5.4 Protocolo de Triaje Clínico en 3 Niveles (`packages/ai-agent/src/triage/triageEngine.ts`)

| Nivel de Urgencia | Tipo de Cuadro | Síntomas Clave (Keywords) | Acción Obligatoria del Sistema |
| :--- | :--- | :--- | :--- |
| **🚨 Nivel 1: `CRITICAL_EMERGENCY`** | Emergencia Médica Vital | Dificultad para respirar, dolor de pecho, hemorragia que no para, desmayo, fractura de mandíbula, anafilaxia. | **NO agendar cita.** Instruir a llamar al 911 o acudir de inmediato a urgencias hospitalarias. `requiresHumanHandover = true`. |
| **⚠️ Nivel 2: `URGENT_DENTAL`** | Urgencia Dental Aguda | Dolor insoportable, dolor de muela que no deja dormir, diente salido de golpe, flemón/absceso, cara hinchada, fiebre. | Recomendar consulta prioritaria para **el mismo día** con Cirujano Maxilofacial / Endodoncista. Instrucciones preventivas (no calor, no aspirina). |
| **📅 Nivel 3: `ROUTINE`** | Consulta General o Estética | Limpiezas, revisiones, valoraciones, ortodoncia, blanqueamiento dental. | Proceso de agendamiento estándar en días hábiles. |

### 5.5 Motor de Calendario y Anti-Colisión (`packages/ai-agent/src/calendar/scheduler.ts`)

- **Reglas por Doctor (`DoctorAvailabilityRules`):** Define turnos por día de la semana (1 a 6), horario de comida protegido (`lunchStart`, `lunchEnd`), y buffer obligatorio entre pacientes (por defecto 10 minutos).
- **Garantía Anti-Colisión:** Antes de insertar la cita en base de datos, ejecuta:
  ```typescript
  const conflict = await db.appointment.findFirst({
    where: {
      doctorId,
      status: { in: ['CONFIRMED', 'PENDING'] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  ```
  Si existe conflicto, rechaza la operación inmediatamente con mensaje descriptivo para evitar sobreagendamientos.
- **Upsert Seguro del Paciente:** Los pacientes se identifican y actualizan bajo la clave compuesta `@unique([tenantId, phoneE164])`.

### 5.6 Escudo Anti-Inasistencias con Mercado Pago (`packages/ai-agent/src/payment/mercadoPagoService.ts`)

1. **Generación de Preferencia:** Para procedimientos que exigen anticipo (ej. Limpieza $200 MXN, Blanqueamiento $500 MXN), se crea un link de cobro seguro de Mercado Pago (`https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=...`).
2. **Estado Inicial:** La cita queda en `paymentStatus: "DEPOSIT_PENDING"`.
3. **Acreditación vía Webhook:** Al recibirse la notificación en `POST /webhooks/mercadopago`, la cita pasa a `paymentStatus: "DEPOSIT_PAID"`, asegurando el lugar y enviando confirmación por WhatsApp.

---

## 6. Servidor Backend Fastify (`apps/api`)

Servidor Node.js de alto rendimiento con TypeScript, Fastify v5.2, WebSockets y soporte para webhooks de Meta y Twilio.

### 6.1 Catálogo de Endpoints REST

#### Gestión de Clínicas (Tenants)
- `GET /health`: Healthcheck del sistema con información de canales activos.
- `GET /api/tenants`: Listar todas las clínicas registradas con sus doctores y servicios.
- `GET /api/tenants/:slug`: Detalle de una clínica por slug o por ID.
- `POST /api/tenants`: Onboarding de una nueva clínica (crea automáticamente doctores y servicios base).
- `PATCH /api/tenants/:id`: Actualizar configuración, teléfono E.164, dirección y bienvenida.
- `POST /api/tenants/:id/seed`: Generar 4 citas y conversaciones de prueba para la clínica (Sandbox).
- `DELETE /api/tenants/:id/reset`: Limpiar todas las citas y mensajes de prueba de la clínica.

#### Gestión de Doctores y Servicios
- `POST /api/tenants/:id/doctors`: Registrar un nuevo doctor con su especialidad.
- `DELETE /api/doctors/:id`: Eliminar un doctor y sus citas asociadas.
- `POST /api/tenants/:id/services`: Registrar un servicio clínico con precio y anticipo en MXN.
- `DELETE /api/services/:id`: Eliminar un servicio.

#### Citas y Disponibilidad
- `GET /api/availability?tenantId=...&date=YYYY-MM-DD[&doctorId=...&serviceId=...]`: Consulta slots libres calculados en tiempo real.
- `GET /api/appointments?tenantId=...[&status=...]`: Listar citas con pacientes, doctores y servicios.
- `POST /api/appointments`: Crear una cita manualmente desde el panel de recepción.
- `PATCH /api/appointments/:id`: Actualizar estado, notas o fecha de una cita.
- `POST /api/appointments/:id/deposit-preference`: Generar preferencia de cobro de anticipo en Mercado Pago.
- `DELETE /api/appointments/:id`: Cancelar formalmente una cita (`status: "CANCELLED"`).

#### Bandeja Omnicanal y Copiloto Humano
- `GET /api/conversations?tenantId=...`: Listar conversaciones con último mensaje y datos del paciente.
- `GET /api/conversations/:id/messages`: Historial completo de mensajes ordenados cronológicamente.
- `POST /api/conversations/:id/takeover`: Activar (`isHandedOver: true`) o desactivar la intervención humana.
  > **Regla estricta:** Cuando `isHandedOverToHuman === true`, la IA permanece 100% en silencio.
- `POST /api/conversations/:id/reply`: Envía un mensaje redactado por el recepcionista humano y lo transmite al paciente vía WhatsApp.

### 6.2 Webhooks (Meta WhatsApp & Twilio Voice)

#### Webhook de Meta (`/webhooks/meta`)
- `GET /webhooks/meta`: Validación con `hub.challenge` y `META_VERIFY_TOKEN` (por defecto `asistente_mexico_secret_2026`).
- `POST /webhooks/meta`:
  - Recibe mensajes de texto, audios, fotos y respuestas de **botones interactivos** oficiales (`confirm_...`, `reschedule_...`).
  - Asocia el mensaje al `Tenant` correspondiente.
  - Almacena mensaje entrante, invoca al `OmnichannelAgent` con historial de los últimos 8 mensajes, persiste la respuesta y la envía al paciente mediante `WhatsAppService`.

#### Webhook de Twilio Voice (`/voice/incoming`)
- `POST /voice/incoming`: Responde con TwiML en español mexicano usando la voz neural de Amazon Polly (`Polly.Mia-Neural`), conectando el audio con el WebSocket:
  ```xml
  <Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">Bienvenido a Dental Sonrisas Polanco. Conectando con tu asistente virtual.</Say>
    <Connect>
      <Stream url="wss://tu-dominio.com/voice/stream" />
    </Connect>
  </Response>
  ```

#### Webhook de Mercado Pago (`/webhooks/mercadopago`)
- `POST /webhooks/mercadopago`: Procesa la notificación IPN de pago aprobado y actualiza la cita a `DEPOSIT_PAID`.

### 6.3 WebSocket Twilio Media Streams (Audio Bidireccional)

- Ruta: `ws://0.0.0.0:3000/voice/stream` (`VoiceStreamService.handleConnection`).
- Eventos administrados:
  - `start`: Extrae `streamSid`, `callSid`, teléfono del llamante (`fromPhone`) y tenant destino.
  - `media`: Transmisión de paquetes de audio base64 (mu-law 8kHz).
  - `stop`: Cierre de la llamada. Activa la automatización post-llamada para enviar un mensaje de seguimiento por WhatsApp.
  - `clear` (Barge-in): Permite interrumpir la reproducción del bot en tiempo real si el usuario habla.

---

## 7. Frontend Web Next.js 15 (`apps/web`)

Construido sobre Next.js 15 (App Router), React 19, Tailwind CSS y Lucide React.

### 7.1 Rutas y Estructura del App Router

- `/`: Landing page pública de conversión con simulador interactivo de llamadas telefónicas y chat de WhatsApp, calculadora de ROI, testimonios clínicos y planes de precios.
- `/dashboard`: Panel de control general con KPIs dinámicos (ingresos en MXN, porcentaje de asistencia, citas del día, reproductor de llamadas de Twilio y badges de No-Show Shield).
- `/dashboard/inbox`: Bandeja de entrada omnicanal unificada con selector de paciente, historial de chat, botón de toma de control (Takeover) y envío de mensajes manuales.
- `/dashboard/calendar`: Calendario visual e interactivo de consultas con filtro por doctor y visualización de estatus de anticipo.
- `/dashboard/team`: Gestión del equipo médico y catálogo de servicios con asignación de precios y anticipos obligatorios.
- `/dashboard/settings`: Configuración general de la clínica, teléfono E.164, mensaje de bienvenida y protocolo de emergencias.

### 7.2 Estado Global Dual: Sandbox en Vivo vs. Showcase Demo

El frontend implementa el hook `useTenant()` mediante `TenantContext.tsx`:

- **🟣 Modo Demo (Showcase Comercial):** Muestra una clínica preconfigurada de alto rendimiento ("Clínica Dental Sonrisas Polanco") con métricas consolidadas ($185,000 MXN mensuales, 96.8% de asistencia, llamadas grabadas y citas pobladas) para demostraciones comerciales a médicos.
- **🟢 Modo En Vivo (Live Sandbox):** Conectado directamente a la API de Fastify y a la base de datos local SQLite (`dev.db`). Permite seleccionar clínicas, crear nuevos consultorios en vivo, presionar `+ Citas Demo` para poblar datos de prueba instantáneamente o `Limpiar Citas` para vaciarlos.

### 7.3 Sistema de Diseño Clínico (Principios Impeccable)

- **Paleta de Colores:**
  - **Teal (`teal-600` `#0d9488` / `teal-700`):** Color principal de salud, higiene y confianza.
  - **Slate (`slate-900` / `slate-600`):** Tipografía sobria y jerarquía de texto clínica.
  - **Emerald (`emerald-600`):** Confirmaciones, citas asistidas y anticipos pagados.
  - **Ámbar (`amber-600`):** Citas pendientes de anticipo o atención humana requerida.
  - **Rojo (`red-600`):** Triaje de emergencias vitales y cancelaciones.
  - **Púrpura (`purple-600`):** Distintivo visual exclusivo para el Modo Demo Showcase.
- **Cero Estados Vacíos Muertos:** Toda pantalla sin datos debe ofrecer un estado vacío ilustrado con un botón de acción rápida directo (ej. `+ Citas Demo`).
- **Directiva `'use client';`:** Obligatoria en la primera línea de cualquier componente que utilice hooks de React (`useState`, `useEffect`, `useContext`, `useCallback`).

---

## 8. Reglas de Código Inviolables para Agentes de IA

Cualquier agente de IA que modifique o extienda este código debe cumplir con las siguientes 9 reglas inviolables:

0. **Bitácora y Commit en Cada Cambio (regla de proceso, no negociable):**
   - Ninguna tarea está terminada hasta que exista una entrada en [`BITACORA.md`](BITACORA.md) y un commit con formato Conventional Commits. Ver el procedimiento completo en [CLAUDE.md § 7](CLAUDE.md).
   - La entrada va **hasta arriba** del archivo y debe explicar **por qué** se hizo el cambio, no solo qué se tocó. Secciones obligatorias: `Qué se hizo`, `Archivos tocados`, `Verificación`.
   - El mensaje del commit sigue `tipo(alcance): descripción en imperativo y minúscula`, con encabezado de máximo 72 caracteres. El hook `.githooks/commit-msg` lo rechaza si no cumple.
   - **Nunca uses `--no-verify`** para saltarte la validación: corrige el mensaje.
   - Un commit = un cambio coherente. Si necesita dos entradas de bitácora, necesita dos commits.

1. **Aislamiento Multi-Tenant Estricto:**
   - **NUNCA** realices consultas de lectura o escritura sobre `Doctor`, `Service`, `Patient`, `Appointment`, `Conversation` o `Message` sin incluir el filtro o asignación de `tenantId`. Mezclar datos entre clínicas es un fallo crítico de seguridad.
2. **Respeto Absoluto de la Zona Horaria (`America/Mexico_City`):**
   - No asumas la hora del sistema operativo local. Toda fecha presentada al usuario o al paciente debe convertirse explícitamente a `America/Mexico_City`. En la base de datos se guarda estrictamente en UTC.
3. **Validación de Conflictos de Agenda (Anti-Colisión):**
   - Jamás insertes una cita médica sin verificar previamente la no superposición de horarios para el doctor en cuestión.
4. **Silencio de la IA en Modo Copiloto Humano:**
   - Si `conversation.isHandedOverToHuman === true`, el agente de IA **NO** debe emitir ninguna respuesta automática. Todos los mensajes entrantes pertenecen exclusivamente a la atención del personal humano.
5. **Normalización E.164 Obligatoria:**
   - Todo número telefónico que ingrese a la base de datos debe pasar por `normalizeMexicanPhone()`. No almacenes números con guiones, espacios o prefijos legacy como `044` o `521`.
6. **Resolución de URLs del Entorno:**
   - En el frontend, las peticiones HTTP deben consumir `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'`, evitando URLs quemadas en código duro.
7. **La Identidad del Paciente la Define el Canal, Nunca el Modelo:**
   - Los argumentos que produce Gemini derivan del **texto libre del paciente**. Una herramienta que acepte un teléfono como parámetro permite que cualquiera dicte el número ajeno y lea o cancele la cita de otra persona.
   - Para consultar, confirmar o cancelar, usa **siempre** `channelAuthenticatedPhone(context)` (remitente de WhatsApp o caller ID de Twilio). No expongas `telefonoPaciente` en el esquema de esas herramientas: si el modelo no puede expresarlo, no puede equivocarse.
   - La misma regla aplica a cualquier herramienta futura que lea o modifique datos de un paciente concreto.
8. **Rol Explícito en Operaciones Destructivas y de Cobro:**
   - Borrar historial, generar datos de prueba, o tocar `paymentStatus`, `depositAmountMxn` y `paymentReferenceId` exige `requireRole()`. Tener sesión válida no basta: marcar una cita como pagada sin que Mercado Pago lo confirme es un agujero de dinero.
   - Todo listado debe llevar `take` acotado (`parseLimit`). Sin límite, cada refresco del panel baja el historial completo de la clínica.

---

## 9. Variables de Entorno y Configuración

Archivo `.env` en la raíz del proyecto (basado en `.env.example`):

```bash
# 1. Base de datos (SQLite local o PostgreSQL)
DATABASE_URL="file:../../dev.db"

# 2. Servidor API Fastify
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# 3. Inteligencia Artificial (Google Gemini 2.5 Flash)
# Si está vacía, el sistema activa automáticamente el motor heurístico local de 13 intenciones
GEMINI_API_KEY=

# 4. Meta Cloud API (WhatsApp Business oficial)
META_VERIFY_TOKEN=asistente_mexico_secret_2026
META_WHATSAPP_TOKEN=
META_PHONE_NUMBER_ID=

# 5. Telefonía Twilio México (+52)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=+525555123456

# 6. Servicios de Voz en Tiempo Real
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=

# 7. Pasarelas de Pago México
MERCADOPAGO_ACCESS_TOKEN=
STRIPE_SECRET_KEY=
```

---

## 10. Comandos Operativos y Baterías de Pruebas

### Instalación y Compilación
```bash
# Instalar dependencias en todos los workspaces
npm install

# Generar cliente de Prisma
npm run db:generate

# Sincronizar esquema de base de datos
npm run db:push

# Poblar base de datos con la clínica modelo
npm run db:seed

# Compilar todo el monorepo (Typecheck completo)
npm run build
```

### Ejecución en Desarrollo
```bash
# Iniciar backend Fastify en http://localhost:3000
npm run dev --workspace=@asistente/api

# Iniciar frontend Next.js en http://localhost:3001
npm run dev --workspace=@asistente/web
```

### Baterías de Pruebas Automatizadas (QA)
```bash
# 1. Batería del motor de IA (E.164, triaje, agenda y selección de servicio)
npm test --workspace=@asistente/ai-agent

# 2. Todas las suites de la API (integración, seguridad, pagos, cola, voz, observabilidad)
npm test

# 3. Suite de estrés E2E (aislamiento multi-tenant, anti-colisiones, triaje, Mercado Pago, takeover)
npm run test:stress

# 4. E2E del panel con navegador real (login -> rewrite /auth -> dashboard) con Playwright
npm run test:e2e
```

## 11. Actualización de Arquitectura (Bloque Crítico e Importante)

> Esta sección complementa la especificación original y describe los controles ya implementados. En caso de conflicto, esta sección prevalece.

### 11.1 Seguridad de la API
- `POST /auth/login` (email + contraseña + `tenantSlug` opcional) emite un JWT; `GET /auth/me` devuelve la sesión. Contraseñas con `scrypt` y salt (`packages/database/src/password.ts`).
- Todas las rutas `/api/*` exigen `Authorization: Bearer <token>`. El `tenantId` se deriva del token; un `tenantId` ajeno responde `403`. Alta de clínicas limitada por `PLATFORM_ADMIN_EMAILS`; operaciones destructivas exigen rol `ADMIN`.
- Webhooks: Meta exige `X-Hub-Signature-256` sobre el raw body, Twilio `X-Twilio-Signature` y Mercado Pago `x-signature`. Sin secreto configurado se rechaza (`fail closed`); `WEBHOOK_ALLOW_UNVERIFIED=true` solo aplica fuera de producción.
- `helmet`, rate limiting (`RATE_LIMIT_MAX`), límite de body (`BODY_LIMIT_BYTES`) y CORS con allowlist (`CORS_ORIGINS`).

### 11.2 Multi-Tenant y Datos
- `SchedulerService` valida `tenantId` en clínica, doctor y servicio; agenda con `$transaction` (anti-colisión) y valida horario hábil, comida y fechas futuras.
- E.164 obligatorio en la capa de negocio (`normalizeMexicanPhone`); teléfonos inválidos se rechazan con 400.
- `Message.externalMessageId` (unique por conversación) da idempotencia a los `wamid` de Meta; `Message.deliveryStatus` registra `PENDING/SENT/FAILED`.
- `DATABASE_URL` canónico: `file:./dev.db` (Prisma resuelve a `packages/database/prisma/dev.db`). `*.db` y `.chrome-user-dir/` están en `.gitignore`.

### 11.3 Cola Durable (`Job`)
- Modelo `Job` (cola outbox): `type`, `payload`, `status` (`PENDING/RUNNING/DONE/FAILED/DEAD`), `attempts`, `maxAttempts`, `runAt`, `dedupeKey` único, `lockedAt/lockedBy`.
- `POST /webhooks/meta` persiste el entrante y encola (`META_INBOUND_MESSAGE`); el worker procesa con backoff, recupera trabajos abandonados y aplica dead-letter.
- Outbox de WhatsApp (`WHATSAPP_SEND`) y seguimiento post-llamada (`VOICE_POST_CALL_FOLLOWUP`). Configuración: `QUEUE_WORKER_ENABLED`, `JOBS_*` (ver `.env.example`). Detalle en `apps/api/QUEUE.md`.

### 11.4 Voz en Tiempo Real
- Twilio Media Streams ↔ Deepgram Nova-2 (STT) ↔ `OmnichannelAgent` ↔ Cartesia Sonic (TTS, mu-law 8 kHz), con `barge-in` (`clear`) y persistencia de la llamada como conversación `PHONE_CALL`. Si el agente pide handover y `TWILIO_HUMAN_NUMBER` está configurado, la llamada viva se redirige con `<Dial>` a recepción (`TWILIO_HUMAN_DIAL_TIMEOUT`).
- Variables: `DEEPGRAM_*`, `CARTESIA_*`, `VOICE_*`, `VOICE_STREAM_TOKEN` (el TwiML lo envía como `<Parameter name="authToken">`). Sin llaves el pipeline se deshabilita explícitamente. Detalle en `apps/api/VOICE.md`.

### 11.5 Pagos
- Con `MERCADOPAGO_ACCESS_TOKEN`, la preferencia se crea en `/checkout/preferences`; el webhook reconsulta `/v1/payments/:id`, valida estado, cita y monto antes de acreditar y envía confirmación por WhatsApp. Sin token se usa link simulado solo en desarrollo. Todos los montos MXN se normalizan a 2 decimales en los bordes de escritura (`roundMxn`).

### 11.6 Observabilidad y Migraciones
- Logging NDJSON sin PHI (`@asistente/observability`), `GET /health` (cola + métricas), `GET /metrics` (JSON) y `GET /metrics/prometheus` (texto Prometheus), protegidos con `METRICS_TOKEN`.
- Migraciones versionadas en `packages/database/prisma/migrations` (`npm run db:migrate` / `db:migrate:status`). Para BD de desarrollo existente: `prisma migrate resolve --applied 0001_baseline`.

### Exposición de Webhooks para Pruebas Reales (WhatsApp y Twilio)
```bash
# Iniciar túnel público seguro hacia el puerto 3000
ngrok http 3000

# URL de Webhook Meta WhatsApp: https://<tu-id>.ngrok-free.app/webhooks/meta
# URL de Webhook Twilio Voice:    https://<tu-id>.ngrok-free.app/voice/incoming
# Token de verificación Meta:     asistente_mexico_secret_2026
```
