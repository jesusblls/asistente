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

> Actualizada el 2026-10-08. La versión anterior decía "sin pendientes
> abiertos", pero las entradas de bitácora del 2026-10-07 dejaron varios
> pendientes que nunca se pasaron aquí.

## Del lado del dueño (no se resuelven con código)

### Alta

- **Correo transaccional (Resend).** Crear la cuenta, verificar un dominio y
  cargar `RESEND_API_KEY` y `EMAIL_FROM` en `deploy/.env.production`. Hasta
  entonces nadie puede recuperar su contraseña en producción: el correo se
  descarta. *(e538cb7)*
- **SignalWire.** Generar un token de API válido (los reales empiezan con
  `PT`; el cargado responde 401) y cargarlo en local y producción: sin él la
  transferencia a recepción humana no funciona. Después, apuntar el número a
  producción (hoy apunta al túnel local) y comprar o portar un número **+52**
  antes de atender a una clínica real. *(1e30233)*
- **Mercado Pago.** Cargar credenciales reales y hacer una prueba completa en
  sandbox (anticipo de cita y suscripción) contra producción. *(1e30233)*
- **Datos legales.** Llenar razón social, domicilio y correo de privacidad en
  `apps/web/src/lib/legal.ts`, y que un abogado revise aviso de privacidad y
  términos antes de darlos por definitivos. *(cd0262f)*
- **Respaldos.** Instalar `deploy/backup.sh` en el cron del VPS con copia
  fuera del servidor (`BACKUP_RCLONE_REMOTE`) y hacer una restauración de
  prueba. Pasos en `deploy/README.md` § "Respaldos automáticos".

### Media

- **DeepSeek procesa datos de salud en China.** Es legal declarándolo (ya
  está en el aviso), pero es lo primero que objetaría una clínica grande o un
  abogado. Decidir si se cambia a un proveedor con procesamiento en EE. UU. o
  México. *(cd0262f)*
- **Monitor de disponibilidad externo** (UptimeRobot, Better Stack o
  similar) contra `/health` y `/login` de producción: hoy nadie se entera si
  el VPS cae fuera de horario.
- **`METRICS_TOKEN`** sin configurar en producción: `/metrics` responde 404 y
  la API lo advierte al arrancar. *(38f8446)*
- **Tamaño del pool de Postgres.** Ajustar `connection_limit` en
  `DATABASE_URL` según los núcleos del VPS y los demás proyectos que
  comparten el servidor; hoy usa el default de Prisma.

## De código

### Media

- El pie de página publica un teléfono, una dirección en Masaryk 101 y una
  razón social que parecen de ejemplo; si no son reales, quitarlos. El pie y
  la landing anuncian facturación CFDI 4.0, que no existe en el código.
  *(cd0262f — confirmar contra el PR de honestidad de la landing, abajo)*

- **`/health` no revisa la base.** Responde `ok` mientras el proceso
  escuche, así que el healthcheck de Docker y un monitor externo no detectan
  un Postgres caído. Agregar un endpoint de *readiness* con `SELECT 1` y
  usarlo en `docker-compose.yml`. *(c2a05fa)*

### Baja

- El README (setup manual, Opción B) no dice que `apps/api` y
  `packages/database` necesitan su propio `.env`. *(bd842a7)*
- Deepgram está fijo en `language=es`; la transcripción no detecta otro
  idioma.

## En curso (PRs abiertos)

Pendientes detectados en la revisión del 2026-10-08 que ya tienen un PR en
curso. Al fusionarse cada uno, bórralo de aquí.

- Recordatorios de cita.
- Flujo de anticipos (No-Show Shield).
- Transferencia a humano desde WhatsApp.
- Plan pendiente en la suscripción.
- Token del stream de voz.
- WhatsApp por clínica.
- Botón "Limpiar Citas".
- Zona horaria del calendario.
- Accesibilidad de los modales.
- Honestidad de la landing (datos de ejemplo y promesas sin código).
- Motor de fallback del agente.
- Visibilidad de trabajos muertos (`DEAD`) de la cola.
- Cobertura e2e de Playwright.
