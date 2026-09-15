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

## [2026-09-15] fix(web): el badge "En vivo" de la bandeja ya no se parte en dos líneas

**Autor:** Claude Sonnet 5 · **Commit:** `pendiente`

### Qué se hizo

El usuario reportó (señalando el elemento en el navegador) que el badge
"En vivo" del encabezado de la Bandeja Omnicanal se veía partido en dos
líneas ("En" / "vivo") dentro de la propia píldora. La causa: el `<h1>`
"Bandeja Omnicanal" y el badge comparten un contenedor `flex` sin
`min-w-0`, así que al no caber los dos junto con "4 chats" en el ancho fijo
de la columna (320px), el navegador encoge el badge en vez del título —
y como el badge no tenía `whitespace-nowrap`, su propio texto se parte.
Bug preexistente (ya estaba en el `inbox/page.tsx` original de 1255
líneas); pasó inadvertido hasta ahora porque nadie había mirado esa esquina
de cerca.

Se agregó `min-w-0` al contenedor del título+badge y `truncate` al `<h1>`
para que sea el título el que ceda espacio con puntos suspensivos, y
`shrink-0 whitespace-nowrap` a los tres badges (Demo, En vivo, contador de
chats) para que ninguno vuelva a partirse sin importar el ancho disponible.

### Archivos tocados
- `apps/web/src/components/dashboard/inbox/ConversationList.tsx` — `min-w-0`/`truncate` en el título, `shrink-0 whitespace-nowrap` en los tres badges

### Verificación
- `npx tsc --noEmit -p apps/web/tsconfig.json` — sin errores.
- `npm run lint --workspace=apps/web` — 0 errores, 0 advertencias.
- Probado en el navegador contra `apps/web` en vivo: "Bandeja Omnic…" se trunca y "En vivo" / "4 chats" quedan cada uno en una sola línea.

---

## [2026-09-15] refactor(web): modularizar inbox/page.tsx

**Autor:** Claude Sonnet 5 · **Commit:** `6300088`

### Qué se hizo

Cierra el pendiente de "Calidad de código" de `TODO.md`: era el último
archivo-dios del frontend (los otros tres — `admin.ts`, `team/page.tsx`,
`calendar/page.tsx` — ya se habían modularizado). `inbox/page.tsx` tenía
1255 líneas con tipos, datos de demo, la lista de conversaciones (~200
líneas), el encabezado del chat con sus banners (~180 líneas) y el
reproductor de la grabación de llamada (~145 líneas) dentro del mismo
componente. Se extrajo cada pieza autocontenida:

- `inbox/types.ts` — `ConversationItem`, `MessageItem`, `ApiConversationResponse`, `ApiMessageResponse`.
- `inbox/demo.ts` — `DEMO_CONVERSATIONS`, `DEMO_MESSAGES`.
- `components/dashboard/inbox/ConversationList.tsx` — columna izquierda: buscador, estado de conexión, lista de chats.
- `components/dashboard/inbox/ChatHeader.tsx` — identidad del paciente, botón de takeover, resumen colapsable de la cita y los banners de urgencia/copiloto humano.
- `components/dashboard/inbox/CallRecordingPlayer.tsx` — el reproductor simulado de la grabación Twilio con waveform interactivo (`WAVEFORM_BARS` vive aquí: es presentación pura del reproductor, no dato de demo).
- `components/dashboard/inbox/PatientSidebar.tsx` — columna derecha: ficha del paciente, cita activa, notas de triaje.

`page.tsx` queda como orquestador: estado, `fetch`/polling de conversaciones
y mensajes, handlers de takeover/envío/sembrado, y compone los módulos
anteriores junto con el hilo de mensajes y la barra de entrada (que se
quedaron inline por ser compactos). Cambio de solo estructura, sin tocar
lógica, estilos ni textos.

### Archivos tocados
- `apps/web/src/app/dashboard/inbox/page.tsx` — de 1255 a 531 líneas
- `apps/web/src/app/dashboard/inbox/types.ts` — nuevo
- `apps/web/src/app/dashboard/inbox/demo.ts` — nuevo
- `apps/web/src/components/dashboard/inbox/ConversationList.tsx` — nuevo
- `apps/web/src/components/dashboard/inbox/ChatHeader.tsx` — nuevo
- `apps/web/src/components/dashboard/inbox/CallRecordingPlayer.tsx` — nuevo
- `apps/web/src/components/dashboard/inbox/PatientSidebar.tsx` — nuevo
- `TODO.md` — se retira el pendiente resuelto (ya no quedan archivos-dios pendientes)

### Verificación
- `npx tsc --noEmit -p apps/web/tsconfig.json` — sin errores.
- `npm run lint --workspace=apps/web` — 0 errores, 0 advertencias.
- Probado en el navegador contra `apps/web` en vivo: lista de conversaciones, envío de mensaje, takeover (con su banner y reversión), y en modo Demo el reproductor de la grabación (play/pause, avance del progreso, salto de 10s) — todo idéntico al comportamiento anterior.

---

## [2026-09-15] refactor(web): modularizar calendar/page.tsx

**Autor:** Claude Sonnet 5 · **Commit:** `df07d45`

### Qué se hizo

Resuelve la mitad del pendiente de "Calidad de código" de `TODO.md`
(`inbox/page.tsx` queda para un cambio aparte). `calendar/page.tsx` tenía
1032 líneas mezclando tipos, datos de demo, una tarjeta de cita de ~130
líneas y un modal de ~140 líneas dentro del mismo componente. Mismo
tratamiento que ya recibieron `admin.ts` y `team/page.tsx`: se extrajo cada
pieza autocontenida a su propio archivo y `page.tsx` quedó como orquestador
(estado, `fetch`/polling, filtrado) que compone los demás.

- `calendar/types.ts` — `ApiAppointment`, `TenantDoctor`, `TenantService`, `TenantCatalogItem`.
- `calendar/demo.ts` — los datos de la demostración interactiva.
- `components/dashboard/calendar/AppointmentRow.tsx` — una fila de la agenda (horario, datos del paciente, badges de estado, acciones).
- `components/dashboard/calendar/NewAppointmentModal.tsx` — el modal de "Nueva Cita", con el mismo patrón de props (`valor` + `setValor`) que `AddDoctorModal`/`AddServiceModal`.

