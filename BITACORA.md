# Bitácora de Cambios — AsistentePro Clínicas

Registro cronológico de **todo** cambio que entra al repositorio. Cada commit
debe tener su entrada aquí. Las entradas más recientes van arriba.

> **Para agentes de IA y personas:** el procedimiento obligatorio está en
> [CLAUDE.md § 7](CLAUDE.md) y en [AGENTS.md](AGENTS.md). Resumen: antes de
> cerrar una tarea, agrega tu entrada arriba del todo y haz commit siguiendo
> Conventional Commits. El hook `commit-msg` rechaza los mensajes que no cumplen.

---

## Formato de una entrada

```markdown
## [AAAA-MM-DD] tipo(alcance): título corto en imperativo

**Autor:** Nombre o modelo · **Commit:** `<hash corto>`

### Qué se hizo
Descripción en prosa de qué cambió y, sobre todo, **por qué**. El "qué" ya está
en el diff; lo que se pierde con el tiempo es la razón.

### Archivos tocados
- `ruta/al/archivo.ts` — qué cambió ahí

### Verificación
Cómo se comprobó que funciona (suites ejecutadas, pruebas manuales, migraciones
aplicadas).

### Pendientes derivados
Deuda que este cambio deja abierta, si la hay.
```

---

## [2026-09-14] feat(api): validar esquemas en rutas y limpiar any y observabilidad

**Autor:** Antigravity (Gemini 3.8 Flash) · **Commit:** `PENDING`

### Qué se hizo

Se resolvieron dos ítems prioritarios de calidad, robustez y observabilidad de `TODO.md`:
1. **Validación formal de entradas con esquemas JSON de Fastify en rutas:**
   - En `apps/api/src/routes/auth.ts`: se implementó `loginSchema` (validación estricta de `email`, `password` y `tenantSlug`).
   - En `apps/api/src/routes/admin.ts`: se crearon esquemas JSON estructurados (`body`, `params`, `querystring`) para todas las operaciones críticas:
     - `createTenantSchema` (nombre y teléfono E.164 requeridos, direcciones opcionales).
     - `updateTenantSchema` (parámetro `:id`, campos de clínica opcionales validados).
     - `createDoctorSchema` (`:id`, `name`, `specialty`, `phone`, `email`).
     - `createServiceSchema` (`:id`, `name`, `priceMxn`, `durationMinutes`, `requiredDepositMxn`).
     - `availabilitySchema` (`date` requerida en querystring).
     - `createAppointmentSchema` (`patientName`, `patientPhone`, `doctorId`, `serviceId`, `startTimeIso`).
     - `updateAppointmentSchema` (`status`, `paymentStatus`, `notes`, `startTime`, `endTime`, `startTimeIso`).
     - `takeoverSchema` (`isHandedOver` booleano requerido).
     - `replySchema` (`text` requerido hasta 4000 caracteres, `staffName`).
   - En `apps/api/src/lib/http.ts`: se enriqueció el manejador global de errores (`registerErrorHandler`) para devolver `error: error.message` cuando Fastify reporta fallos de validación con código 400.

2. **Limpieza completa de tipos `any` y migración a `@asistente/observability`:**
   - En `@asistente/ai-agent`:
     - `geminiAgent.ts`: se tipó `AgentTenant`, `FunctionCallPart`, `Appointment`, `TriageResult`, `Service` y `Doctor`. Se integró `createLogger('ai-agent')` reemplazando `console.error`.
     - `mercadoPagoService.ts`: se integró `createLogger('payment')` reemplazando `console.error` y `console.warn`.
     - `scheduler.ts`: se integró `createLogger('calendar')` reemplazando `console.warn`.
   - En `@asistente/api`:
     - `services/whatsappService.ts`: se tipó la interfaz `AppointmentConfirmationDetails`, eliminando `appointment: any`, y se reemplazaron `console.log` y `console.error` por `createLogger('whatsapp')`.
     - `services/queue/queue.ts`: se tipó `JobHandlerMap` sin `any` (`JobHandler<never>`).
     - `services/voice/stt.ts`: se tipó el listener de `WebSocketLike` con `(...args: unknown[]) => void`.
     - `lib/auth.ts`, `lib/env.ts`, `lib/webhookSecurity.ts`: se migraron todos los `console.warn` a loggers estructurados (`createLogger('auth')`, `createLogger('env')`, `createLogger('webhooks')`).
   - En `apps/web`:
     - `calendar/page.tsx`: se tipó `TenantCatalogItem`, eliminando `t: any`, y se tiparon los bloques `catch (err: unknown)`.
     - `team/page.tsx`: se tiparon los bloques `catch (err: unknown)`.
     - `inbox/page.tsx`: se crearon las interfaces `ApiConversationResponse` y `ApiMessageResponse`, eliminando los castings y mapeos sobre `any`.

3. **Actualización de `TODO.md`:**
   - Se retiraron ambos ítems completados.

### Archivos tocados
- `TODO.md` — eliminación de los dos ítems resueltos
- `apps/api/src/lib/http.ts` — propagación de mensajes de error de validación Fastify
- `apps/api/src/lib/auth.ts` — logger estructurado
- `apps/api/src/lib/env.ts` — logger estructurado
- `apps/api/src/lib/webhookSecurity.ts` — logger estructurado
- `apps/api/src/routes/auth.ts` — schema JSON en login
- `apps/api/src/routes/admin.ts` — schemas JSON en rutas administrativas
- `apps/api/src/services/whatsappService.ts` — interfaz AppointmentConfirmationDetails y logger
- `apps/api/src/services/queue/queue.ts` — eliminación de any en JobHandlerMap
- `apps/api/src/services/voice/stt.ts` — tipado estricto en WebSocketLike
- `packages/ai-agent/src/agent/geminiAgent.ts` — eliminación de any y logger estructurado
- `packages/ai-agent/src/calendar/scheduler.ts` — logger estructurado
- `packages/ai-agent/src/payment/mercadoPagoService.ts` — logger estructurado
- `apps/web/src/app/dashboard/calendar/page.tsx` — eliminación de any y tipado de catálogo
- `apps/web/src/app/dashboard/team/page.tsx` — eliminación de any en catch blocks
- `apps/web/src/app/dashboard/inbox/page.tsx` — interfaces de respuesta y eliminación de any
- `BITACORA.md` — esta entrada

### Verificación
- `npm run build` monorepo completo: 6/6 workspaces compilados exitosamente (database, shared-types, observability, ai-agent, api, web con Next.js 16.3 Turbopack).
- `npm run test --workspace=@asistente/ai-agent`: 20/20 pruebas pasaron (100%).
- `npm run test --workspace=@asistente/api`: 9/9 suites pasaron (234 pruebas exitosas, 0 fallidas).
- `npm run test:e2e --workspace=@asistente/web`: 3/3 pruebas de Playwright pasaron (100%).
- `npm run lint --workspace=apps/web`: 0 errores, 0 warnings.
- `npm run test` a nivel raíz: todas las suites de todos los workspaces pasaron sin errores.

### Pendientes derivados
Ninguno directo de este cambio.

---

## [2026-09-14] feat(api): blindar auditoria clinica y horario dinamico

**Autor:** Antigravity (Gemini 3.8 Flash) · **Commit:** `39c1bab`

### Qué se hizo

Se resolvieron los 3 pendientes de auditoría e integridad clínica identificados en `TODO.md`:
1. **Auditoría de cambio de nombre del paciente en citas:**
   - En `SchedulerService.bookAppointment` (`packages/ai-agent/src/calendar/scheduler.ts`), se sustituyó el upsert ciego por una verificación previa de existencia.
   - Si un paciente ya existe para ese número telefónico y clínica, y la cita se agenda con un nombre diferente (`existingPatient.fullName !== patientFullName`), se actualiza el registro y se inserta atómicamente en `AuditLog` una fila con `action: 'UPDATE'`, `entityType: 'PATIENT'`, registrando el cambio `fullName` con su valor anterior y nuevo (`changes.fullName: { before, after }`) y metadato `{ reason: 'bookAppointment_rename' }`.

