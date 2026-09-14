# Pendientes — AsistentePro Clínicas

Lista viva de lo que falta. Cada pendiente dice por qué importa, dónde está y de
qué cambio salió (el hash lleva a su entrada en [`BITACORA.md`](BITACORA.md)).

**Cómo usarla**

- Al **resolver** un pendiente, bórralo de aquí y regístralo en la bitácora como
  cualquier otro cambio ([CLAUDE.md § 7](CLAUDE.md)). El historial queda en git y
  en la bitácora; aquí solo vive lo abierto.
- Al **descubrir** uno nuevo, agrégalo en su prioridad y también en "Pendientes
  derivados" de la entrada de bitácora que lo originó.
- **Prioridad:** *Alta* bloquea producción o cumplimiento; *Media* es deuda con
  riesgo real; *Baja* es mejora.

---

## Alta — antes de producción

- [ ] **Cifrar `ChannelConfig.credentials`.** Los tokens de WhatsApp de cada
  clínica se guardan en texto plano; el propio esquema dice "JSON cifrado o
  plano". Cifrarlos con una llave que viva fuera de la base (KMS o variable de
  entorno) y definir cómo rotarla.
  `packages/database/prisma/schema.prisma` · origen: auditoría inicial (`402dfc4`)

- [ ] **Migrar de SQLite a PostgreSQL y reescribir los triggers de `AuditLog`.**
  SQLite admite un solo escritor, y ese es el cuello de botella real bajo
  webhooks concurrentes y la cola de trabajos. Los dos triggers que hacen
  inmutable la bitácora (sin `UPDATE`, sin `DELETE` antes de 5 años) deben
  reescribirse en PL/pgSQL en la misma migración: Prisma no los genera y
  `migrate diff` no los detecta, así que la protección desaparecería sin aviso.
  `packages/database/prisma/migrations/0003_audit_log/` · origen: `402dfc4`, `052a205`

- [ ] **Sacar el JWT de `localStorage`.** Cualquier XSS permite robar una sesión
  de 12 horas. Pasar a una cookie `httpOnly` con `SameSite` y protección CSRF.
  `apps/web/src/lib/api.ts`, `apps/api/src/lib/auth.ts` · origen: `402dfc4`

- [ ] **Definir las variables obligatorias de producción.** Sin ellas la API no
  arranca, responde 503 o rechaza la operación:
  - `JWT_SECRET` (32 caracteres o más)
  - `CORS_ORIGINS`
  - `PUBLIC_API_HOST`
  - `META_APP_SECRET`
  - `TWILIO_AUTH_TOKEN`
  - `MERCADOPAGO_WEBHOOK_SECRET`
  - `PLATFORM_ADMIN_EMAILS`

  Además, detrás de un balanceador, `TRUST_PROXY=true`: sin ella, la auditoría
  registra la IP del proxy para todos. Y `METRICS_TOKEN` para exponer
  `/metrics`.
  `.env.example` · origen: `402dfc4`, `052a205`

## Media

### Auditoría

- [ ] **`bookAppointment` sobrescribe `Patient.fullName` sin dejar el cambio en
  la auditoría.** Queda registrada la cita, pero no que el nombre del paciente
  cambió.
  `packages/ai-agent/src/calendar/scheduler.ts` · origen: `052a205`

- [ ] **El link de anticipo se audita fuera de la transacción.** El update lo
  hace `MercadoPagoService.createDepositPreference`, así que el cambio y su
  rastro no se confirman juntos. Pasarle el actor y registrar dentro.
  `packages/ai-agent/src/payment/mercadoPagoService.ts`, `apps/api/src/routes/admin.ts` · origen: `052a205`

- [ ] **El límite de lecturas de auditoría vive en memoria.** Con varias
  instancias de la API habría una fila por instancia en cada ventana de 10
  minutos. Moverlo a un almacén compartido cuando se escale.
  `packages/database/src/audit.ts` · origen: `052a205`