Cambio de solo estructura: cada bloque de JSX se movió tal cual, sin tocar
clases de Tailwind, textos ni lógica — la única variación de contenido es
cambiar comillas rectas por `&quot;` en `AppointmentRow` (JSX fuera de una
expresión `{}` no debe llevar comillas literales).

### Archivos tocados
- `apps/web/src/app/dashboard/calendar/page.tsx` — de 1032 a 591 líneas
- `apps/web/src/app/dashboard/calendar/types.ts` — nuevo
- `apps/web/src/app/dashboard/calendar/demo.ts` — nuevo
- `apps/web/src/components/dashboard/calendar/AppointmentRow.tsx` — nuevo
- `apps/web/src/components/dashboard/calendar/NewAppointmentModal.tsx` — nuevo

### Verificación
- `npx tsc --noEmit -p apps/web/tsconfig.json` — sin errores.
- `npm run lint --workspace=apps/web` — 0 errores, 0 advertencias.
- Probado en el navegador contra `apps/web` en vivo: la agenda renderiza igual que antes (métricas, filtros, tarjetas de cita) y el modal "Nueva Cita" abre y muestra los mismos campos.

---

## [2026-09-15] feat(db): mover el throttle de lecturas de auditoría a Redis

**Autor:** Claude Sonnet 5 · **Commit:** `807be13`

### Qué se hizo

Resuelve el pendiente de "Auditoría" de `TODO.md`. El throttle que evita
llenar `AuditLog` de ruido (el panel consulta mensajes cada 2 s y citas cada
3.5 s) vivía en un `Map` en memoria del proceso: con varias instancias de la
API detrás de un balanceador, cada una tendría su propia ventana de
`AUDIT_READ_THROTTLE_MS`, así que el mismo acceso podría registrarse una vez
por instancia en vez de una sola vez.

Se agregó `ioredis` a `@asistente/database` (que ahora también depende de
`@asistente/observability` para loguear degradaciones — se reordenó el
build raíz para que `observability` compile antes que `database`, y los dos
pasos de `ci.yml` que construían `database` sueltos antes del build raíz).
Con `REDIS_URL` configurada, la marca de "ya se registró" usa
`SET clave valor PX <ttl> NX`: atómico, así que dos instancias nunca deciden
"no está" para la misma clave a la vez — a diferencia del `Map` original,
que sí tenía una ventana de carrera entre el chequeo y la escritura (el
`await` de la inserción a la tabla quedaba en medio). Sin `REDIS_URL` — el
caso por defecto en desarrollo y con una sola instancia — cae exactamente al
`Map` en memoria de antes, mismo comportamiento.

Dos decisiones de resiliencia:
- Si Redis falla al momento de chequear (red, servicio caído), se trata como
  "sí registrar": es preferible una fila de más que un acceso real sin
  rastro, coherente con el resto de `recordAudit()`.
- Si la inserción a `AuditLog` falla *después* de marcar la clave en Redis
  (o en el `Map`), se revierte la marca antes de propagar el error — sin
  esto, un solo error transitorio de base de datos podría dejar hasta
  `AUDIT_READ_THROTTLE_MS` sin auditar un acceso real.

`lazyConnect: true` evita que los scripts de una sola corrida (seed,
create-admin, rotate-credentials — ninguno llama `recordAudit()` hoy) se
queden esperando una conexión a Redis que nunca necesitan.

**Bug encontrado y corregido durante la propia verificación**: simular el
job de CI con `REDIS_URL` de verdad (no solo con scripts propios que
terminaban con `process.exit()`, que lo disimulaban) colgó
`npm run test` indefinidamente — la primera versión abría el socket a
Redis en el primer `recordAudit()` de tipo LIST/READ y nunca lo cerraba;
como ninguna suite llama `process.exit()` en el camino feliz (solo en
fallo), Node nunca vaciaba el *event loop* y el proceso quedaba colgado
para siempre. Se agregó un temporizador de inactividad
(`REDIS_IDLE_DISCONNECT_MS`, 3 s): cada uso de Redis lo reinicia: un
servidor de API vivo casi nunca lo deja vencer (el panel consulta cada
2-4 s), y un script de una sola corrida cierra el socket solo 3 s después
de su último uso y termina limpio sin necesitar `process.exit()`.

### Archivos tocados
- `packages/database/src/audit.ts` — throttle vía Redis con `SET NX` atómico, respaldo en memoria, reversión de la marca si la inserción falla
- `packages/database/package.json` — dependencias `ioredis` y `@asistente/observability`
- `package.json` (raíz) — `observability` compila antes que `database` en el build
- `.github/workflows/ci.yml` — servicio `redis:7`, `REDIS_URL` en el job de pruebas, orden de build corregido en ambos pasos que construían `database` suelto
- `.env.example` — documenta `REDIS_URL` como opcional
- `TODO.md` — se retira el pendiente resuelto

### Verificación
- Probado con un script propio contra Redis real (`brew install redis`): 3 llamadas seguidas a `recordAudit` con la misma clave generan 1 sola fila, igual que antes con el `Map`.
- **Compartido entre instancias, verificado de verdad**: dos procesos Node completamente separados (PIDs distintos, cada uno con su propio `Map` vacío) apuntando al mismo Redis — el primero registra la fila, el segundo la omite porque lee el estado compartido en Redis, no su memoria local.
- **Degradación**: con `REDIS_URL` apuntando a un puerto sin nada escuchando, la fila se registra igual (fail-open) y el script termina limpio, sin quedarse colgado esperando reconexión.
- `npm run build --workspaces --if-present` — 6/6 workspaces, orden de build correcto.
- `npm run test` (todas las suites, todos los workspaces) — sin `REDIS_URL`: 100% igual que antes. Con `REDIS_URL` apuntando a Redis real (mismo servicio que ahora define `ci.yml`): 100% también.

---

## [2026-09-14] docs(seguridad): cerrar el pendiente de auditar escrituras del paciente

**Autor:** Claude Sonnet 5 · **Commit:** `3b01b45`

### Qué se hizo