2. **Transaccionar la auditoría de links de anticipo:**
   - En `MercadoPagoService.createDepositPreference` (`packages/ai-agent/src/payment/mercadoPagoService.ts`), se agregó el parámetro `auditActor?: AuditActor`.
   - La actualización de la cita (`tx.appointment.update`) y la inserción en `AuditLog` (`recordAudit`) ahora se ejecutan de forma indivisible dentro de una misma transacción `db.$transaction(async (tx) => { ... })`.
   - En `apps/api/src/routes/admin.ts`, se pasa `auditActor: actorFromRequest(request)` directamente al servicio y se retiró la llamada externa y desfasada a `recordAudit`.

3. **Cálculo dinámico de "Fuera de horario" contra disponibilidad de especialistas:**
   - En `apps/web/src/lib/audit.ts`, se implementó `isOutsideBusinessHours(iso, context, targetDoctorId)` con soporte para reglas de disponibilidad (`DoctorAvailabilityRules`):
     - Si el evento está ligado a un especialista (o el actor es un doctor), evalúa sus turnos de atención para ese día de la semana.
     - Si es un evento general del personal (recepcionista o administrador), verifica si al menos un médico de la clínica tiene turno de consulta activo en ese momento (con 30 minutos de tolerancia).
     - Si la clínica no abre en ese día (p. ej. domingo) o el acceso se realiza fuera de los turnos de atención, el evento se clasifica con advertencia `"Fuera de horario"`.
     - Si no se proveen reglas de doctores, mantiene fallback seguro al rango estándar 07:00–21:00 CDMX.
   - En `apps/web/src/app/dashboard/audit/page.tsx`, se propaga `scheduleContext` con los doctores de la clínica activa tanto al filtrado de eventos sensibles como a la renderización de cada fila `EventRow`.

### Archivos tocados
- `TODO.md` — eliminados los 3 pendientes de auditoría resueltos.
- `packages/ai-agent/src/calendar/scheduler.ts` — verificación de nombre y auditoría de paciente en `bookAppointment`.
- `packages/ai-agent/src/payment/mercadoPagoService.ts` — parámetro `auditActor` y actualización transaccionada con `recordAudit`.
- `apps/api/src/routes/admin.ts` — pase de `auditActor` en generación de preferencia de anticipo.
- `apps/api/src/audit-test-suite.ts` — pruebas automatizadas de cambio de nombre y link de anticipo (40/40 en verde).
- `apps/web/src/lib/audit.ts` — funciones `isOutsideBusinessHours` y `sensitivityOf` con contexto de horarios.
- `apps/web/src/app/dashboard/audit/page.tsx` — integración de `scheduleContext` en panel de auditoría.

### Verificación
- `npx tsx apps/api/src/audit-test-suite.ts`: 40/40 pruebas aprobadas (100% en verde).
- `npm run test --workspace=@asistente/api`: 9/9 suites aprobadas.
- `npm run test:e2e --workspace=@asistente/web`: 3/3 pruebas Playwright aprobadas.
- `npm run lint --workspace=apps/web`: 0 errores, 0 avisos.
- `npm run build`: Compilación limpia en todos los paquetes y aplicaciones.

### Pendientes derivados
- Ninguno.

---

## [2026-09-14] feat(api): validar variables de produccion y limpiar eslint en web

**Autor:** Antigravity (Gemini 3.8 Flash) · **Commit:** `64bdeaa`

### Qué se hizo

