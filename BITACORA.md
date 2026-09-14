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

## [2026-09-13] fix(seguridad): corregir 11 hallazgos de la auditoría inicial

**Autor:** Claude Opus 5 (sesión de auditoría) · **Commits:** ver más abajo

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