`TODO.md` tenía abierto "decidir con asesoría legal si se auditan las
escrituras que origina el paciente o el canal" desde `052a205`. Esa
decisión de cumplimiento (LFPDPPP/NOM-024) no le corresponde tomarla a un
agente de IA sin esa asesoría — se le preguntó explícitamente al usuario
qué hacer con el pendiente. Se decidió **mantener el comportamiento actual**
(no auditar mensajes entrantes, altas de paciente por WhatsApp/voz ni
otras escrituras que el propio paciente dispara sin intervención humana) y
documentarlo como decisión de producto permanente en vez de dejarlo como
pendiente abierto.

Se agregó la explicación completa a CLAUDE.md § 5.6 (por qué: el mensaje o
la llamada grabada ya es el rastro de esa acción; auditar de nuevo sería
redundante y no hay ningún acceso humano que registrar), con la nota de que
si el criterio de cumplimiento cambia en el futuro, sigue requiriendo
asesoría legal antes de tocar el código — no es una puerta cerrada, es una
decisión documentada con su razón.

### Archivos tocados
- `CLAUDE.md` — § 5.6, alcance deliberado de `recordAudit()`
- `TODO.md` — se retira el pendiente (ya no es "pendiente", es una decisión documentada)

### Verificación
- Cambio de solo documentación; sin código de por medio.

---

## [2026-09-14] feat(db)!: migrar de SQLite a PostgreSQL

**Autor:** Claude Sonnet 5 · **Commit:** `6813beb`

### Qué se hizo

Resuelve el único pendiente de prioridad Alta de `TODO.md`. SQLite admite un
solo escritor a la vez; bajo webhooks concurrentes de Meta/Twilio/Mercado
Pago más el worker de la cola de trabajos, eso es un cuello de botella real,
no teórico — justo lo que bloqueaba producción.

1. **`schema.prisma`**: `datasource db.provider` pasó de `sqlite` a
   `postgresql`. El resto del esquema no necesitó cambios: todos los tipos
   (`String`, `Float`, `Boolean`, `DateTime`, `@default(cuid())`) mapean
   igual de bien a Postgres, y una búsqueda de `$queryRaw`/`$executeRaw`/
   `PRAGMA` en `packages/database/src` y `apps/api/src` no encontró SQL
   crudo específico de SQLite en ningún lado del código.

2. **Migraciones**: las 3 migraciones de SQLite (`0001_baseline`,
   `0002_appointment_slot_key`, `0003_audit_log`) no son compatibles con
   Postgres — el SQL de creación de tablas es distinto por motor — así que
   se reemplazaron por dos nuevas, generadas y verificadas contra un
   PostgreSQL 16 real:
   - `0001_postgres_baseline`: el esquema completo tal como está hoy
     (`prisma migrate dev --create-only` contra Postgres).
   - `0002_audit_log_triggers`: los dos triggers de inmutabilidad de
     `AuditLog`, reescritos de PL/SQLite a PL/pgSQL. Postgres exige una
     función separada por trigger (no admite el cuerpo inline de SQLite) y
     `FOR EACH ROW` explícito. El trigger de retención cambia de fondo: en
     SQLite `createdAt` vivía como epoch en milisegundos y la comparación
     era aritmética entera (`strftime('%s','now') * 1000 - 157852800000`);
     en Postgres es un `TIMESTAMP` nativo y la comparación usa aritmética de
     intervalos real (`NOW() - INTERVAL '1827 days'`) — mismos 1827 días
     (5 años + 2 bisiestos), mecanismo distinto.

     Verificado con SQL directo contra Postgres, no solo leído: un
     `UPDATE` a una fila de `AuditLog` falla siempre; un `DELETE` de una fila
     reciente falla; un `DELETE` de una fila con `createdAt` de hace 6 años
     se permite. Los tres casos se probaron con datos reales insertados a
     mano, no solo inspeccionando el SQL.

3. **Entornos**: `.env`, `packages/database/.env` y `apps/api/.env` (no
   versionados) apuntan a un PostgreSQL 16 local
   (`brew install postgresql@16`). `.env.example` documenta el setup.

### Archivos tocados
- `packages/database/prisma/schema.prisma` — `provider = "postgresql"`
- `packages/database/prisma/migrations/0001_postgres_baseline/` — esquema completo (nuevo)
- `packages/database/prisma/migrations/0002_audit_log_triggers/` — triggers en PL/pgSQL (nuevo)
- `packages/database/prisma/migrations/0001_baseline/`, `0002_appointment_slot_key/`, `0003_audit_log/` — eliminadas (SQL específico de SQLite, no portable)
- `packages/database/prisma/migrations/migration_lock.toml` — `provider = "postgresql"`
- `.env.example` — `DATABASE_URL` de ejemplo apunta a Postgres local
- `TODO.md` — se retira el pendiente resuelto

### Verificación
- Migraciones aplicadas dos veces desde cero contra PostgreSQL 16 local (`prisma migrate deploy`), sin errores.
- Triggers probados con SQL directo (`psql`): `UPDATE` bloqueado siempre; `DELETE` de fila reciente bloqueado; `DELETE` de fila de +5 años permitido.
- `npm run db:seed` — crea la clínica modelo, administrador, doctores, servicios y FAQs sin errores.
- `npm run build --workspaces --if-present` — 6/6 workspaces.
- `npm run test --workspace=@asistente/api` — 9/9 suites (incluida `voice-test-suite.ts`, 59/59).
- `npm run test:stress --workspace=@asistente/ai-agent` — 40/40 pruebas.
- `npm run test --workspace=@asistente/ai-agent` (`test-suite.ts`) — 20/20 pruebas.
- Probado en vivo en el navegador contra `apps/api` + `apps/web` corriendo de verdad: login, `+ Citas Demo`, calendario y Bitácora de Auditoría (con badges de sensibilidad) funcionan igual que con SQLite.

### Pendientes derivados
- Verificar el primer despliegue real a un PostgreSQL gestionado (RDS, Supabase, etc.): esta migración se validó contra un Postgres 16 local; producción probablemente necesite ajustar el pool de conexiones de Prisma (`connection_limit` en `DATABASE_URL`) según el plan del proveedor.

---

