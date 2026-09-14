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
