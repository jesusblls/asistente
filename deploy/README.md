# Despliegue en un VPS (Docker Compose)

Postgres, Redis, la API (Fastify) y el panel (Next.js) corren como
contenedores en el mismo VPS. Hay dos formas de exponerlos al exterior, según
si el VPS es solo para esto o ya corres otros proyectos ahí:

- **Opción A — VPS dedicado**: Caddy viene incluido y toma los puertos 80/443
  para sí solo. Sin dominio todavía, sirve por HTTP plano en la IP del VPS;
  con un dominio apuntando ahí, HTTPS se activa cambiando una sola variable.
- **Opción B — VPS compartido**: ya tienes un reverse proxy propio (Caddy,
  Traefik, nginx...) con 80/443 tomados por otros proyectos. AsistentePro no
  trae su propio Caddy; se conecta a la red Docker de tu proxy existente para
  que le haga `reverse_proxy` por nombre de contenedor, igual que a tus otros
  proyectos.

## 1. Requisitos en el VPS

```bash
curl -fsSL https://get.docker.com | sh
```

Esto instala Docker Engine con el plugin `docker compose` incluido.

## 2. Clonar el código y configurar

```bash
git clone https://github.com/jesusblls/asistente.git ~/apps/asistente
cd ~/apps/asistente
cp deploy/.env.production.example deploy/.env.production
```

Edita `deploy/.env.production` y rellena, como mínimo, las variables
obligatorias (el propio archivo trae los comandos `openssl` para generarlas):
`POSTGRES_PASSWORD`, `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`,
`PUBLIC_API_HOST`, `CORS_ORIGINS`, `PLATFORM_ADMIN_EMAILS`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `VOICE_STREAM_TOKEN`
(`openssl rand -hex 32`, aunque todavía no conectes telefonía), y los tres secretos de webhooks
(`META_APP_SECRET`, `TWILIO_AUTH_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` — un
valor de relleno sirve hasta que conectes esa integración real; env.ts
rechaza el arranque en producción si faltan).

Las integraciones externas (`DEEPSEEK_API_KEY`, `META_WHATSAPP_TOKEN`,
`TWILIO_ACCOUNT_SID`, etc.) pueden quedar vacías: el sistema arranca igual en
modo simulación, como en desarrollo.

## 3a. Levantar el stack — Opción A (VPS dedicado)

`PUBLIC_API_HOST`/`CORS_ORIGINS` con la IP del VPS. Mientras no tengas
dominio, deja `COOKIE_SECURE=false` (ya viene así en el ejemplo) — sin esto,
el navegador descarta la cookie de sesión sobre HTTP plano y el login parece
fallar sin ningún error visible.

```bash
docker compose --env-file deploy/.env.production --profile standalone up -d --build
```

Levanta los 5 contenedores (`postgres`, `redis`, `api`, `web`, `caddy`). Con
un dominio apuntando al VPS, en `deploy/.env.production`:

```bash
SITE_ADDRESS=clinica.mx
COOKIE_SECURE=true   # o bórrala: "true" es el valor por defecto en producción
```

y `docker compose --env-file deploy/.env.production --profile standalone up -d`
— Caddy saca el certificado de Let's Encrypt solo, sin tocar Caddyfile ni el
resto de la configuración.

## 3b. Levantar el stack — Opción B (VPS compartido)

