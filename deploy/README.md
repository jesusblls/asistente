# Despliegue en un VPS (Docker Compose)

Un solo VPS corre todo el stack como contenedores: Postgres, Redis, la API
(Fastify), el panel (Next.js) y Caddy como entrada única en el puerto 80/443.
Sin dominio todavía, Caddy sirve por HTTP plano en la IP del VPS; en cuanto
haya un dominio apuntando ahí, HTTPS se activa cambiando una sola variable
(`SITE_ADDRESS`), sin tocar Dockerfiles ni el Caddyfile.

## 1. Requisitos en el VPS

```bash
curl -fsSL https://get.docker.com | sh
```

Esto instala Docker Engine con el plugin `docker compose` incluido.

## 2. Clonar y configurar

```bash
git clone <url-del-repo> asistente
cd asistente
cp deploy/.env.production.example deploy/.env.production
```

Edita `deploy/.env.production` y rellena, como mínimo, las variables
obligatorias (el propio archivo trae los comandos `openssl` para generarlas):
`POSTGRES_PASSWORD`, `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`,
`PUBLIC_API_HOST` (la IP del VPS), `CORS_ORIGINS` (`http://<ip-del-vps>`),
`PLATFORM_ADMIN_EMAILS`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, y los tres
secretos de webhooks (`META_APP_SECRET`, `TWILIO_AUTH_TOKEN`,
`MERCADOPAGO_WEBHOOK_SECRET` — un valor de relleno sirve hasta que conectes
esa integración real; env.ts rechaza el arranque en producción si faltan).

Las integraciones externas (`GEMINI_API_KEY`, `META_WHATSAPP_TOKEN`,
`TWILIO_ACCOUNT_SID`, etc.) pueden quedar vacías: el sistema arranca igual en
modo simulación, como en desarrollo.

**Mientras no tengas un dominio**, deja `COOKIE_SECURE=false` (ya viene así en
el ejemplo). Sin esto, el navegador descarta la cookie de sesión sobre HTTP
plano y el login parece fallar sin ningún error visible.

## 3. Levantar el stack

```bash
docker compose --env-file deploy/.env.production up -d --build
```

Esto construye las imágenes de `api` y `web`, y levanta los 5 contenedores
(`postgres`, `redis`, `api`, `web`, `caddy`). La API corre
`prisma migrate deploy` automáticamente al arrancar; no hace falta migrar a
mano.

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
curl -I http://<ip-del-vps>/login
```

Debe responder `200`. Entra desde el navegador a `http://<ip-del-vps>/login`
con las credenciales del paso 4.

## 6. Cuando tengas un dominio

En `deploy/.env.production`:

```bash
SITE_ADDRESS=clinica.mx
COOKIE_SECURE=true   # o bórrala: "true" es el valor por defecto en producción
```

```bash
docker compose --env-file deploy/.env.production up -d
```

Caddy saca el certificado HTTPS de Let's Encrypt automáticamente al
reiniciar — no hace falta tocar el Caddyfile ni el resto de la configuración.

## Notas operativas

- **Backups**: `postgres_data` es un volumen con nombre de Docker. Respaldar
  con `docker run --rm -v asistente_postgres_data:/data -v $(pwd):/backup
  alpine tar czf /backup/postgres_backup.tar.gz /data` (con los contenedores
  detenidos, o usando `pg_dump` en caliente).
- **Logs**: `docker compose logs -f api` / `web` / `caddy`.
- **Actualizar tras un `git pull`**:
  `docker compose --env-file deploy/.env.production up -d --build`.
