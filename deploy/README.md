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
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, y los tres secretos de webhooks
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
- **Actualizar tras cambios**: `git pull` en `~/apps/asistente` y volver a
  correr el `docker compose ... up -d --build` de la opción que uses.
