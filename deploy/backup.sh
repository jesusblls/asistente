#!/usr/bin/env bash
#
# Respaldo diario de la base de producción (pg_dump comprimido).
#
# Pensado para cron en el VPS (ver deploy/README.md, sección "Respaldos
# automáticos"). Sale con código distinto de 0 ante cualquier falla, para que
# cron lo reporte por correo y para que nunca quede un archivo vacío o a
# medias haciéndose pasar por respaldo bueno.
#
# Variables (todas opcionales):
#   ASISTENTE_DIR            Clon del proyecto.             (~/apps/asistente)
#   BACKUP_COMPOSE_MODE      "proxy" (Opción B) o "standalone" (Opción A). (proxy)
#   BACKUP_DIR               Carpeta de respaldos.          (~/backups)
#   BACKUP_RETENTION_DAYS    Días que se conservan.         (14)
#   BACKUP_RCLONE_REMOTE     Destino de rclone para copia fuera del VPS,
#                            p. ej. "b2:asistente-backups". Vacío = sin copia.
#   POSTGRES_USER / POSTGRES_DB  Si no se definen, se leen de
#                            deploy/.env.production; si tampoco están ahí,
#                            "asistente" (los mismos defaults del compose).

set -euo pipefail

# Antes de crear cualquier archivo: el volcado trae datos de pacientes y
# hashes de contraseñas. Sin esto queda legible para cualquier usuario del
# servidor (pasó con el respaldo manual del 2026-10-07, ver BITACORA.md).
umask 077

ASISTENTE_DIR="${ASISTENTE_DIR:-$HOME/apps/asistente}"
BACKUP_COMPOSE_MODE="${BACKUP_COMPOSE_MODE:-proxy}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
ENV_FILE="deploy/.env.production"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  fail "BACKUP_RETENTION_DAYS debe ser un entero >= 1 (recibido: '$BACKUP_RETENTION_DAYS')"
fi

# Se revisa antes de volcar: descubrir que falta rclone después de un dump de
# varios minutos solo retrasa el aviso.
if [[ -n "$BACKUP_RCLONE_REMOTE" ]] && ! command -v rclone >/dev/null 2>&1; then
  fail "BACKUP_RCLONE_REMOTE definido pero rclone no está instalado"
fi

cd "$ASISTENTE_DIR" || fail "no existe ASISTENTE_DIR=$ASISTENTE_DIR"
[[ -f "$ENV_FILE" ]] || fail "no existe $ASISTENTE_DIR/$ENV_FILE"

# Lee una variable de .env.production sin ejecutar el archivo (no se hace
# `source`: es un archivo de datos, no un script).
env_value() {
  local value
  value="$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}
POSTGRES_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-asistente}"
POSTGRES_DB="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-asistente}"

# Debe coincidir con la forma en que se levantó el stack: con otros -f, Compose
# no encuentra el mismo proyecto/servicio o valida otra configuración.
case "$BACKUP_COMPOSE_MODE" in
  proxy)
    DC=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f deploy/docker-compose.proxy-externo.yml) ;;
  standalone)
    DC=(docker compose --env-file "$ENV_FILE" --profile standalone) ;;
  *)
    fail "BACKUP_COMPOSE_MODE debe ser 'proxy' o 'standalone' (recibido: '$BACKUP_COMPOSE_MODE')" ;;
esac

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FINAL="$BACKUP_DIR/asistente-auto-$STAMP.sql.gz"
# Se escribe primero a un nombre temporal y se renombra solo si todo salió
# bien: así la retención y la copia externa nunca ven un respaldo a medias.
TMP="$BACKUP_DIR/.asistente-auto-$STAMP.sql.gz.partial"
trap 'rm -f "$TMP"' EXIT

log "Volcando $POSTGRES_DB (modo $BACKUP_COMPOSE_MODE)..."
# pipefail hace que una falla de pg_dump (o de docker) tumbe el pipeline
# aunque gzip termine bien.
"${DC[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB" \
  | gzip -9 > "$TMP" \
  || fail "pg_dump falló; no se generó respaldo"

# Un pg_dump que "termina bien" sin datos (base equivocada, servicio
# reiniciándose) produciría un gzip válido pero inútil.
# Las revisiones corren con pipefail apagado: `grep -q` corta la lectura en
# cuanto encuentra la línea, gzip recibe SIGPIPE y, con pipefail, eso
# contaría como falla aunque el respaldo esté bien.
gzip -t "$TMP" || fail "el archivo comprimido está corrupto"
if ! (set +o pipefail; gzip -dc "$TMP" | head -n 50 | grep -q 'PostgreSQL database dump'); then
  fail "el volcado no parece un dump de PostgreSQL"
fi
if ! (set +o pipefail; gzip -dc "$TMP" | grep -q '^CREATE TABLE'); then
  fail "el volcado no contiene ninguna tabla"
fi

mv "$TMP" "$FINAL"
trap - EXIT
log "Respaldo listo: $FINAL ($(du -h "$FINAL" | cut -f1))"

if [[ -n "$BACKUP_RCLONE_REMOTE" ]]; then
  log "Copiando a $BACKUP_RCLONE_REMOTE..."
  rclone copy "$FINAL" "$BACKUP_RCLONE_REMOTE" || fail "falló la copia externa a $BACKUP_RCLONE_REMOTE"
fi

# La retención va al final y solo tras un respaldo exitoso: si el volcado de
# hoy falla, no se borra ninguno de los anteriores. Solo toca los archivos
# `asistente-auto-*` de este script: los respaldos manuales previos a una
# actualización (`asistente-<fecha>.sql.gz`, ver README) no se borran solos.
# -mtime +N: modificados hace más de N*24 h.
DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'asistente-auto-*.sql.gz' \
  -mtime +"$BACKUP_RETENTION_DAYS" -print -delete)"
if [[ -n "$DELETED" ]]; then
  log "Eliminados por retención (> $BACKUP_RETENTION_DAYS días):"
  printf '%s\n' "$DELETED"
fi