## [2026-09-14] ci(db): usar PostgreSQL en CI y sembrar antes de las pruebas

**Autor:** Claude Sonnet 5 · **Commit:** `b80578c`

### Qué se hizo

Al migrar a PostgreSQL, `ci.yml` necesitaba un servicio de base de datos en
vez del archivo SQLite que se tocaba a mano. Se agregó un contenedor
`postgres:16` como `services.postgres` del job `test`, con healthcheck
(`pg_isready`) para que el job espere a que acepte conexiones antes de
migrar.

Simulando el job completo de punta a punta contra un Postgres local recién
creado (mismo usuario/contraseña/base que declara `ci.yml`, sin nada
sembrado) se encontró que `npm run test` fallaba: tanto
`packages/ai-agent/src/test-suite.ts` como `apps/api/src/api-test-suite.ts`
buscan la clínica sembrada `dental-polanco` y lanzan error si no existe
("Tenant demo no encontrado; ejecuta npm run db:seed"). El `ci.yml` nunca
corría `npm run db:seed` — un hueco que ya existía desde que se armó el CI
(`c6f53a2`), enmascarado porque nunca se había corrido el job completo
contra una base realmente vacía hasta esta simulación. Se agregó
`npm run db:seed` al paso "Set up test database", después de las
migraciones.

### Archivos tocados
- `.github/workflows/ci.yml` — servicio `postgres:16` con healthcheck, `DATABASE_URL` apunta al servicio, se agrega `npm run db:seed`

### Verificación
- Simulación local exacta del job `test`: se creó un rol y una base Postgres con el mismo usuario/contraseña/nombre que declara `ci.yml`, se corrieron migración + seed + `npm run test` con las mismas variables de entorno — 100% de las suites pasaron (incluidas las de `packages/ai-agent`, antes no verificadas end-to-end contra una base vacía).
- YAML validado con `js-yaml`.
- No se pudo correr el workflow en GitHub Actions porque el repositorio no tiene remoto configurado en este entorno.

---

## [2026-09-14] docs: sincronizar documentación con la migración a PostgreSQL

**Autor:** Claude Sonnet 5 · **Commit:** `554929d`

### Qué se hizo

`README.md`, `CLAUDE.md`, `AGENTS.md`, `packages/database/README.md`,
`apps/web/README.md`, `apps/api/QUEUE.md` y
`packages/database/prisma/migrations/README.md` describían SQLite como el
motor local (`dev.db`, "migrable a PostgreSQL en producción"), que ya no es
cierto tras el commit `6813beb`. Se actualizaron todas las menciones:
requisito de PostgreSQL local en "Requisitos Previos" e instrucciones de
setup del `README.md` raíz, árbol de archivos sin el ya inexistente
`dev.db`, tabla de stack de `CLAUDE.md`, y el pendiente de `QUEUE.md` sobre
transporte de la cola (con PostgreSQL varios workers sí pueden escribir a
la vez, ya no aplica la limitación de "un solo escritor" de SQLite).
`packages/database/prisma/migrations/README.md` se reescribió por completo
con el flujo de PostgreSQL local (instalación con Homebrew, `createdb`,
`DATABASE_URL`) en vez de la creación manual del archivo `.db`.

### Archivos tocados
- `README.md`, `CLAUDE.md`, `AGENTS.md`, `packages/database/README.md`, `apps/web/README.md`, `apps/api/QUEUE.md`, `packages/database/prisma/migrations/README.md`

### Verificación
- Cambio de solo documentación: sin código ni configuración de por medio. Se revisó cada mención restante de "SQLite" en el repo (`grep -rn sqlite`) para confirmar que ninguna quedó desactualizada.

---

## [2026-09-14] fix(api): limpiar el usuario de prueba de la suite de integración

**Autor:** Claude Sonnet 5 · **Commit:** `b31b5a7`

### Qué se hizo
Investigando el reporte de citas duplicadas de "Alejandra Morales" en el
`dev.db` local (ver hallazgo de la sesión anterior), se auditó qué suites
tocan la clínica demo real (`dental-polanco`) en vez de un tenant aislado:
`api-test-suite.ts` y `packages/ai-agent/src/test-suite.ts` sí la usan a
propósito (necesitan doctores/servicios reales para probar el flujo
completo), pero solo `api-test-suite.ts` tenía una fuga: creaba (vía
`upsert`) un usuario ADMIN `api-test@asistente.mx` para firmar el JWT de
las pruebas y nunca lo borraba. Cada corrida de `npm run test` (local o en
CI) dejaba ese usuario permanentemente en la clínica real, visible en el
selector de personal de la Bitácora de Auditoría.

Las citas duplicadas en sí **no** vienen de ninguna suite de pruebas:
`stress-test-suite.ts` sí reutiliza el teléfono de Alejandra Morales
(+525544332211) pero contra un tenant aislado que crea y borra él mismo, y
`test-suite.ts` solo lo usa para dos mensajes de solo-lectura (emergencia y
cotización) que no agendan nada. Todo apunta a ciclos manuales de
"+ Citas Demo" → "Limpiar Citas" → "+ Citas Demo" durante pruebas
exploratorias anteriores en este mismo `dev.db` (comportamiento esperado
de esas herramientas de sandbox, no un bug).

### Archivos tocados
- `apps/api/src/api-test-suite.ts` — borra el usuario `api-test@asistente.mx` en el `finally`

### Verificación
- `npx tsx src/api-test-suite.ts` — 10/10 pruebas exitosas.
- Consulta directa post-corrida: `db.user.findMany({ where: { email: 'api-test@asistente.mx' } })` devuelve 0 filas.

---

## [2026-09-14] fix(web): no recortar texto de las citas en pantallas móviles

**Autor:** Claude Sonnet 5 · **Commit:** `898b60c`

### Qué se hizo
Probando `/dashboard/calendar` a 375px (iPhone SE / gama baja Android) se
encontró que cada tarjeta de cita recorta texto en el borde derecho de la
pantalla en vez de ajustar el renglón: el nombre del tratamiento y doctor
("Valoración Inicial y Diagnóstico co...") y la línea de
duración/precio/síntomas quedaban cortados a la mitad de la palabra,
ilegibles. CLAUDE.md § 4.2 exige "Responsividad Completa" explícitamente
para tablet y móvil, y la recepción de una clínica revisa la agenda desde
el celular con frecuencia.

