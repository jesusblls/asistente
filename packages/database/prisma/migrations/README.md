# Migraciones de base de datos

`0001_postgres_baseline` es la fotografía del esquema Prisma completo al
migrar de SQLite a PostgreSQL (`Tenant`, citas, conversaciones, `Message`,
`ChannelConfig`, `FaqItem`, `AuditLog` y la cola durable `Job`).
`0002_audit_log_triggers` agrega los triggers de inmutabilidad de `AuditLog`
en PL/pgSQL (Prisma no puede expresar triggers en `schema.prisma`, así que se
escriben a mano — ver el propio `migration.sql` para el porqué de cada uno).

## Por qué PostgreSQL (no SQLite)

SQLite admite un solo escritor a la vez: bajo webhooks concurrentes de Meta,
Twilio y Mercado Pago más el worker de la cola de trabajos, eso es un cuello
de botella real, no teórico. PostgreSQL es el motor en todos los entornos,
incluido el desarrollo local — no hay una ruta "SQLite para dev, Postgres
para producción".

## Desarrollo local

```bash
brew install postgresql@16
brew services start postgresql@16
createdb asistente_dev
```

Ajusta `DATABASE_URL` en tu `.env` (raíz, `packages/database/.env` y
`apps/api/.env`) a algo como:

```bash
DATABASE_URL="postgresql://<tu-usuario>@localhost:5432/asistente_dev"
```

Luego aplica las migraciones:

```bash
npm run db:migrate
```

## Base de datos nueva (CI, staging, producción)

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

Aplica todas las migraciones pendientes con `prisma migrate deploy`. A
diferencia de SQLite, Postgres no requiere crear el archivo de antemano: solo
la base de datos debe existir (`CREATE DATABASE ...`) antes de migrar.

## Regla para agentes

- No edites `migration.sql` a mano para cambios de esquema: modifica
  `schema.prisma` y genera una nueva migración
  (`prisma migrate dev --name <descripcion>` en un entorno local). Los
  triggers de `AuditLog` sí se editan a mano porque Prisma no los puede
  generar — cualquier cambio a ellos necesita su propia migración manual,
  igual que `0002_audit_log_triggers`.
- Nunca ejecutes `prisma migrate reset` sobre una base de datos con datos
  reales.
- Los dos triggers (`AuditLog_no_update`, `AuditLog_retention_delete`) son la
  única protección de inmutabilidad de la bitácora: verifica que sigan
  presentes después de cualquier migración que toque la tabla `AuditLog`
  (`\d "AuditLog"` en `psql` debe listarlos).
