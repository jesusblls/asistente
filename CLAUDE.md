# CLAUDE.md — AsistentePro Clínicas (Plataforma SaaS Omnicanal IA México +52)

Este documento es la **fuente de verdad técnica y de negocio** para el desarrollo en este repositorio. Para una especificación exhaustiva de ingeniería dirigida a agentes de IA autónomos (modelos de datos completos, las 8 herramientas de Gemini 2.5 Flash, las 13 intenciones del fallback heurístico y arquitectura de streaming de voz), consulta también [AGENTS.md](AGENTS.md).

> ⚠️ **Antes de escribir una sola línea:** todo cambio en este repositorio exige
> una entrada en [`BITACORA.md`](BITACORA.md) y un commit con formato
> Conventional Commits. El procedimiento completo está en la
> [**§ 7 — Protocolo Obligatorio de Bitácora y Commits**](#-7-protocolo-obligatorio-de-bitácora-y-commits)
> al final de este documento. Un hook de git lo verifica automáticamente.

---

## 🇲🇽 1. Reglas de Negocio del Dominio (México)

### 1.1 Localización y Datos Regionales
* **País y Prefijo Telefónico:** México (`+52`).
* **Zona Horaria Oficial:** `America/Mexico_City` (GMT-6, tiempo del centro de México).
  * Las fechas se almacenan en UTC (ISO 8601) en la base de datos y se presentan siempre en horario de la Ciudad de México al usuario y a los pacientes.
* **Moneda:** Pesos Mexicanos (`MXN` / `$`). Todos los precios de consulta y anticipos deben expresarse y formatearse en pesos (`$850 MXN`).
* **Facturación e Impuestos:** Soporte para emisión de factura fiscal mexicana (CFDI 4.0) con RFC y comprobantes para aseguradoras nacionales (GNP, MetLife, AXA, Seguros Monterrey, Mapfre).

### 1.2 Normalización Telefónica E.164 (`packages/ai-agent/src/utils/phone.ts`)
* Todos los números telefónicos deben normalizarse al formato canónico internacional E.164: `+52XXXXXXXXXX` (12 caracteres en total).
* Casos cubiertos automáticamente:
  * Celular legacy de WhatsApp: `+52 1 55 1234 5678` ➔ `+525512345678` (eliminar el prefijo `1`).
  * Prefijo local legacy: `044 55 1234 5678` o `045 ...` ➔ `+525512345678`.
  * Claves lada de 10 dígitos (CDMX `55`, Monterrey `81`, Guadalajara `33`): `81 2865 1819` ➔ `+528128651819`.
* Formato visual para pantallas: `+52 (81) 2865-1819`.

### 1.3 Protocolo de Triaje Médico / Dental en 3 Niveles (`packages/ai-agent/src/triage/`)
1. **🚨 Nivel 1 — Emergencia Crítica Vital (`CRITICAL_EMERGENCY`):**
   * *Síntomas:* Dificultad para respirar, ahogamiento, dolor en el pecho, hemorragia abundante que no para, pérdida de conocimiento, fractura de mandíbula, anafilaxia.
   * *Acción obligatoria:* El agente **NO** intenta agendar cita; instruye al paciente a llamar inmediatamente al **911** o acudir al hospital de urgencias más cercano (ej. Hospital Español en Polanco), activa alerta a recepción y marca `requiresHumanHandover: true`.
2. **⚠️ Nivel 2 — Urgencia Dental Aguda (`URGENT_DENTAL`):**
   * *Síntomas:* Dolor agudo o insoportable (escala ≥ 7), diente roto por traumatismo, diente salido (avulsión), absceso o flemón, cara hinchada, infección con fiebre.
   * *Acción:* Canalización prioritaria para el **mismo día** con el especialista maxilofacial o endodoncista. Recomendaciones preventivas (no aplicar calor local, no automedicarse con aspirina).
3. **📅 Nivel 3 — Consulta de Rutina / Preventiva (`ROUTINE`):**
   * *Síntomas:* Limpiezas con ultrasonido, valoraciones iniciales, blanqueamientos LED, presupuestos. Agendamiento estándar en horarios hábiles.

### 1.4 Escudo Anti-Inasistencias (No-Show Shield) con Mercado Pago
* Para procedimientos con anticipo requerido (ej. Limpieza $200 MXN, Blanqueamiento $500 MXN), el Asistente genera un link seguro de Mercado Pago (`https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=...`).
* El estado inicial de la cita se registra como `paymentStatus: "DEPOSIT_PENDING"`.
* Al recibir el webhook en `POST /webhooks/mercadopago`, el sistema actualiza automáticamente la cita a `paymentStatus: "DEPOSIT_PAID"` y envía la confirmación de asistencia definitiva por WhatsApp.

### 1.5 Modo Copiloto y Toma de Control Humano (Takeover)
* En cualquier momento, el personal de recepción de la clínica puede pulsar **"Tomar Control (Pausar IA)"** en la Bandeja Omnicanal (`/dashboard/inbox`).
* Endpoint `POST /api/conversations/:id/takeover` actualiza `isHandedOverToHuman: true`.
* **Regla estricta:** Cuando `isHandedOverToHuman === true`, el motor de IA permanece 100% silenciado; todos los mensajes entrantes se enrutan exclusivamente al personal humano y se responden con `POST /api/conversations/:id/reply`.
* Al desactivar el takeover, la IA reanuda sus respuestas automáticas 24/7.

### 1.6 Dashboard Dual: Showcase vs. Sandbox en Vivo
* **🟣 Modo Demo (Showcase Clientes):**
  * Diseñado para demostraciones comerciales a médicos y directores de clínicas.
  * Muestra una clínica modelo consolidada ("Clínica Dental Sonrisas Polanco") con métricas realistas ($185k MXN/mes, 96.8% asistencia, 8 citas hoy, llamadas grabadas de Twilio con reproductor de audio, badges de Mercado Pago).
  * Ninguna pantalla debe verse vacía ni rota en modo Demo.
* **🟢 Modo En Vivo (Sandbox / Pruebas Operativas):**
  * Conectado a la base de datos real SQLite y a la API Fastify.
  * Permite alternar entre clínicas (multi-tenancy), crear nuevas clínicas (`+ Crear Nueva Clínica`), generar 4 citas y chats de prueba con 1 clic (`+ Citas Demo`), o resetear la clínica activa (`Limpiar Citas`).
  * Procesa mensajes reales de WhatsApp Meta Cloud API y llamadas telefónicas de Twilio en tiempo real.

---

## 🏗️ 2. Arquitectura del Monorepo

El proyecto está estructurado con **npm workspaces**:

```
asistente/
├── AGENTS.md                     # Especificación canónica exhaustiva para agentes de IA
├── CLAUDE.md                     # Fuente de verdad de reglas de negocio y arquitectura (este archivo)
├── README.md                     # Guía de inducción y primeros pasos
├── dev.db                        # Base de datos SQLite local
├── package.json                  # Definición de workspaces (@asistente/*)
├── tsconfig.base.json            # Configuración base estricta de TypeScript
│
├── packages/
│   ├── shared-types/             # Tipos e interfaces comunes compartidos
│   │   └── src/index.ts          # Tenant, Doctor, Service, Patient, Appointment, Conversation
│   ├── database/                 # Capa de persistencia con Prisma ORM
│   │   ├── prisma/schema.prisma  # Esquema multi-tenant con SQLite
│   │   └── src/
│   │       ├── index.ts          # Cliente Prisma singleton exportado (`db`)
│   │       └── seed.ts           # Seeder inicial con clínica modelo de Polanco (CDMX)
│   └── ai-agent/                 # Motor de Inteligencia Artificial y Reglas de Negocio
│       └── src/
│           ├── agent/            # OmnichannelAgent (Gemini 2.5 Flash con Tool Calling)
│           ├── calendar/         # SchedulerService (cálculo de slots y anti-colisiones)
│           ├── triage/           # triageEngine (evaluación de síntomas 911 vs urgencia)
│           ├── payment/          # MercadoPagoService (links de anticipo y webhooks)
│           ├── utils/            # Normalizador y formateador de teléfonos E.164 (+52)
│           ├── test-suite.ts     # Pruebas unitarias de normalización y triaje
│           └── stress-test-suite.ts # Pruebas de estrés E2E (aislamiento, colisiones, webhooks)
│
└── apps/
    ├── api/                      # Servidor Fastify Backend (REST, WebSockets y Webhooks)
    │   └── src/
    │       ├── index.ts          # Entrypoint Fastify en puerto 3000
    │       ├── routes/
    │       │   ├── admin.ts      # CRUD de tenants, doctores, servicios, citas y bandeja
    │       │   ├── webhooks.ts   # Webhook Meta (WhatsApp Cloud API) y Twilio Voice
    │       │   └── voice.ts      # WebSocket /voice/stream para streaming de llamadas
    │       ├── services/
    │       │   ├── whatsappService.ts   # Envío de mensajes y plantillas interactivas
    │       │   └── voiceStreamService.ts # Procesamiento de audio bidireccional
    │       └── test-api.ts       # Pruebas de integración HTTP in-memory
    │
    └── web/                      # Frontend Next.js 15 (App Router) en puerto 3001
        └── src/
            ├── app/
            │   ├── page.tsx                  # Landing page comercial con Simulador Interactivo
            │   └── dashboard/
            │       ├── layout.tsx            # Envoltorio con TenantProvider y DashboardShell
            │       ├── page.tsx              # Resumen general con métricas dinámicas
            │       ├── inbox/page.tsx        # Bandeja omnicanal en tiempo real con modo copiloto
            │       ├── calendar/page.tsx     # Calendario interactivo por doctor y filtros
            │       ├── team/page.tsx         # Gestión de doctores y servicios en MXN
            │       └── settings/page.tsx     # Configuración de clínica, teléfonos y tono de IA
            ├── components/
            │   ├── landing/                  # Hero, Simulador, ROI Calculator, Testimonios, Pricing
            │   └── dashboard/DashboardShell.tsx # Selector de clínicas, toggle Demo/Live, Sandbox tools
            └── context/TenantContext.tsx     # Estado global reactivo de modo y clínica activa
```

---

## 💻 3. Stack Tecnológico

| Componente | Tecnología | Versión | Propósito |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | v22+ | Ejecución en backend |
| **Lenguaje** | TypeScript | v5.7+ | Tipado estricto en todo el monorepo |
| **Backend Framework** | Fastify | v5.2+ | API REST ultrarrápida con WebSockets |
| **ORM & DB** | Prisma + SQLite | v6.19+ | Esquema relacional tipado (fácil migración a PostgreSQL) |
| **Frontend Framework** | Next.js (App Router) | v15.1+ | Renderizado híbrido SSR y Client Components |
| **Librería UI** | React | v19.0 | Componentes reactivos |
| **Estilos** | Tailwind CSS | v3.4+ | Sistema de diseño de alta velocidad |
| **Iconografía** | Lucide React | v0.475+ | Iconos vectoriales coherentes |
| **Modelo de IA (LLM)** | Google Gemini 2.5 Flash | SDK `@google/genai` | Agente conversacional con Tool Calling |
| **Telefonía & Voz** | Twilio Voice (+52) | TwiML + WebSockets | Audio streaming bidireccional, Polly.Mia-Neural |
| **Mensajería** | Meta Cloud API | Graph API v22.0 | WhatsApp Business oficial (botones interactivos) |
| **Pasarela de Pago** | Mercado Pago SDK | REST API | Cobro de anticipos en MXN y No-Show Shield |

---

## 🎨 4. Reglas de Diseño de UI y UX (Principios Impeccable)

### 4.1 Paleta de Colores Clínicos
* **Primario (Salud / Confianza):** Teal (`teal-600` `#0d9488`, `teal-700` `#0f766e`, fondos suaves `teal-50`).
* **Neutro / Estructura:** Slate (`slate-900` para títulos, `slate-600` para textos secundarios, `slate-100`/`slate-50` para fondos).
* **Confirmación / Pagado:** Emerald (`emerald-600`, fondos `emerald-50`, bordes `emerald-200`).
* **Atención Humana / Pendiente:** Ámbar (`amber-600`, fondos `amber-50`).
* **Urgencias / Triage Vital:** Rojo (`red-600`, fondos `red-50`).
* **Modo Demo (Showcase):** Púrpura / Violeta (`purple-600`, fondos `purple-50`) para distinguir visualmente el showcase comercial del sandbox en vivo.

### 4.2 Principios de Experiencia de Usuario
* **Cero Estados Vacíos Muertos:** Si una clínica no tiene datos en modo Live, la UI siempre muestra una explicación amigable con botones de acción rápida directos (`+ Citas Demo`).
* **Feedback Inmediato:** Toda mutación (guardar ajustes, agendar cita, enviar mensaje, tomar control) muestra feedback visual instantáneo (animación de carga, checks animados, toasts emergentes).
* **Responsividad Completa:** Diseño adaptable para pantallas de escritorio (recepción), tablets y móviles.
* **Componentes de Cliente Explícitos:** Todo archivo de Next.js que use hooks (`useState`, `useEffect`, `useContext`) debe incluir `'use client';` en la línea 1.

---

## 🛡️ 5. Reglas de Código y Buenas Prácticas

1. **Aislamiento Multi-Tenant Obligatorio:**
   * **NUNCA** realices consultas de lectura o escritura en `Appointment`, `Patient`, `Conversation`, `Message`, `Doctor` o `Service` sin filtrar o vincular explícitamente por `tenantId`.
2. **Manejo de Fechas y Zonas Horarias:**
   * El backend almacena las fechas en UTC (`DateTime` en Prisma).
   * Al calcular slots disponibles o mostrar fechas al paciente, utiliza siempre `America/Mexico_City` mediante `date-fns-tz`.
3. **Prevención de Colisiones en Citas:**
   * Antes de insertar una cita en base de datos, el `SchedulerService` debe verificar que no exista una cita activa (`status !== 'CANCELLED'`) con el mismo doctor que se traslape con el rango `[startTime, endTime]`. Si se detecta traslape, se debe retornar un error 400 descriptivo.
4. **Respuestas Conversacionales de IA a Prueba de Fallos:**
   * El `OmnichannelAgent` cuenta con un motor de fallback por intenciones que garantiza que frases como `"confirmo"`, `"asistencia"`, `"muchas gracias"`, `"¿a qué hora es mi cita?"` o `"¿dónde están ubicados?"` devuelvan respuestas útiles, cálidas y con contexto real sin ciclarse en el menú de bienvenida.
5. **No inventar URLs en producción:**
   * Las URLs base de API deben resolverse desde `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'`.

---

## ⚡ 6. Comandos Operativos Comunes

### Desarrollo y Ejecución
```bash
# Iniciar backend Fastify (puerto 3000)
npm run dev --workspace=@asistente/api

# Iniciar frontend Next.js (puerto 3001)
npm run dev --workspace=@asistente/web
# o en modo producción:
npm run start --workspace=@asistente/web

# Compilar todos los paquetes y apps
npm run build --workspaces --if-present
```

### Pruebas Automatizadas (QA)
```bash
# Suite unitaria del agente y normalización telefónica
npx tsx packages/ai-agent/src/test-suite.ts

# Suite de estrés de extremo a extremo (Aislamiento, colisiones, triaje, Mercado Pago, Takeover)
npx tsx packages/ai-agent/src/stress-test-suite.ts

# Pruebas de integración in-memory de la API REST y Webhooks
npx tsx apps/api/src/test-api.ts
```

### Base de Datos (Prisma)
```bash
# Generar cliente de Prisma tras editar schema.prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Abrir el visor interactivo de base de datos
npx prisma studio --schema=packages/database/prisma/schema.prisma

# Re-ejecutar el seed inicial
npx tsx packages/database/src/seed.ts
```

### Exposición de Webhooks Externos (Meta & Twilio)
```bash
# Iniciar túnel seguro hacia la API local
ngrok http 3000
```
* **URL Webhook WhatsApp (Meta):** `https://<ngrok-id>.ngrok-free.app/webhooks/meta`
* **URL Webhook Llamadas (Twilio):** `https://<ngrok-id>.ngrok-free.app/voice/incoming`
* **Token de verificación Meta:** `asistente_mexico_secret_2026`

---

## 📓 7. Protocolo Obligatorio de Bitácora y Commits

> **Esta sección es vinculante para todo agente de IA y toda persona que
> modifique este repositorio. No es opcional ni está sujeta a criterio.**

Ninguna tarea se considera terminada hasta que el cambio esté **registrado en la
bitácora** y **confirmado en un commit**. Código funcionando sin entrada en
bitácora es trabajo incompleto.

### 7.1 Ciclo de trabajo de cada cambio

1. **Implementa** el cambio y **verifícalo** (`npm run build`, `npm test`, y
   `npm run test:stress` si tocaste agente, agenda, pagos o webhooks).
2. **Escribe la entrada** en [`BITACORA.md`](BITACORA.md), **hasta arriba** (orden
   cronológico inverso), usando el formato que el propio archivo documenta.
3. **Haz el commit** con un mensaje en formato Conventional Commits (§ 7.3).
4. **Anota el hash** del commit en la entrada de la bitácora. Si prefieres
   hacerlo en un solo paso, usa `git commit --amend` inmediatamente después para
   incorporar el hash, o deja `pendiente` y complétalo en el siguiente commit.

### 7.2 Qué debe contener la entrada de bitácora

La entrada explica **por qué**, no solo qué. El diff ya dice qué líneas
cambiaron; lo que se pierde con el tiempo es la razón, la restricción que
forzó la decisión y lo que se descartó.

Secciones obligatorias: `Qué se hizo`, `Archivos tocados`, `Verificación`.
`Pendientes derivados` solo si el cambio deja deuda abierta.

Si el cambio corrige una vulnerabilidad, la entrada debe decir **cómo se
explotaba** y **por qué la corrección la cierra**.

### 7.3 Estándar de mensajes de commit (Conventional Commits)

```
tipo(alcance): descripción en imperativo y minúscula

Cuerpo opcional: el porqué del cambio, la restricción que lo forzó,
y lo que se consideró y descartó.

Refs: BITACORA.md
```

**Tipos permitidos:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`,
`build`, `ci`, `chore`, `style`, `revert`.

**Alcances sugeridos:** `agent`, `api`, `web`, `db`, `voice`, `queue`,
`payments`, `webhooks`, `auth`, `seguridad`, `deps`, `docs`.

Reglas que el hook verifica automáticamente:

* El encabezado no excede **72 caracteres**.
* La descripción no termina en punto y no empieza en mayúscula.
* Un cambio que rompe compatibilidad lleva `!` antes de los dos puntos
  (`feat(api)!: ...`) y explica la migración en el cuerpo.

Ejemplos correctos:

```
fix(agent): anclar identidad del paciente al canal autenticado
feat(payments): validar frescura de la firma de Mercado Pago
perf(api): paginar listados de citas y conversaciones
```

### 7.4 Cumplimiento automático

El hook `commit-msg` de [`.githooks/`](.githooks/commit-msg) rechaza cualquier
mensaje que no cumpla el formato. Se activa una sola vez por clon:

```bash
git config core.hooksPath .githooks
```

Para agentes: si un commit es rechazado, **corrige el mensaje**; nunca uses
`--no-verify` para saltarte la validación.

### 7.5 Alcance de un commit

Un commit = un cambio coherente. No mezcles una corrección de seguridad con un
refactor cosmético: si el cambio necesita dos entradas de bitácora distintas,
necesita dos commits.