La causa: el contenedor interno "horario + datos del paciente" es un
`flex` con una columna de hora de ancho fijo (`w-28 shrink-0`) y, junto a
ella, el bloque de datos del paciente sin `min-width: 0` — el valor por
defecto de un ítem flex es `min-width: auto`, así que en vez de encogerse
y dejar que el texto interno haga salto de línea, el ítem crecía más allá
del ancho disponible y su contenido se recortaba en el borde de la
tarjeta. Además la línea "Duración • Precio • síntomas" no tenía
`flex-wrap`, así que sus tres fragmentos se quedaban forzados en una sola
línea.

Se agregó `min-w-0 flex-1` al bloque de datos del paciente (para que sí se
encoja y el texto haga wrap) y `flex-wrap` a la línea de
duración/precio/síntomas. Verificado a 375px: todo el texto ahora hace
salto de línea limpio; verificado también en escritorio que la tarjeta
sigue viéndose igual que antes (una sola fila).

### Archivos tocados
- `apps/web/src/app/dashboard/calendar/page.tsx` — `min-w-0 flex-1` en los datos del paciente, `flex-wrap` en la línea de duración/precio/síntomas

### Verificación
- Prueba manual en el navegador a 375×812 contra `apps/api` + `apps/web` en vivo: el texto ya no se recorta, hace salto de línea dentro de la tarjeta.
- Prueba manual en escritorio (1366px): sin cambios visuales respecto al layout anterior.
- `npx tsc --noEmit -p apps/web/tsconfig.json` — sin errores.

### Pendientes derivados
- Al revisar la agenda en vivo se encontraron ~9 citas de "Alejandra Morales" con horarios traslapados a 1 segundo de diferencia para el mismo doctor: no es un bug de la app (`SchedulerService` sí rechaza traslapes vía la API), sino datos residuales de una corrida previa de `npm run test:stress` contra este mismo `dev.db` local en vez de una base aislada — el propio `CLAUDE.md` ya documenta esa recomendación pendiente. No se borraron esas filas en este cambio para no tocar datos fuera de alcance sin pedir permiso.

---

## [2026-09-14] fix(web): pedir "solo sensibles" al servidor en la bitácora

**Autor:** Claude Sonnet 5 · **Commit:** `0f2d07a`

### Qué se hizo
Probando el panel en vivo (login real, `npm run dev` en `apps/api` y
`apps/web`) se encontró que el toggle "Solo sensibles" de
`/dashboard/audit` tenía, en el frontend, el mismo bug que se acababa de
corregir en el servidor (`fix(api): paginar al filtrar auditoria por
sensibles`, commit `02ce44a`): la lista en pantalla siempre pedía
`GET /api/audit?limit=100` sin `onlySensitive`, y el toggle solo
re-filtraba en el cliente esa página de 100 filas ya cargada
(`visibleEvents`). Un evento sensible más viejo que las últimas 100 filas
del periodo (p. ej. en "30 días" o "Todo" en una clínica activa)
desaparecía del filtro sin aviso — aun con el fix del servidor, porque el
cliente nunca le pedía `onlySensitive=true`.

Se agregó `onlySensitive` a `buildQuery` y a `requestKey` (para que el
toggle dispare un refetch), así la petición en vivo ahora es
`GET /api/audit?...&onlySensitive=true`, que sí usa la paginación por
cursor corregida en `fetchAuditRows`. `visibleEvents` ya no refiltra en el
cliente cuando hay datos en vivo (el servidor ya filtró); en modo Demo, sin
servidor real, se conserva el filtro en el cliente sobre el set fijo de
eventos de muestra. Verificado manualmente contra el servidor real: la
petición de red ahora lleva `onlySensitive=true` y la cuenta de eventos
sensibles sube de 65 a 75 al reflejar actividad reciente, sin depender de
qué tan atrás quedara en la ventana de 100.

### Archivos tocados
- `apps/web/src/app/dashboard/audit/page.tsx` — `onlySensitive` en `buildQuery`/`requestKey`, `visibleEvents` ya no refiltra en vivo

### Verificación
- Prueba manual en el navegador contra `apps/api` + `apps/web` corriendo en vivo con datos reales: el toggle "Solo sensibles" ahora dispara `GET /api/audit?...&onlySensitive=true` (antes no incluía el parámetro) y la cuenta coincide con la bitácora completa.
- Modo Demo probado aparte: el toggle sigue funcionando sobre el set fijo de eventos de muestra (sin cambios de comportamiento).
- `npx tsc --noEmit -p apps/web/tsconfig.json` — sin errores.
- `npm run lint --workspace=apps/web` — 0 errores, 0 advertencias.

---

## [2026-09-14] fix(observability): no perder el error real en logger.error

**Autor:** Claude Sonnet 5 · **Commit:** `ff82ef4`

### Qué se hizo
En el commit `5eb30f1c` se migraron varios `console.error`/`console.warn` a
`logger.error()` de `@asistente/observability`, pero la firma del método es
`error(message, error?, context?)` y tres llamadas nuevas pasaban el objeto
de contexto como segundo argumento en vez de como tercero. Como `error()`
serializa el segundo argumento con `serializeError()`, y ese objeto no era
una instancia de `Error`, el log terminaba con `"err":{"message":"[object
Object]"}`: se perdía el detalle real (status HTTP, texto de la respuesta,
mensaje de excepción) justo en los tres puntos más sensibles para depurar en
producción — el fallback del agente de Gemini, el envío de WhatsApp y la
creación de preferencias de Mercado Pago.

Se corrigió pasando el error real como segundo argumento y el resto de datos
como contexto (tercer argumento). Se verificó reproduciendo cada llamada con
un logger real: el `stack` y el `message` ahora aparecen completos en el
NDJSON en vez de `[object Object]`.

### Archivos tocados
- `packages/ai-agent/src/agent/geminiAgent.ts` — `logger.error` con el error real cuando falla la llamada a Gemini
- `apps/api/src/services/whatsappService.ts` — error HTTP y de red de WhatsApp en el segundo argumento
- `packages/ai-agent/src/payment/mercadoPagoService.ts` — detalle del rechazo de Mercado Pago en el segundo argumento