- [ ] **"Fuera de horario" usa un horario fijo de 7:00 a 21:00.** Debería leer
  el horario real de la clínica y de cada doctor (`Doctor.availabilityRules`).
  `apps/web/src/lib/audit.ts` · origen: `da9e937`

- [ ] **Decidir con asesoría legal si se auditan las escrituras que origina el
  paciente o el canal**: mensaje entrante, alta de paciente por WhatsApp o por
  voz. Hoy no se auditan por decisión, porque el propio registro es el rastro y
  no interviene ningún humano.
  origen: `052a205`

### Proceso y seguridad

- [ ] **Validar Conventional Commits también en CI.** El hook local solo corre
  si alguien activó `git config core.hooksPath .githooks`; un clon sin activarlo
  puede saltarse el estándar.
  `.github/workflows/ci.yml` · origen: `ea471f6`

- [ ] **Validar entradas con esquemas** (JSON Schema de Fastify o Zod) en lugar
  de los `requireString` / `requireNumber` repetidos en cada handler.
  `apps/api/src/routes/` · origen: `402dfc4`

### Calidad de código

- [ ] **Partir los archivos-dios:**
  - `apps/web/src/app/dashboard/team/page.tsx` (1429 líneas)
  - `apps/api/src/routes/admin.ts` (1333, mezcla clínicas, doctores, servicios,
    citas, bandeja y auditoría)
  - `apps/web/src/app/dashboard/inbox/page.tsx` (1191)
  - `apps/web/src/app/dashboard/calendar/page.tsx` (1003)

  origen: `402dfc4`

- [ ] **12 avisos de ESLint en el panel,** todos anteriores a estas sesiones:
  - 8 × `react-hooks/set-state-in-effect` (calendario ×2, `TenantContext` ×2,
    bandeja, configuración, `AuthGuard`, `DashboardShell`)
  - 1 × `react-hooks/immutability` (`usePolling`)
  - 1 × `react-hooks/purity` (calendario)
  - 2 × navegación con `window.location.href` (`lib/api.ts`, `DashboardShell`)

- [ ] **30 usos de `any` y 51 `console.*`** fuera del logger estructurado de
  `@asistente/observability`, sin contar las suites de prueba.
  origen: `402dfc4`

## Baja

- [ ] **Exportar solo lo sensible.** "Solo sensibles" se calcula en el
  navegador, así que el CSV exporta el filtro completo (la pantalla lo avisa).
  Si hace falta exportar solo lo sensible, mover la clasificación al servidor.
  `apps/web/src/lib/audit.ts`, `apps/api/src/routes/admin.ts` · origen: `da9e937`

- [ ] **La demo de la bitácora pierde el grupo "Hoy" temprano.** Los eventos de
  "hoy" tienen horas fijas, así que antes de las 9:00 aproximadamente (hora de
  CDMX) ese grupo sale vacío.
  `apps/web/src/app/dashboard/audit/demo.ts` · origen: `da9e937`

- [ ] **Definir `JWT_SECRET` en el `.env` local.** Hoy no está definido: la API
  genera un secreto efímero y cada reinicio invalida todas las sesiones.

- [ ] **Actualizar `CLAUDE.md`.** El árbol de arquitectura no incluye
  `packages/observability`, la cola durable, el pipeline de voz, la
  autenticación ni la auditoría, y dice Next.js 15 cuando el panel usa 16.3.

- [ ] **Crear `DESIGN.md`** con el sistema visual del panel (paleta, tipografía,
  componentes). Hoy vive solo en el código.

- [ ] **La etiqueta "Estado:" de la bandeja en vivo tarda hasta un ciclo de
  sondeo (≤3 s) en reflejar el apagado del takeover.** La actualización
  optimista cambia `isHandedOverToHuman` pero no recalcula `status`; el botón
  y el banner sí van al instante.
  `apps/web/src/app/dashboard/inbox/page.tsx` · origen: `91e50a2`