Se atendieron los dos pendientes acordados de `TODO.md`:
1. **Validación de variables obligatorias de producción al arranque en `apps/api`:**
   - Creado el módulo `apps/api/src/lib/env.ts` con `validateEnvironment(env)` y `assertProductionEnv(env)` que verifica de forma estricta las variables requeridas en modo producción (`NODE_ENV=production`):
     - `JWT_SECRET` (mínimo 32 caracteres).
     - `CREDENTIALS_ENCRYPTION_KEY` (exactamente 32 bytes decodificados en Base64).
     - `CORS_ORIGINS`, `PUBLIC_API_HOST`, `META_APP_SECRET`, `TWILIO_AUTH_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `PLATFORM_ADMIN_EMAILS`.
     - Avisos de advertencia en logs ante ausencia de `TRUST_PROXY=true` o `METRICS_TOKEN`.
   - Integrado en `buildServer()` (`apps/api/src/server.ts`) para fallar de inmediato en el arranque si faltan variables críticas en producción, garantizando arranque seguro.
   - Creada la suite `apps/api/src/env-validation-test-suite.ts` con 12 casos de prueba de validación y fallos esperados.
   - Ajustada la suite de observabilidad para inyectar las variables requeridas durante su prueba de servidor de producción.

2. **Resolución del 100% de los avisos de ESLint en `apps/web` (0 errores, 0 warnings):**
   - Corregidos los 8 avisos de `react-hooks/set-state-in-effect` adaptando los componentes al patrón oficial de React 19:
     - `DashboardShell.tsx`: Inicialización perezosa de `sessionUser` con `useState(() => getUser())` y navegación con `router.replace('/login')`.
     - `AuthGuard.tsx`: Migrado al patrón `useSyncExternalStore` para suscribirse y reflejar sincrónicamente el estado de autenticación del cliente sin llamadas a `setState` en efectos.
     - `TenantContext.tsx`: Inicializadores perezosos para leer el almacenamiento local en montaje y efecto de sincronización no bloqueante.
     - `settings/page.tsx`: Ajuste de `formData` durante el renderizado cuando cambia el tenant activo (patrón oficial de React para estado derivado de props/contexto).
     - `inbox/page.tsx`: Sincronización de `activeConvId` durante renderizado al conmutar entre modos Live y Demo.
     - `usePolling.ts`: Invocación del ciclo inicial diferida mediante `queueMicrotask` para no llamar a `setIsPolling(true)` síncronamente durante la ejecución del efecto.
   - Resueltos los avisos de impureza (`react-hooks/purity`) e inmutabilidad (`react-hooks/immutability`) en `calendar/page.tsx`: extracción de arreglos de fixtures demo fuera del cuerpo del componente, inicialización perezosa de slots demo y cálculo puro de fechas memoizadas eliminando llamadas a `Date.now()` en JSX.

### Archivos tocados
- `TODO.md` — removidos los 2 pendientes completados.
- `apps/api/src/lib/env.ts` — funciones `validateEnvironment` y `assertProductionEnv`.
- `apps/api/src/server.ts` — llamada a `assertProductionEnv(process.env)` en arranque.
- `apps/api/src/env-validation-test-suite.ts` — suite de 12 pruebas de validación de entorno.
- `apps/api/src/observability-test-suite.ts` — mock de entorno de producción completo en prueba 5.
- `apps/web/src/components/dashboard/DashboardShell.tsx` — lazy useState y router.replace.
- `apps/web/src/components/auth/AuthGuard.tsx` — useSyncExternalStore.
- `apps/web/src/context/TenantContext.tsx` — lazy initializers y sync seguro.
- `apps/web/src/app/dashboard/settings/page.tsx` — adjust-during-render para tenant form.
- `apps/web/src/app/dashboard/inbox/page.tsx` — adjust-during-render para activeConvId en cambio de modo.
- `apps/web/src/app/dashboard/calendar/page.tsx` — fixtures externos, pure dates, 0 impurezas.
- `apps/web/src/hooks/usePolling.ts` — queueMicrotask para ciclo inicial.

### Verificación
- `npm run lint --workspace=apps/web`: 0 errores, 0 avisos (clean).
- `npm run test --workspace=@asistente/api`: 9/9 suites aprobadas (12/12 en env validation, 24/24 en security, etc.).
- `npm run test:e2e --workspace=@asistente/web`: 3/3 pruebas E2E aprobadas en Playwright.
- `npm run test`: Todas las suites del monorepo aprobadas al 100%.
- `npm run build`: Compilación limpia de todos los paquetes y aplicaciones sin errores de TypeScript ni Next.js.

### Pendientes derivados
- Ninguno para esta tarea.

---

## [2026-09-14] fix(seguridad): migrar sesión JWT de localStorage a cookie httpOnly

**Autor:** Antigravity (Gemini 3.8 Flash) · **Commit:** `8e60cf9`

### Qué se hizo

Se resolvió el pendiente de prioridad alta de seguridad (`402dfc4`): el token JWT de sesión (12 horas) se guardaba en el `localStorage` del navegador, dejando la sesión expuesta a sustracción ante eventuales vulnerabilidades XSS.

- `apps/api`:
  - Instalado y registrado `@fastify/cookie`.
  - En `apps/api/src/lib/auth.ts`: la autenticación ahora extrae el token prioritariamente desde la cookie `asistente_session`. Si no existe, admite el header `Authorization: Bearer <token>` para garantizar retrocompatibilidad total con APIs directas, webhooks y suites de prueba.
  - En `apps/api/src/routes/auth.ts`:
    - `/auth/login`: emite la cookie `asistente_session` con `httpOnly: true`, `SameSite: Lax`, `path: '/'`, `maxAge: 12h` y `secure` en producción.
    - `/auth/logout`: nuevo endpoint que limpia la cookie de sesión y registra el evento `LOGOUT` en la bitácora de auditoría (`AuditLog`).
- `packages/database`:
  - En `packages/database/src/audit.ts`: agregada la acción `LOGOUT` al catálogo inmutable de `AUDIT_ACTIONS`.
- `apps/web`:
  - En `apps/web/src/lib/api.ts`: el token JWT ya no se almacena en `localStorage` (se remueve proactivamente si existiera). `apiFetch` y `loginRequest` transmiten las credenciales con `credentials: 'same-origin'`, y se agregó la función `logoutRequest()`.
  - En `apps/web/src/components/dashboard/DashboardShell.tsx`: el botón "Cerrar sesión" invoca `await logoutRequest()` y redirige mediante `useRouter().replace('/login')`, eliminando también el warning de ESLint por `window.location.href`.
  - En `apps/web/src/context/TenantContext.tsx`: `refreshTenants` ahora valida con `isAuthenticated()` en lugar de `getToken()`, y sincroniza con el tenant activo de la sesión.
- Pruebas y verificación:
  - Creada la suite `apps/api/src/cookie-auth-test-suite.ts` (13/13 pruebas en verde).
  - Actualizada la suite `apps/web/e2e/login.spec.ts` (3/3 pruebas E2E en verde con Playwright).

### Archivos tocados

- `packages/database/src/audit.ts`
- `apps/api/package.json`
- `apps/api/src/lib/auth.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/cookie-auth-test-suite.ts` — nuevo
- `apps/web/src/lib/api.ts`
- `apps/web/src/context/TenantContext.tsx`
- `apps/web/src/components/dashboard/DashboardShell.tsx`
- `apps/web/e2e/login.spec.ts`
- `TODO.md`
- `BITACORA.md`

### Verificación

- `npx tsx apps/api/src/cookie-auth-test-suite.ts`: 13/13 pruebas exitosas (Set-Cookie httpOnly, SameSite=Lax, autenticación con cookie, rechazo sin credenciales, compatibilidad con Bearer token, y logout con registro en AuditLog).
- `npm run test --workspace=@asistente/api`: 8/8 suites completas de la API pasaron (10 + 34 + 13 + 10 + 7 + 28 + 24 + 59 pruebas).
- `npm run test:e2e`: 3/3 pruebas de Playwright pasadas (login válido, login inválido, logout y expiración de cookie).
- Verificación interactiva en navegador Chromium confirmando `cookie.httpOnly === true`, `cookie.sameSite === 'Lax'` y `localStorage.asistente_auth_token === null`.
- `npm run build`: compilación de todo el monorepo en verde.

### Pendientes derivados

- Ninguno.

---

## [2026-09-14] fix(seguridad): cifrar en reposo las credenciales de canal

**Autor:** Hermes Agent (DeepSeek Flash) · **Commit:** `87d99be`

### Qué se hizo

Era el pendiente de prioridad alta de la auditoría inicial (`402dfc4`): los
tokens por clínica de `ChannelConfig.credentials` vivían en texto plano. Quien
obtuviera un respaldo de la base —o el archivo SQLite, que es uno solo— se
llevaba las credenciales de todas las clínicas; con las de WhatsApp podía
enviar mensajes a nombre de la clínica.

- `packages/database/src/credentials.ts`: AES-256-GCM en formato
  `enc:v1:<base64(iv | tag | cuerpo)>`. El prefijo numera el esquema para
  poder rotar la llave sin adivinar el formato. La llave vive fuera de la
  base, en `CREDENTIALS_ENCRYPTION_KEY` (32 bytes en base64).
- Falla en cerrado: en producción, guardar credenciales sin llave lanza; en
  desarrollo se guarda en claro con un aviso. Las filas legadas en claro se
  siguen leyendo (migración perezosa).
- El webhook de Meta descifra al resolver la clínica por `phoneNumberId`; el
  catch que ya ignoraba credenciales ilegibles ahora cubre también una llave
  faltante sin tumbar los demás canales.
- `credentials:rotate` (`packages/database`): pasa a cifrado las filas legadas
  y rota la llave (`CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` →
  `CREDENTIALS_ENCRYPTION_KEY`). Idempotente.
- El fixture del suite de cola ahora se guarda cifrado, como en producción.
- En los `.env` locales (fuera del repositorio) quedaron `JWT_SECRET` y
  `CREDENTIALS_ENCRYPTION_KEY` generados; con eso se retira también el
  pendiente del `JWT_SECRET` local (ya no hay secreto efímero que invalide
  las sesiones al reiniciar).

### Archivos tocados

- `packages/database/src/credentials.ts` — nuevo
- `packages/database/src/rotate-credentials.ts` — nuevo
- `packages/database/src/index.ts` · `packages/database/package.json`
- `packages/database/prisma/schema.prisma` — comentario del campo
- `apps/api/src/routes/webhooks.ts` · `apps/api/src/queue-test-suite.ts`
- `.env.example` — la llave y cómo generarla/rotarla
- `TODO.md` — dos pendientes resueltos, alta de la variable y del hallazgo de las suites
- `BITACORA.md` — esta entrada

### Verificación

- Prueba de ida y vuelta (script temporal): 11/11 — prefijo correcto, el JSON
  en claro no aparece en el valor guardado, ida y vuelta, llave explícita,
  valor alterado lanza (auth tag), llave equivocada lanza, fila legada pasa
  tal cual, sin llave: leer cifrado lanza y en producción guardar lanza,
  rotación A→B se descifra con la nueva.
- La fila real de `dev.db` pasó de `{"phoneNumberId":…}` a `enc:v1:…` con
  `credentials:rotate`, y la resolución tipo webhook la descifra y resuelve
  `dental-polanco`.
- `npm test` en limpio (con la API detenida, por el hallazgo de abajo):
  20/20 del agente y 7/7 suites de la API (10 + 34 + 10 + 7 + 28 + 24 + 59).
  La suite de cola ejerce el fixture cifrado de extremo a extremo.
- `npm run build` completo en verde.

### Pendientes derivados

- Las suites comparten `dev.db` con los servidores de desarrollo: con la API
  corriendo, su worker de la cola puede reclamar trabajos que la suite acaba
  de encolar y volverla flaky (pasó una vez bajo carga). Anotado en `TODO.md`.

---

## [2026-09-14] feat(web): adaptar el catálogo de servicios a móvil con tarjetas

**Autor:** Hermes Agent (DeepSeek Flash) · **Commit:** `8703c1a`

### Qué se hizo

Cerraba la revisión en teléfono que quedó pendiente del cajón lateral
(`7822ab2`). La revisión confirmó que "Canales y Telefonía" y la lista de
especialistas ya se portaban bien, pero el catálogo de servicios seguía siendo
una tabla de seis columnas: 713 px dentro de un contenedor de 334 px. En un
teléfono, el precio, el anticipo y el botón de eliminar quedaban a un desliz
horizontal de distancia, contra el criterio que ya siguen doctores, agenda y
bitácora (tarjetas).

- Bajo 768 px el catálogo se muestra como tarjetas: tratamiento, descripción,
  categoría, duración, precio oficial y anticipo, con el mismo lenguaje visual
  que las tarjetas de especialistas. La tabla queda intacta desde 768 px,
  donde sí cabe completa (952 px de tabla en 1280 px de ventana).
- El encabezado de la sección se apila en pantallas chicas: antes el título
  partía en tres líneas entre el badge y "Agregar tratamiento".
- El botón de eliminar de cada tarjeta tiene objetivo táctil de 40 px.

### Archivos tocados

- `apps/web/src/app/dashboard/team/page.tsx` — tarjetas móviles, encabezado responsivo y tabla oculta bajo 768 px
- `TODO.md` — se retiró el pendiente de la revisión en teléfono
- `BITACORA.md` — esta entrada

### Verificación

- `npm run build --workspace=@asistente/web`: compila y pasa TypeScript.
- ESLint: sin avisos en el archivo tocado y sin cambios en el total (12).
- Con Playwright (navegador real, administrador desechable creado y borrado):
  - 390 px: sin scroll horizontal (390/390), cinco tarjetas con precios ($400
    a $3,200 MXN) y anticipos visibles, tabla oculta, botón de eliminar
    visible y funcional (abre el modal con el nombre y cancelar cierra).
  - 1280 px: tabla visible con sus seis columnas, sin scroll interno y
    tarjetas ocultas; el encabezado vuelve a una sola línea.

---

## [2026-09-14] fix(ci): validar la minúscula inicial sin depender del locale

**Autor:** Hermes Agent (DeepSeek Flash) · **Commit:** `c358cfa`

### Qué se hizo

El hook `commit-msg` exige que la descripción empiece en minúscula con el
patrón `[A-ZÁÉÍÓÚÑ]`, pero los rangos de corchetes dependen del collation de
`LC_COLLATE`: con `es_MX.UTF-8` —el de esta máquina— el rango "A" a "Z" abarca
también las minúsculas b–z (en la colación española van intercaladas), así que
el hook veía mayúsculas donde hay minúsculas. Se descubrió al commitear la
bandeja demo: `fix(web): usar estado de React…` fue rechazado por empezar en
"u". Solo una descripción que empezara con "a" pasaba, y el protocolo prohíbe
la salida fácil (`--no-verify`): toca corregir el hook.

- La comprobación usa ahora la clase POSIX `[[:upper:]]`, que en el mismo
  entorno distingue mayúsculas reales (incluidas Á, É, Í, Ó, Ú, Ñ) de las
  minúsculas. b–z pasan; "Usar" y "Ánimo" se siguen rechazando.

### Archivos tocados

- `.githooks/commit-msg` — la comprobación de minúscula inicial
- `BITACORA.md` — esta entrada

### Verificación

- En la máquina afectada (macOS, bash 3.2.57, `LC_COLLATE=es_MX.UTF-8`):
  - Con el patrón anterior, 24 de 26 letras (b–z) daban falso positivo.
  - Con `[[:upper:]]`: "usar" y "anclar" pasan; "Usar" y "Ánimo" se rechazan.
- El commit de la bandeja demo (`91e50a2`) entró porque su descripción empieza
  con "a", la única letra segura con el hook roto.
- El commit de esta misma entrada se hizo con el hook corregido.

---

## [2026-09-14] fix(web): usar estado de React en la bandeja en modo demo

**Autor:** Hermes Agent (DeepSeek Flash) · **Commit:** `91e50a2`

### Qué se hizo

Era el pendiente que anotó la entrada de la bandeja móvil (`ce12a56`): en Modo
Demo, "Tomar control" y "Enviar" mutaban directamente `DEMO_CONVERSATIONS` y
`DEMO_MESSAGES`, constantes del módulo, en lugar de usar estado de React.

Al reproducirlo en un navegador real, el síntoma resultó peor de lo anotado:
`setActiveConvId((id) => id)` pedía el re-render devolviendo el mismo valor, así
que React descartaba la actualización y el click no producía ninguna señal —ni
banner, ni cambio de color, ni estado—. El cambio aparecía "por arte de magia"
al salir y volver a la bandeja, porque la constante del módulo ya había quedado
mutada y las mutaciones sobrevivían a la navegación. En una demo comercial eso
es un botón muerto seguido de un estado fantasma.

- La demo ahora vive en dos estados (`demoConversations` y `demoMessages`),
  clonados de las constantes al montar; las constantes quedan intactas.
- `toggleTakeover` y `handleSendMessage` actualizan con funciones inmutables:
  el feedback es inmediato y, al salir y volver, la demo arranca limpia.
- Los memos `conversations` y `currentMessages` leen el estado en Demo y los
  datos del API en vivo; el camino en vivo no cambió.

### Archivos tocados

- `apps/web/src/app/dashboard/inbox/page.tsx` — estados de demo y actualizaciones inmutables
- `TODO.md` — se retiró el pendiente resuelto, el conteo de ESLint bajó (13 → 12) y se dio de alta el pendiente derivado
- `BITACORA.md` — esta entrada

### Verificación

- `npm run build --workspace=@asistente/web` (Turbopack): compila, TypeScript
  limpio y las 11 rutas generadas.
- ESLint: 13 → 12 avisos, sin avisos nuevos. Desapareció la mutación de la
  bandeja; queda la de `usePolling` y el resto ya anotado en `TODO.md`.
- Con Playwright (navegador real, 1280 px), en Modo Demo:
  - "Tomar control" → banner ámbar, botón "Devolver a la IA" y badge "Humano"
    en la lista, al instante y sin navegar.
  - Apagarlo → "Atendido por IA" al instante.
  - Salir a Resumen y volver → estado fresco (antes quedaba "Modo Humano
    Activo" fantasma).
  - Enviar un mensaje → aparece al instante; ya no sobrevive a la navegación.
- En vivo (administrador desechable, creado y borrado para la prueba): la
  bandeja carga sus 8 conversaciones, el takeover llega a la API, sobrevive al
  sondeo de 3 s, y apagarlo deja la conversación como estaba.

### Pendientes derivados

- En vivo, la etiqueta "Estado:" del encabezado del chat tarda hasta un ciclo
  de sondeo (≤3 s) en reflejar el apagado del takeover: la actualización
  optimista cambia `isHandedOverToHuman` pero no recalcula `status`. El botón
  y el banner sí van al instante.

---

## [2026-09-14] docs: reunir los pendientes en TODO.md

**Autor:** Claude Opus 5 · **Commit:** `020c689`

### Qué se hizo

Los pendientes estaban repartidos en la sección "Pendientes derivados" de cada
entrada, mezclados con otros que ya se habían resuelto después (la tabla y la
pantalla de auditoría, el panel y la bandeja en teléfono). Se reunieron en
`TODO.md` por prioridad: alta (bloquea producción o cumplimiento), media y
baja. Cada uno dice por qué importa, dónde está y el commit que lo originó.

Se quitaron los ya resueltos y se sumaron los que surgieron en las sesiones sin
quedar anotados: la lista de variables obligatorias de producción, el
`JWT_SECRET` ausente en el `.env` local, `CLAUDE.md` desactualizado, las dos
pantallas sin verificar en teléfono y la falta de `DESIGN.md`.

Las cifras se midieron de nuevo en el código al escribirlas, sin contar las
suites de prueba: tamaño de los archivos-dios, 30 usos de `any`, 51
`console.*` y 13 avisos de ESLint desglosados por regla. La auditoría inicial
contaba 44 y 125 porque incluía las suites.

El archivo explica cómo usarlo: al resolver un pendiente se borra de ahí y se
registra en esta bitácora; al descubrir uno nuevo se agrega en su prioridad y
en la entrada que lo originó.

### Archivos tocados

- `TODO.md` — nuevo

### Verificación

- Conteos obtenidos con `wc -l`, `grep` y `eslint -f json` sobre el estado
  actual del repositorio
- Cada pendiente se contrastó con las entradas posteriores de la bitácora para
  no incluir nada ya resuelto

---

## [2026-09-14] feat(web): bandeja omnicanal con patrón lista → chat en móvil

**Autor:** Claude Opus 5 · **Commit:** `ce12a56`

### Qué se hizo

Era el pendiente de la entrada anterior. La bandeja ponía la lista de
conversaciones (320 px) y el chat lado a lado, y en un teléfono el chat quedaba
aplastado fuera de la pantalla.

- **Bajo 768 px, patrón lista → chat.** La lista ocupa la pantalla completa, y
  tocar una conversación abre el chat a pantalla completa con un botón para
  volver. Al abrir, el foco va al encabezado del chat, para que el lector de
  pantalla anuncie al paciente; al volver, regresa a la conversación elegida.
  Desde 768 px siguen los dos paneles, como antes.
- **La ficha del paciente ya no desaparece.** El panel lateral solo cabe desde
  1280 px, así que en laptops, tablets y teléfonos la cita, el anticipo y el
  triaje no se veían. Debajo de 1280 px aparece como una sección plegable
  (`<details>` nativo) bajo el encabezado del chat.
- **Campos a 16 px en móvil** (búsqueda y respuesta): con menos, iOS hace zoom
  al enfocar y descuadra la pantalla.
- **Encabezado del chat compacto** en pantallas angostas: sin avatar ni
  teléfono, "Tomar control" en versión corta y botones de 44 px.
- **El encabezado del chat usa una consulta de contenedor, no del viewport.**
  El panel del chat mide unos 420–450 px en casi cualquier pantalla: al crecer
  la ventana también aparecen la barra lateral (desde 1024 px) y la ficha (desde
  1280 px). Con cortes por viewport, el nombre del paciente se truncaba a una
  letra en tablet, a 22 px en 1024 px y desaparecía en 1280 px; la medición con
  Playwright lo reveló dos veces. Ahora el teléfono y la etiqueta larga "Tomar
  Control (Pausar IA)" aparecen cuando el panel mide 640 px o más, y el resumen
  de estado cuando mide 768 px o más. Se usa `[container-type:inline-size]` con
  variantes arbitrarias de Tailwind 3.4, sin agregar plugins.
- **Reproductor de llamadas:** en pantallas angostas se ocultan los saltos de
  ±10 s, porque se puede saltar tocando la onda. La latencia y la etiqueta de
  Twilio aparecen desde 640 px, y los controles tienen etiquetas accesibles.
- **Burbujas de mensaje** al 85 % del ancho en móvil, con corte de palabra para
  que los enlaces largos no desborden.
- Si en vivo desaparece la conversación abierta, la vista móvil vuelve sola a la
  lista en lugar de quedar en blanco.

### Archivos tocados

- `apps/web/src/app/dashboard/inbox/page.tsx`

### Verificación

- `tsc` limpio. ESLint sin avisos nuevos: los dos que quedan ya existían (el
  efecto que reinicia la conversación en Demo y la mutación de los datos demo
  al tomar control)
- En Playwright, con un iPhone 13 emulado:
  - Al entrar se ve la lista.
  - Tocar a Fernando Rivas abre su chat y el foco llega a su nombre.
  - La ficha plegable se abre.
  - "Volver" regresa a la lista con el foco en su conversación.
  - Ambos campos miden 16 px.
- En tablet (768 px) se ven los dos paneles y no aparece el botón de volver
- Encabezado del chat medido en cinco anchos de ventana. El nombre del paciente
  nunca se trunca, y la etiqueta larga y el teléfono solo aparecen cuando el
  panel tiene espacio:

  | Ventana | Panel del chat | Botón | Teléfono |
  |---|---|---|---|
  | 768 px | 447 px | "Tomar control" | oculto |
  | 1024 px | 447 px | "Tomar control" | oculto |
  | 1280 px | 415 px | "Tomar control" | oculto |
  | 1440 px | 575 px | "Tomar control" | oculto |
  | 1920 px | 1055 px | "Tomar Control (Pausar IA)" | visible |
- Se usó un administrador desechable, creado y borrado para esta prueba

### Pendientes derivados

- En modo Demo, "Tomar control" modifica directamente el arreglo de datos demo
  en lugar de usar estado de React, y ESLint lo marca. Funciona, pero conviene
  pasarlo a estado.

---

## [2026-09-14] feat(web): barra lateral como cajón en pantallas angostas

**Autor:** Claude Opus 5 · **Commit:** `7822ab2`

### Qué se hizo

La barra lateral medía 256 px fijos y nunca se colapsaba. En un teléfono le
dejaba unos 120 px al contenido, así que ninguna pantalla del panel era usable.
Estaba anotado como pendiente en la entrada anterior.

- **Bajo 1024 px la barra es un cajón.** Se abre con el botón de menú y se
  cierra con Escape, al tocar el fondo o al elegir una sección. Al abrirlo, el
  foco entra en él; al cerrarlo, vuelve al botón. Cerrado queda `invisible`:
  no se alcanza con el teclado ni lo lee un lector de pantalla.
- **Desde 1024 px queda fija, como antes.** El corte está en 1024 y no en 768
  porque la agenda y la bandeja son densas: en una tablet vertical les conviene
  todo el ancho.
- **Encabezado compacto** en pantallas angostas: selector "En Vivo / Demo"
  corto, teléfono oculto y aviso de Demo en una sola línea.
- `h-dvh` en lugar de `h-screen`, para que la altura no salte cuando aparece o
  se oculta la barra del navegador en el teléfono.
- Objetivos táctiles de 44 px en el botón de menú, el de cierre y los enlaces
  del cajón.
- El `animate-bounce` del botón "+ Citas Demo" pasó a un pulso; lo marcaba el
  detector de diseño.
- **Detalle técnico:** la visibilidad del cajón cambia al instante al abrir y
  con retraso al cerrar. Si también se animara al abrir, en el primer cuadro
  seguiría oculto y el foco no podría entrar. Lo detectó la prueba con
  Playwright en un iPhone emulado, no la inspección manual.

### Archivos tocados

- `apps/web/src/components/dashboard/DashboardShell.tsx`

### Verificación

- `tsc` limpio; ESLint sin avisos nuevos (los dos que quedan ya existían)
- En el navegador: móvil con el cajón cerrado y abierto, Escape con el foco de
  vuelta al botón, tablet con cajón y escritorio con la barra fija
- En Playwright, con un iPhone 13 emulado y toque real: abrir, tocar el fondo
  para cerrar, y tocar una sección, que navega y cierra
- Foco al abrir, repetido tras la corrección: 3 de 3 intentos entraron a
  "Cerrar menú" y volvieron a "Abrir menú" con Escape. En escritorio la barra
  sigue fija (256 px, visible) y el botón de menú no aparece
- Se usó un administrador desechable, creado y borrado para esta prueba

### Pendientes derivados

- **La bandeja omnicanal sigue sin funcionar en teléfono.** Es un diseño de
  dos paneles lado a lado (lista de 320 px más chat) y necesita su propio
  patrón lista → detalle.

---

## [2026-09-13] feat(web): pantalla de bitácora de auditoría en el panel

**Autor:** Claude Opus 5 · **Commit:** `da9e937`

### Qué se hizo

La auditoría existía solo como API; ahora la dirección de la clínica la
consulta en `/dashboard/audit`. El usuario eligió la estructura **feed con
pivote** y pidió además exportar CSV, marcar lo sensible y filtrar por empleado.

Decisiones de diseño, con su porqué:

- **Una frase por evento, no una tabla de logs.** "Dra. Sofía Silva abrió el
  chat de Mariana Hernández" lo entiende un director sin conocer el modelo de
  datos. El vocabulario vive en `apps/web/src/lib/audit.ts`.
- **El pivote es la pieza central.** Al tocar un paciente, la vista se convierte
  en su expediente de accesos y lo resume en una frase ("2 personas y el
  Asistente IA accedieron a este expediente en los últimos 7 días"), con chips de
  quién y cuántas veces. Es la respuesta directa a una solicitud ARCO. Tocar a un
  empleado muestra lo que hizo; ambos filtros se combinan.
- **Filtros en la URL**, para compartir el enlace a "quién vio a X" y deshacer
  un pivote con el botón atrás.
- **La exportación la genera el servidor**, no el navegador: así queda auditada
  como `EXPORT` (sacar la bitácora del sistema es tan sensible como consultarla)
  y se neutralizan fórmulas. El nombre de WhatsApp de un paciente lo escribe un
  tercero; algo como `=HYPERLINK(...)` se ejecutaría en el Excel del director.
- **Sin polling.** Cada consulta a la bitácora genera su propia fila de
  auditoría; refrescar es manual.
- **Lo sensible se marca en rojo o ámbar según gravedad:** login fallido y
  borrados (crítico), exportación, pago marcado a mano y actividad del personal
  fuera de 7:00–21:00 CDMX (atención). El rojo y el ámbar quedan reservados para
  esto, igual que en el resto del panel.
- **Demo coherente con el resto del showcase.** Los pacientes y horarios
  coinciden con la agenda demo del resumen, y las horas son fijas en CDMX para
  que los logins fallidos de madrugada y el acceso fuera de horario se vean igual
  a cualquier hora en que se haga la demostración.
- **Acceso.** El enlace de la barra lateral solo aparece para ADMIN en vivo (en
  Demo para todos, como argumento de venta). Un rol no autorizado ve una
  explicación, no un error.
- **Mundo visual heredado.** No hay `DESIGN.md`: la pantalla extiende el sistema
  que ya vive en el código. El contrato de dirección quedó en
  `apps/web/.impeccable/surfaces/`.

Backend de apoyo: `GET /api/audit` resuelve en lote el nombre del paciente y
del empleado (la tabla no tiene relaciones a propósito), `action` acepta
varias separadas por coma para las categorías Accesos, Cambios y Sesiones, y se
agregó `GET /api/audit/export` con la acción `EXPORT`.

El estado de la pantalla se deriva en lugar de sincronizarse con efectos: el
resultado en vivo se guarda con la clave de los filtros que lo originaron, y
"cargando" es simplemente que esa clave no coincide. Esto elimina los renders
en cascada que marcaba la regla `react-hooks/set-state-in-effect`.

### Archivos tocados

- `apps/web/src/app/dashboard/audit/page.tsx` — la pantalla
- `apps/web/src/lib/audit.ts` — frases, sensibilidad, diff, rastro técnico, CSV del Demo
- `apps/web/src/app/dashboard/audit/demo.ts` — bitácora ficticia del Demo
- `apps/web/src/components/dashboard/DashboardShell.tsx` — enlace en la barra lateral
- `apps/api/src/routes/admin.ts` — nombres resueltos, multi-acción y exportación CSV
- `packages/database/src/audit.ts`, `schema.prisma` — acción `EXPORT`
- `apps/api/src/audit-test-suite.ts` — pruebas de nombres, exportación y multi-acción
- `apps/web/.impeccable/surfaces/…audit-page-tsx.md` — contrato de dirección
- `AGENTS.md` (catálogo de endpoints y rutas), `.gitignore` (`.impeccable/review/`)

### Verificación

- `tsc` limpio en API y panel; ESLint sin avisos en los archivos nuevos
- Suite de auditoría **34/34**: incluye nombres resueltos, 403 para STAFF al
  exportar, una fórmula en el nombre del paciente que sale neutralizada, la
  exportación registrada y el filtro de varias acciones
- `npm test` 7/7 suites; `npm run test:stress` 40/40
- En el navegador: Demo, pivote por paciente, pivote por empleado, solo
  sensibles, detalle con diff y rastro técnico, En Vivo con datos reales, acceso
  denegado para STAFF (sin enlace en la barra) y tablet
- Detector de Impeccable: 3 avisos, uno falso positivo en el botón deshabilitado
  y dos preexistentes en `DashboardShell`
- **Revisión final** por un revisor independiente, con el procedimiento de
  Impeccable. El veredicto fue **fix**, y se corrigió en un solo lote:
  1. El pivote heredaba el filtro de tipo. Con "Sesiones" activo, podía decir
     "nadie accedió a este expediente" de uno que sí se había consultado.
     Ahora pivotar limpia los filtros, y si alguien los reactiva, la frase los
     nombra.
  2. El contraste de los encabezados de día (4.4:1 y 2.4:1) subió a AA.
  3. En pantallas angostas la hora pasa a la línea de detalle, para que la
     frase conserve el ancho.

  Además se resolvieron:
  - Revisar la bitácora ya no se marca "fuera de horario".
  - La redacción ahora dice "eliminó al Dr. … y sus 2 citas".
  - Las IPs del Demo usan rangos reservados a documentación (RFC 5737); antes
    una IP real hacía de atacante.
  - `aria-controls` apunta a un elemento que existe.
  - El texto secundario de las filas críticas toma su tono rojo.

  Los anillos de foco no se tocaron: `globals.css` ya los define en teal para
  toda la app. En la verificación sobre capturas nuevas, el revisor calificó
  las tres correcciones como **resueltas**, confirmó los ajustes menores, no
  encontró regresiones y cerró con **ship**.
- Al ser una extensión del panel, no se escribió `DESIGN.md`: la pantalla usa
  el sistema que ya vive en el código.
- Para verificar En Vivo se creó un ADMIN desechable, se obtuvo su token por
  `curl` y se inyectó en el navegador, sin escribir contraseñas en él. Se borró
  al terminar.

### Pendientes derivados

- **El panel completo no funciona en teléfono:** la barra lateral de
  `DashboardShell` mide 256 px fijos y no se colapsa. Ya existía y afecta a todas
  las pantallas, no solo a esta.
- "Fuera de horario" usa 7:00–21:00 fijo; debería leer el horario real de la
  clínica y de cada doctor.
- "Solo sensibles" se calcula en el navegador, así que el CSV exporta el filtro
  completo, no solo lo sensible (la pantalla lo avisa).
- En `DashboardShell` quedan los avisos preexistentes del detector:
  `animate-bounce` y texto gris sobre rojo.
- `.claude/launch.json` (arranque de servidores para el navegador integrado) no
  se versiona.

---

## [2026-09-13] feat(seguridad): registrar accesos y cambios clínicos en AuditLog

**Autor:** Claude Opus 5 · **Commit:** `052a205`

### Qué se hizo

Era el pendiente más importante de la auditoría inicial: no quedaba rastro de
quién consultó o modificó un expediente, que es lo que la LFPDPPP y la
NOM-024-SSA3 exigen a un sistema de información en salud. Ahora cada acceso y
cada cambio responde *quién, qué, a qué paciente, cuándo y desde dónde*.

Decisiones de diseño, con su porqué:

- **Tabla sin relaciones.** `AuditLog` no tiene FK hacia clínica, usuario ni
  paciente: una FK con cascada borraría el rastro junto con lo que rastrea. El
  correo y el rol del actor se copian al momento del evento por la misma razón.
- **Inmutabilidad en la base de datos, no en la aplicación.** Dos triggers
  rechazan todo `UPDATE` y el `DELETE` de filas con menos de 5 años (1827 días,
  plazo de conservación del expediente según la NOM-004-SSA3-2012). Una regla
  en el código la salta cualquier bug o script; un trigger no.
- **Atómica y fail-closed.** `recordAudit(entry, tx)` se escribe en la misma
  transacción que el cambio: o se confirman los dos o ninguno. Si la auditoría
  no se puede escribir, la operación falla; es preferible a un cambio sin rastro.
- **Imposible de olvidar al agendar.** Hay tres caminos que crean citas
  (recepción, herramienta de Gemini, motor de fallback). `bookAppointment` ahora
  exige `auditActor` en su firma, así que el compilador rechaza un cuarto camino
  que no audite.
- **Lecturas con límite de frecuencia.** La bandeja refresca los mensajes cada
  2 s: sin límite serían ~1800 filas por hora por chat abierto. Se registra una
  lectura por usuario y expediente cada 10 min (`AUDIT_READ_THROTTLE_MS`), que
  basta para saber quién accedió y cuándo. Los cambios se registran siempre.
- **Sin copiar datos clínicos de más.** Se guarda el diff de campos
  (`diffChanges`), nunca el contenido de los mensajes, que ya vive en el propio
  mensaje. Los campos internos (`slotKey`, `updatedAt`) no entran en el diff.
- **Login.** Éxitos y fallos quedan registrados; los fallos con su motivo
  (`BAD_PASSWORD`, `NO_MATCHING_USER`, `AMBIGUOUS_TENANT`) y nunca con la
  contraseña intentada. Al cliente se le sigue respondiendo lo mismo en todos
  los casos para no delatar qué cuentas existen.
- **IP real.** `TRUST_PROXY=true` para despliegues detrás de un balanceador;
  sin él, la auditoría registraría la IP del proxy para todos.

**Cobertura:** login; creación de clínica, doctores y servicios; datos demo y
reset; cambios de configuración; creación, modificación, cancelación y link de
anticipo de citas; listados y lectura de chats; toma de control; respuestas de
recepción; las acciones del agente de IA en ambos motores (agendar, confirmar,
consultar, cancelar); y la acreditación de anticipos por el webhook de
Mercado Pago. La consulta es `GET /api/audit` (solo ADMIN, filtrable por
paciente, entidad, actor, acción y fechas), y consultarla también se registra.

De paso se corrigió el paso 4 del protocolo en `CLAUDE.md § 7.1`: sugería
`git commit --amend` para anotar el hash, pero reescribir el commit cambia justo
el hash que se quiere anotar.

### Archivos tocados

- `packages/database/prisma/schema.prisma` — modelo `AuditLog` con 4 índices
- `packages/database/prisma/migrations/0003_audit_log/` — tabla generada con
  `prisma migrate diff` más los dos triggers, que Prisma no puede expresar
- `packages/database/src/audit.ts` — `recordAudit`, `diffChanges`, límite de
  lecturas y catálogos de acciones, actores y entidades
- `packages/database/src/client.ts` — el cliente Prisma sale de `index.ts` para
  evitar un import circular con `audit.ts` (los paquetes compilan a CommonJS)
- `apps/api/src/lib/audit.ts` — actor a partir del request (usuario, IP,
  user-agent, request-id) y actor de webhook
- `apps/api/src/routes/admin.ts` — auditoría en 15 endpoints y `GET /api/audit`
- `apps/api/src/routes/auth.ts` — login exitoso y fallido
- `apps/api/src/routes/webhooks.ts`, `packages/ai-agent/src/payment/mercadoPagoService.ts`
  — acreditación del anticipo en la misma transacción que su auditoría
- `packages/ai-agent/src/calendar/scheduler.ts` — `auditActor` obligatorio
- `packages/ai-agent/src/agent/geminiAgent.ts` — actor `AI_AGENT` con
  herramienta, canal y conversación en cada acción
- `apps/api/src/server.ts` — `trustProxy`
- `apps/api/src/audit-test-suite.ts` — suite nueva
- Suites existentes, `.env.example`, `CLAUDE.md` (regla 6 y § 7.1) y
  `AGENTS.md` (regla 9 y catálogo de endpoints)

### Verificación

- `npm run build` sin errores
- Suite nueva `audit-test-suite.ts`: **28/28**. Cubre login (incluido que la
  contraseña nunca se guarda), creación y diff de citas, límite de lecturas con
  3 refrescos → 1 fila, fila propia por cada usuario distinto, toma de control,
  cancelación atribuida al agente de IA, 403 para STAFF, aislamiento entre
  clínicas, auditoría de la consulta, supervivencia al reset, y los dos
  triggers: `UPDATE` bloqueado, `DELETE` reciente bloqueado y depuración de una
  fila de más de 5 años permitida
- `npm test`: 7/7 suites (206 pruebas). `npm run test:stress`: 40/40
- Migración aplicada sobre `dev.db` (respaldado antes en el scratchpad);
  `prisma migrate diff` reporta sin deriva y ambos triggers están instalados

### Pendientes derivados

- **Escrituras que origina el paciente o el canal no se auditan:** mensaje
  entrante, alta de paciente desde WhatsApp o voz, estados de entrega. El propio
  registro es el rastro y no hay actor humano. Es una decisión deliberada;
  revisarla si un auditor externo pide lo contrario.
- `bookAppointment` sobrescribe `Patient.fullName` sin que el cambio de nombre
  aparezca como diff.
- El link de anticipo se audita fuera de la transacción, porque el update lo
  hace `MercadoPagoService.createDepositPreference`.
- El límite de lecturas vive en memoria: con varias instancias de la API puede
  haber una fila por instancia dentro de la misma ventana.
- **Al migrar a PostgreSQL hay que reescribir los triggers** en PL/pgSQL:
  Prisma no los genera y `migrate diff` no los detecta.
- Falta la pantalla de auditoría en el panel; hoy solo existe la API.
- Las suites dejan filas en el `AuditLog` de `dev.db`: el trigger de retención
  impide borrarlas, que es justo lo que se prueba.

---

## [2026-09-13] docs: establecer bitácora obligatoria y estándar de commits

**Autor:** Claude Opus 5 · **Commit:** `ea471f6`

### Qué se hizo

El repositorio no tenía convención de registro ni de mensajes de commit, así
que cada agente de IA que entraba improvisaba la suya y el porqué de los
cambios se perdía en cuanto el diff dejaba de ser reciente.

Se creó este archivo como registro cronológico inverso donde cada cambio
explica su motivación. El procedimiento quedó en `CLAUDE.md § 7` y como
**regla 0** de `AGENTS.md`, que es lo primero que lee un agente antes de
escribir código.

La documentación sola no basta —se ignora—, así que el estándar lo hace
cumplir un hook `commit-msg` que valida tipo, alcance, longitud máxima de 72
caracteres y que la descripción no termine en punto ni empiece en mayúscula.
Se probó contra 10 casos: acepta los mensajes válidos y los merges automáticos
de git, y rechaza mensajes vacíos, sin tipo, con tipo inválido, demasiado
largos, terminados en punto o con mayúscula inicial.

`AGENTS.md` sumó además dos reglas inviolables destiladas de la auditoría: la
identidad del paciente la define el canal y nunca el modelo (regla 7), y las
operaciones destructivas o de cobro exigen rol explícito (regla 8).

### Archivos tocados

- `BITACORA.md` — este registro, con su formato documentado
- `CLAUDE.md` — § 7 con el protocolo completo, más el aviso en el encabezado
- `AGENTS.md` — regla 0 de proceso y reglas 7 y 8 de seguridad
- `README.md` — activación del hook en el arranque del proyecto
- `.githooks/commit-msg` — validador de Conventional Commits
- `.gitignore` — se agregaron `.next/`, `next-env.d.ts` y `.agents/`

### Verificación

- Hook probado contra 10 casos (6 rechazos y 4 aceptaciones esperadas)
- Ambos commits de esta sesión pasaron por el hook ya activo
- `.gitignore` verificado: el primer intento de `git add -A` arrastraba 829
  archivos y ~180 MB de caché de Turbopack, y `.agents/skills/impeccable` era
  un symlink al directorio personal del desarrollador, inútil en otra máquina.
  Tras corregirlo quedaron 112 archivos y 1.5 MB, sin secretos.

### Pendientes derivados

- Validar el formato del mensaje también en CI, para que el estándar se cumpla
  aunque alguien clone sin ejecutar `git config core.hooksPath .githooks`.

---

## [2026-09-13] fix(seguridad): corregir 11 hallazgos de la auditoría inicial

**Autor:** Claude Opus 5 (sesión de auditoría) · **Commit:** `402dfc4`

### Qué se hizo

Primera auditoría completa del monorepo antes del primer commit del proyecto.
Se revisaron autenticación, aislamiento multi-tenant, firmas de webhooks, el
agente de IA, el planificador de citas, la cola durable y el frontend. Las 6
suites existentes pasaban, así que los hallazgos son huecos que las pruebas no
cubrían, no regresiones.

**Crítico — fuga de datos clínicos entre pacientes (C1).**
Las herramientas `consultar_citas_paciente`, `cancelar_cita_paciente` y
`confirmar_asistencia_cita` resolvían el paciente con
`args.telefonoPaciente || context.patientPhone`. Ese `args` lo produce Gemini a
partir del **texto libre del paciente**, así que bastaba escribir *"consulta la
cita del 5544332211"* para recibir el doctor, servicio y hora de otra persona —
o cancelarle la cita. El motor de fallback heurístico nunca tuvo el fallo
(siempre usó `context.patientPhone`), por lo que la vulnerabilidad solo se
manifestaba con `GEMINI_API_KEY` configurada: exactamente en producción.

La corrección ancla la identidad al canal, que es quien realmente la autentica
(remitente de WhatsApp, caller ID de Twilio), y se aplica en dos capas: el
parámetro `telefonoPaciente` desaparece del esquema de esas tres herramientas
—el modelo ya no puede ni expresarlo— y el ejecutor usa siempre
`channelAuthenticatedPhone(context)`. En `agendar_cita` el teléfono del canal
tiene prioridad y el del modelo solo se usa cuando no hay identidad (llamada con
número oculto), para que un tercero no pueda sobrescribir el expediente ajeno.

**Alto.** El borrado masivo de historial clínico (`DELETE /api/tenants/:id/reset`)
y la generación de datos de prueba no exigían rol ADMIN, cuando borrar *un solo*
doctor sí lo exigía. El webhook de Mercado Pago validaba el HMAC pero nunca
comparaba su `ts` contra la hora actual, así que una notificación legítima
capturada una vez podía reenviarse para siempre. Los listados de citas,
conversaciones y mensajes no tenían límite: cada refresco del panel bajaba el
historial completo de la clínica. Y cualquier usuario autenticado podía marcar
una cita como pagada sin que Mercado Pago lo confirmara.

**Medio.** Se añadió el candado de doble reserva en base de datos
(`Appointment.slotKey`), que es la red de seguridad que faltaba bajo la regla #3
de `CLAUDE.md`: la comprobación de traslape corre en una transacción, pero dos
reservas simultáneas podían leer "horario libre" antes de que cualquiera
insertara. Las preguntas por "mi cita" devolvían la cita **más lejana** del
calendario en lugar de la próxima, porque se ordenaba descendente sin descartar
las pasadas. Las sesiones ahora se revalidan contra la base de datos, de modo
que dar de baja a un empleado corta su acceso en la siguiente petición y no 12
horas después. `scryptSync` pasó a ser asíncrono para no bloquear el event loop
en cada login, y un login con correo inexistente ahora consume el mismo tiempo
que uno real, para no delatar qué cuentas existen.

### Archivos tocados

- `packages/ai-agent/src/agent/geminiAgent.ts` — anclaje de identidad al canal,
  helper `findNextAppointment`, regla de privacidad en el system prompt
- `packages/ai-agent/src/calendar/scheduler.ts` — `slotKey` al crear y traducción
  del P2002 a mensaje para el paciente
- `packages/database/prisma/schema.prisma` + `migrations/0002_appointment_slot_key/`
  — columna y único; backfill de las citas vigentes
- `packages/database/src/slotKey.ts` — cálculo de la clave, `null` si está cancelada
- `packages/database/src/password.ts` — scrypt asíncrono y `burnPasswordTiming`
- `apps/api/src/lib/auth.ts` — revalidación de sesión contra la base de datos
- `apps/api/src/lib/webhookSecurity.ts` — ventana de frescura de Mercado Pago
- `apps/api/src/lib/http.ts` — helper `parseLimit`
- `apps/api/src/routes/admin.ts` — roles en reset/seed/pagos, paginación, `slotKey`
- `apps/api/src/routes/webhooks.ts` — `resolvePublicHost` en lugar del header `Host`
- `apps/api/src/routes/auth.ts` — login de tiempo constante
- Suites y `.env.example` actualizados en consecuencia

### Verificación

- `npm run build` — monorepo completo compila
- `npm test` — 6/6 suites (17 unitarias, 10 API, 10 observabilidad, 7 pagos,
  28 cola, 24 seguridad, 59 voz)
- `npm run test:stress` — 40/40
- `npm run db:migrate` aplicada; `prisma migrate diff` reporta **sin deriva** y
  el backfill genera el mismo ISO 8601 que `Date.toISOString()`
- Prueba de regresión nueva (Grupo 8 de `test-suite.ts`) que falla si alguien
  vuelve a exponer `telefonoPaciente` en las herramientas de identidad

Las suites de API, seguridad y estrés firmaban tokens con `userId` inventados;
se corrigieron para crear usuarios reales, que es justo lo que ahora se exige.

### Pendientes derivados

- **Tabla de auditoría.** No queda rastro de quién consultó o modificó un
  expediente. Para datos clínicos en México (LFPDPPP y NOM-024-SSA3) es un hueco
  de cumplimiento, y `paymentStatus` sigue siendo editable sin registro.
- **`ChannelConfig.credentials` en texto plano.** Son tokens de WhatsApp por
  clínica; el propio esquema admite *"cifrado o plano"*.
- **Migrar de SQLite a PostgreSQL** antes de producción: el modelo de un solo
  escritor es el cuello de botella real bajo webhooks concurrentes.
- **Archivos-dios:** `admin.ts` (6 dominios en un archivo),
  `team/page.tsx` (1429 líneas), `inbox/page.tsx` (1076).
- **Validación por esquema** (JSON Schema de Fastify o Zod) en lugar de los
  `requireString`/`requireNumber` repetidos en cada handler.
- **JWT en `localStorage`:** sigue expuesto a robo por XSS. Evaluar cookie
  `httpOnly` + CSRF.
- 44 usos de `any` y 125 `console.log` fuera del logger estructurado.