### Verificación
- Script ad-hoc con `createLogger()` reproduciendo las 4 llamadas afectadas: el NDJSON ahora incluye `message`/`stack` reales en vez de `[object Object]`.
- `npm run build --workspaces --if-present` — 6/6 workspaces.
- `npm run test --workspace=@asistente/api` — 9/9 suites.
- `npm run test:stress --workspace=@asistente/ai-agent` — 40/40 pruebas.

---

## [2026-09-14] fix(api): traducir mensajes de validacion de ajv al espanol

**Autor:** Claude Sonnet 5 · **Commit:** `2f902b0`

### Qué se hizo
Las rutas administrativas usan esquemas JSON de Fastify/Ajv desde el commit
`5eb30f1c`, pero el manejador de errores devolvía `error.message` de Ajv tal
cual: mensajes en inglés como `"body/phoneE164 must NOT have fewer than 10
characters"`. El frontend (equipo, calendario, login) muestra ese texto
directo al personal de recepción vía `data.error`/`errorData.error`, así que
un dato mal capturado producía un mensaje en inglés e ilegible en vez de la
respuesta clara que ya daban los validadores manuales (`requireString`,
`requireMexicanPhone`, etc.) que estas rutas usaban antes de tener esquema.

Se agregó `translateValidationError()`, que toma el primer error de Ajv
(`keyword`, `instancePath`, `params`) y arma un mensaje en español según el
tipo de fallo (`required`, `minLength`, `maxLength`, `minimum`, `maximum`,
`enum`, `type`, `additionalProperties`), nombrando el campo afectado.

### Archivos tocados
- `apps/api/src/lib/http.ts` — `translateValidationError()` y su uso en `registerErrorHandler`

### Verificación
- Script ad-hoc contra `createTenantSchema`/`createDoctorSchema` con `fastify.inject`: teléfono corto, campo obligatorio faltante y campo no permitido devuelven mensajes en español (p. ej. `El campo "phoneE164" debe tener al menos 10 caracteres`).
- `npm run build --workspaces --if-present` — 6/6 workspaces.
- `npm run test --workspace=@asistente/api` — 9/9 suites (los tests de esquema existentes no validan el texto exacto del mensaje).

### Pendientes derivados
- Ningún test cubre hoy el texto del mensaje de validación; agregar un caso explícito en `apps/api/src/*-test-suite.ts` evitaría una regresión silenciosa del texto en español.

---

## [2026-09-14] fix(ci): dar base de datos a los tests y subir a node 22

**Autor:** Claude Sonnet 5 · **Commit:** `c6f53a2`

### Qué se hizo
El workflow `ci.yml` introducido en `ace29838` corre `npm run test` (que
termina ejecutando Prisma Client contra SQLite) sin `DATABASE_URL` y sin
aplicar las migraciones: tanto `.env` como `*.db` están en `.gitignore`, así
que un checkout limpio del runner no tiene ni la variable ni el archivo de
base de datos. Cualquier suite que toque `db` (la mayoría) habría fallado en
el primer PR real que corriera el CI. Además usaba Node 20 cuando CLAUDE.md
exige Node v22+.

Se agregó `DATABASE_URL=file:./dev.db` al entorno del job `test`, un paso
"Set up test database" que crea el archivo vacío en
`packages/database/prisma/dev.db` (SQLite exige que exista antes de migrar,
según `packages/database/prisma/migrations/README.md`) y corre
`npm run db:migrate` (`prisma migrate deploy`), y se subió `node-version` de
ambos jobs a 22.

### Archivos tocados
- `.github/workflows/ci.yml` — base de datos de prueba, `DATABASE_URL` y Node 22

### Verificación
- Simulación local del paso en un directorio descartable: `touch packages/database/prisma/dev.db && DATABASE_URL="file:./dev.db" npx prisma migrate deploy` aplicó las 3 migraciones (`0001_baseline`, `0002_appointment_slot_key`, `0003_audit_log`) contra un archivo SQLite nuevo, igual que documenta el README de migraciones.
- El YAML resultante se valida con `js-yaml` sin errores.
- No se pudo correr el workflow en GitHub Actions porque el repositorio no tiene remoto configurado en este entorno.

### Pendientes derivados
- Verificar el primer run real en GitHub Actions en cuanto el repo tenga remoto: la simulación local cubre la lógica de Prisma, pero no runners, caché de npm ni el orden de pasos real de Actions.

---

## [2026-09-14] refactor(web,api): unificar reglas de sensibilidad de auditoria

**Autor:** Claude Sonnet 5 · **Commit:** `20b1978`

### Qué se hizo
`isRowSensitive` en `apps/api/src/routes/admin/audit.ts` y `sensitivityOf`
en `apps/web/src/lib/audit.ts` eran dos copias independientes de la misma
regla de negocio ("qué evento merece la atención del director"): mismo
horario de oficina, misma tolerancia de 30 minutos, misma excepción para
`LIST AUDIT_LOG`. Al vivir en dos paquetes que no comparten runtime (backend
Node vs. frontend Next.js), cualquier cambio futuro a la regla (agregar un
motivo de sensibilidad, ajustar la tolerancia) tenía que hacerse dos veces, y
nada avisaba si se olvidaba una.

Se extrajo la lógica completa (horario CDMX vía `Intl`, parseo de horario de
doctores, `isOutsideBusinessHours`, `auditSensitivityOf`) a
`packages/shared-types/src/auditSensitivity.ts`, el único paquete que ya
importan tanto `apps/api` como `apps/web`. Ambos lados ahora delegan ahí; los
nombres exportados desde `apps/web/src/lib/audit.ts` (`sensitivityOf`,
`isOutsideBusinessHours`, `Sensitivity`, `AuditScheduleContext`,
`DoctorScheduleContext`) se mantienen como re-exports para no tocar
`apps/web/src/app/dashboard/audit/page.tsx`, su único consumidor.