Como ya hay HTTPS real vía tu proxy existente (Let's Encrypt, o el que uses),
`COOKIE_SECURE` puede quedar sin definir (usa el default de producción:
`true`) — no hace falta `COOKIE_SECURE=false` aquí, a diferencia de la Opción A.

Revisa el nombre de la red Docker externa de tu proxy (`docker network ls`;
en el ejemplo de abajo se llama `proxy`) y ponlo en `deploy/.env.production`
si es distinto:

```bash
PROXY_NETWORK_NAME=proxy
```

```bash
docker compose --env-file deploy/.env.production \
  -f docker-compose.yml -f deploy/docker-compose.proxy-externo.yml \
  up -d --build
```

Esto levanta `postgres`, `redis`, `api` y `web` (sin Caddy propio: el
`profiles: standalone` del Caddy embebido no se activa al omitir
`--profile`), y conecta `api`/`web` a tu red de proxy.

Agrega un bloque nuevo a tu Caddyfile (o la config de tu proxy) apuntando al
hostname que quieras usar, por nombre de contenedor — ej. con sslip.io para
tener HTTPS real sin comprar dominio:

```caddyfile
asistente.<ip-con-guiones>.sslip.io {
	encode zstd gzip
	handle /webhooks/* {
		reverse_proxy asistente-api-1:3000
	}
	handle /voice/* {
		reverse_proxy asistente-api-1:3000
	}
	handle {
		reverse_proxy asistente-web-1:3001
	}
}
```

(Los nombres de contenedor `asistente-api-1` / `asistente-web-1` asumen que
el directorio del proyecto se llama `asistente` — Compose los prefija con el
nombre del proyecto; confirma con `docker ps` si los tuyos difieren.)

Recarga tu proxy (con Caddy: `docker exec <contenedor-caddy> caddy reload
--config /etc/caddy/Caddyfile`, valida la sintaxis antes de aplicar y no
reinicia el proceso si falla — no afecta a tus otros dominios si el bloque
nuevo tiene un error).

## 4. Sembrar el primer administrador (una sola vez)

La base de datos arranca vacía — sin esto no hay ningún usuario con el que
entrar. Este paso solo se corre **una vez**, en el primer despliegue contra
una base de datos nueva (no está automatizado a propósito: no debe repetirse
en cada reinicio del contenedor):

```bash
docker compose --env-file deploy/.env.production exec -w /app api \
  npx tsx packages/database/src/seed.ts
```

Crea la clínica modelo ("Clínica Dental Sonrisas Polanco") y el usuario
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` que definiste en el paso 2. Desde
el panel, con sesión de ADMIN, se puede dar de alta la clínica real con
**"+ Crear Nueva Clínica"** y editar o dejar la clínica modelo como
demostración comercial (ver CLAUDE.md § 1.6).

## 5. Verificar

```bash
curl -I https://<tu-host>/login
```

Debe responder `200`. Entra desde el navegador con las credenciales del
paso 4.

## Notas operativas

- **Backups**: `postgres_data` es un volumen con nombre de Docker (prefijado
  con el nombre del proyecto, ej. `asistente_postgres_data`). Respaldar con
  `docker run --rm -v asistente_postgres_data:/data -v $(pwd):/backup alpine
  tar czf /backup/postgres_backup.tar.gz /data` (con los contenedores
  detenidos, o usando `pg_dump` en caliente).
- **Logs**: `docker compose logs -f api` / `web`.

## Actualizar a una versión nueva

La API aplica las migraciones pendientes sola al arrancar
(`prisma migrate deploy` en el comando del contenedor). Por eso el respaldo va
**antes** de levantar la versión nueva, no después. Los ejemplos usan la
Opción B; en la Opción A cambia los `-f` por `--profile standalone`.

```bash
cd ~/apps/asistente
DC="docker compose --env-file deploy/.env.production -f docker-compose.yml -f deploy/docker-compose.proxy-externo.yml"

# 1. Respaldo. umask 077: el archivo trae datos de pacientes y hashes de
#    contraseñas; sin esto queda legible para cualquier usuario del servidor.
mkdir -p ~/backups
(umask 077; $DC exec -T postgres pg_dump -U asistente asistente \
  | gzip > ~/backups/asistente-$(date +%Y%m%d-%H%M%S).sql.gz)

# 2. Código nuevo. Anota el commit actual: es tu punto de rollback.
git rev-parse --short HEAD
git fetch origin && git merge --ff-only origin/main

# 3. Construir mientras la versión anterior sigue atendiendo.
$DC config --quiet && $DC build api web

# 4. Reemplazar solo api y web (Postgres y Redis no se reinician).
$DC up -d --no-deps api web
$DC logs --tail 50 api
```

Si el arranque falla con *"Error fatal de configuración"*, la versión nueva
exige una variable que tu `deploy/.env.production` todavía no tiene (el
mensaje dice cuál). Desde octubre de 2026, por ejemplo, `VOICE_STREAM_TOKEN`
es obligatoria: agrégala con `openssl rand -hex 32` y vuelve a levantar.
`$DC config --quiet` del paso 3 ya lo detecta antes de construir.

Revisa en el log que las migraciones se aplicaron y que no hay errores al
arrancar, y entra al panel.

**Rollback:** `git checkout <commit-anotado>` y repite los pasos 3 y 4. Las
migraciones de este repositorio solo agregan tablas y columnas, así que la
versión anterior funciona sobre la base ya migrada. Si alguna migración
borrara o renombrara algo, restaura el respaldo:
`gunzip -c ~/backups/<archivo>.sql.gz | $DC exec -T postgres psql -U asistente asistente`.

Si `git pull` responde *"There is no tracking information"*, el clon del
servidor no tiene rama de seguimiento. Usa el `fetch` + `merge --ff-only` de
arriba, que además se niega a mezclar si alguien editó archivos a mano en el
servidor.