Este commit solo mueve código: el comportamiento de las rutas de auditoría
(incluido el filtro `onlySensitive`, con su bug de "filtra después de
recortar") se mantiene idéntico al de antes; se corrige por separado.

### Archivos tocados
- `packages/shared-types/src/auditSensitivity.ts` — nueva fuente única de la clasificación de sensibilidad
- `packages/shared-types/src/index.ts` — re-exporta el nuevo módulo
- `apps/api/src/routes/admin/audit.ts` — `isRowSensitive` delega en `auditSensitivityOf`
- `apps/web/src/lib/audit.ts` — `sensitivityOf`/`isOutsideBusinessHours` delegan en el paquete compartido

### Verificación
- `npm run build --workspace=packages/shared-types && npm run build --workspace=@asistente/database && npm run build --workspace=@asistente/api && npm run build --workspace=apps/web` — sin errores de tipos.
- `npm run test --workspace=@asistente/api` — 9/9 suites (incluida `audit-test-suite.ts` completa, 40/40).

---

## [2026-09-14] fix(api): paginar al filtrar auditoria por sensibles

**Autor:** Claude Sonnet 5 · **Commit:** `02ce44a`

### Qué se hizo
`GET /api/audit` y `/api/audit/export` con `onlySensitive=true` traían
`limit` filas más recientes y filtraban la sensibilidad después, en JS. Eso
responde "los sensibles entre los últimos N", no "los últimos N sensibles":
un evento sensible que quedó fuera de esa ventana (porque hubo N eventos
ordinarios más recientes) desaparecía sin aviso, justo en la vista que un
director usa para revisar lo que de verdad importa.

Se agregó `fetchAuditRows()`, que para `onlySensitive` pagina hacia atrás en
lotes de 500 filas (con cursor por `id`, orden `createdAt desc, id desc`
para que la paginación sea estable) acumulando sensibles hasta juntar
`limit` o agotar un tope de 5000 filas escaneadas — el resto de reglas de
sensibilidad (fuera de horario del doctor, cambios de pago) no se pueden
expresar en el `where` de Prisma, así que no hay forma de evitar traer y
evaluar en JS.

Se agregó una prueba de regresión en `audit-test-suite.ts`: genera un evento
sensible garantizado (`EXPORT`) y tres eventos no sensibles más recientes
insertados directo en la BD (para no toparse con el throttle de lecturas
repetidas), y confirma que `onlySensitive` con `limit=1` sigue encontrando
el primero. Se verificó manualmente que la prueba falla si se revierte
`fetchAuditRows` al comportamiento anterior (traer y filtrar después).

### Archivos tocados
- `apps/api/src/routes/admin/audit.ts` — `fetchAuditRows()` con paginación por cursor para `onlySensitive`
- `apps/api/src/audit-test-suite.ts` — prueba de regresión para el filtro `onlySensitive`

### Verificación
- Prueba manual: se forzó temporalmente `fetchAuditRows` a devolver el comportamiento anterior (traer `limit` sin filtrar) y la nueva prueba falló como se esperaba; revertido antes de commitear.
- `npm run build --workspace=@asistente/api` — sin errores.
- `npm run test --workspace=@asistente/api` — 9/9 suites (auditoría 41/41, incluida la prueba nueva).

---

## [2026-09-14] docs(api): restaurar comentarios perdidos en el refactor de rutas admin

**Autor:** Claude Sonnet 5 · **Commit:** `be6a341`

### Qué se hizo
Al dividir `apps/api/src/routes/admin.ts` en `apps/api/src/routes/admin/*.ts`
(commit `ace2983`) se perdieron varios comentarios que explicaban decisiones
no evidentes desde el código — justo lo que CLAUDE.md § 7.2 pide conservar.
Se restauraron, sin tocar lógica:

- En `audit.ts`: por qué el filtro `action` acepta varias acciones separadas
  por coma, por qué `GET /api/audit`/`export` llevan doc-comment explicando
  que consultar y exportar la bitácora también quedan auditados, por qué
  `csvCell` neutraliza celdas que empiezan con `=+-@` (inyección de fórmulas
  en Excel vía el nombre de un paciente o un correo de login fallido), y por
  qué la exportación lleva BOM (para que Excel respete los acentos).
- En `tenants.ts`: por qué `DELETE /api/tenants/:id/reset` exige el mismo
  privilegio que borrar un doctor o servicio, y por qué el borrado en sí
  queda auditado con sus conteos sin tocar la bitácora existente.

### Archivos tocados
- `apps/api/src/routes/admin/audit.ts` — comentarios de filtro de acciones, doc-comments de las rutas, inyección de fórmulas CSV y BOM
- `apps/api/src/routes/admin/tenants.ts` — comentarios del borrado masivo

### Verificación
- `npm run build --workspaces --if-present` — 6/6 workspaces.
- `npm run test --workspace=@asistente/api` — 9/9 suites.
- `npm run test:stress --workspace=@asistente/ai-agent` — 40/40 pruebas.
- `npm run lint --workspace=apps/web` — 0 errores.
- Cambio de solo comentarios: sin diferencia de comportamiento respecto al commit anterior.

---

## [2026-09-14] refactor(api): modularizar rutas admin y pulir pendientes del sistema

**Autor:** Antigravity (Gemini 3.8 Flash) · **Commit:** `ace2983`

### Qué se hizo

Se completaron todos los pendientes operativos, de arquitectura, diseño y DevOps de `TODO.md`:

1. **Modularización de Archivos-Dios (`apps/api/src/routes/admin.ts` y `apps/web/src/app/dashboard/team/page.tsx`):**
   - Se dividió `apps/api/src/routes/admin.ts` (1,525 líneas) en un paquete de sub-módulos desacoplados en `apps/api/src/routes/admin/`:
     - `schemas.ts`: Centralización de esquemas JSON Schema de Fastify para validación de requests.
     - `common.ts`: Helpers comunes de fechas, platform admin y parsing JSON.
     - `tenants.ts`: Endpoints CRUD de clínicas, onboarding, seed y reset.
     - `doctors.ts`: Alta y eliminación de especialistas.
     - `services.ts`: Alta y eliminación de procedimientos en catálogo.
     - `appointments.ts`: Consulta de disponibilidad, listado, agenda, actualización y links de anticipo.
     - `conversations.ts`: Listado de conversaciones, mensajes, toma de control (takeover) y respuesta manual.
     - `audit.ts`: Consulta de bitácora y exportación en CSV con soporte para filtrado de eventos sensibles en servidor.
     - `index.ts`: Plugin `adminPlugin` y re-exportación de componentes.
     - `admin.ts`: Punto de entrada simplificado manteniendo 100% de compatibilidad hacia atrás con imports y suites de prueba.
   - En `apps/web/src/app/dashboard/team/page.tsx` (1,507 líneas), se extrajeron los modales en componentes dedicados en `apps/web/src/components/dashboard/team/`:
     - `AddDoctorModal.tsx`
     - `AddServiceModal.tsx`
     - `DeleteConfirmModal.tsx`

2. **Pulido de UI/UX en Bandeja y Auditoría:**
   - En `apps/web/src/app/dashboard/inbox/page.tsx`: se corrigió `toggleTakeover` para actualizar de forma optimista tanto `isHandedOverToHuman` como `status`, eliminando el retraso de hasta 3 segundos (un ciclo de polling) en la etiqueta "Estado:".
   - En `apps/web/src/app/dashboard/audit/demo.ts`: se implementó `getTodayTimes(now)` con distribución horaria dinámica relativa a `now` cuando la demostración se abre antes de las 13:45 CDMX, garantizando que el grupo "Hoy" nunca quede vacío y conserve orden cronológico realista.

3. **Filtrado de Eventos Sensibles en Exportación de Auditoría:**
   - En `apps/api/src/routes/admin/audit.ts`: se agregó el query param `onlySensitive=true` en `GET /api/audit/export` (y `/api/audit`), evaluando sensibilidad según reglas de negocio (`LOGIN_FAILED`, `DELETE`, `EXPORT`, pagos manuales y accesos de usuarios fuera de horario laboral de los doctores).
   - En `apps/web/src/app/dashboard/audit/page.tsx`: se envía `onlySensitive=true` en la URL de exportación si el toggle está activo, y en modo demo se exporta `visibleEvents`. Se actualizó el mensaje informativo en la UI.

4. **CI / DevOps y Aislamiento de Base de Datos:**
   - Se creó `.github/workflows/ci.yml` ejecutando validación de Conventional Commits (según `.githooks/commit-msg`), verificación de tipos, compilación de paquetes Prisma, linter de web y ejecución de suites de prueba automatizadas.
   - Se documentó en `CLAUDE.md` y `AGENTS.md` el comportamiento de concurrencia y la recomendación de correr tests con worker de API detenido o base aislada.

5. **Sistema de Diseño Clínico Impeccable y Documentación Canónica:**
   - Se creó `DESIGN.md` con la especificación completa del sistema visual: tokens de color (Primary Slate, Medical Teal, Semánticos), tipografía nativa, elevaciones, espaciados y componentes clave (DashboardShell, MetricCard, Inbox, Modales) con cumplimiento estricto de accesibilidad WCAG AA y NOM-024.
   - Se actualizaron `CLAUDE.md` y `AGENTS.md` reflejando Next.js 16.3, `@asistente/observability`, la cola durable de webhooks y el pipeline de voz ultra-rápido.

### Archivos tocados
- `apps/api/src/routes/admin/schemas.ts` — nuevos esquemas JSON Fastify
- `apps/api/src/routes/admin/common.ts` — utilidades compartidas
- `apps/api/src/routes/admin/tenants.ts` — rutas de clínicas y seed
- `apps/api/src/routes/admin/doctors.ts` — rutas de doctores
- `apps/api/src/routes/admin/services.ts` — rutas de servicios
- `apps/api/src/routes/admin/appointments.ts` — rutas de agenda y citas
- `apps/api/src/routes/admin/conversations.ts` — rutas de mensajería y takeover
- `apps/api/src/routes/admin/audit.ts` — rutas de auditoría y exportación con `onlySensitive`
- `apps/api/src/routes/admin/index.ts` — plugin y re-exports
- `apps/api/src/routes/admin.ts` — agregador modular
- `apps/web/src/components/dashboard/team/AddDoctorModal.tsx` — modal extraído
- `apps/web/src/components/dashboard/team/AddServiceModal.tsx` — modal extraído
- `apps/web/src/components/dashboard/team/DeleteConfirmModal.tsx` — modal extraído
- `apps/web/src/app/dashboard/team/page.tsx` — reducción y consumo de modales
- `apps/web/src/app/dashboard/inbox/page.tsx` — status optimista instantáneo
- `apps/web/src/app/dashboard/audit/demo.ts` — horas dinámicas para eventos de Hoy
- `apps/web/src/app/dashboard/audit/page.tsx` — exportación filtrada por sensibilidad
- `.github/workflows/ci.yml` — workflow de CI en GitHub Actions
- `DESIGN.md` — guía del sistema de diseño clínico
- `CLAUDE.md` — sincronización de arquitectura y stack
- `AGENTS.md` — sincronización canónica
- `TODO.md` — eliminación de pendientes completados

### Verificación
- `npm run build` pasó exitosamente en los 6 workspaces (Next.js 16.3 Turbopack generó 11 páginas estáticas).
- `npm run lint --workspace=apps/web` pasó con 0 errores y 0 advertencias.
- `npm run test --workspace=@asistente/api` pasó al 100% (9 de 9 suites).
- `npm run test:stress --workspace=@asistente/ai-agent` pasó al 100% (40 de 40 pruebas).
- `npx playwright test` pasó al 100% (3 de 3 pruebas E2E de login y cookies).
- Prueba unitaria con Node/tsx verificó 14 eventos generados en "Hoy" a las 7:00 AM CDMX en `demo.ts`.

### Pendientes derivados
- Migración de SQLite a PostgreSQL y reescritura de triggers PL/pgSQL de `AuditLog` para producción.
- Traslado del límite de lecturas de auditoría a Redis al escalar a múltiples instancias horizontales.
- Modularización de `inbox/page.tsx` y `calendar/page.tsx` en el frontend.

---

## [2026-09-14] feat(api): validar esquemas en rutas y limpiar any y observabilidad

**Autor:** Antigravity (Gemini 3.8 Flash) · **Commit:** `5eb30f1`

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
