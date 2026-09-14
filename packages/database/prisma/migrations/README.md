# Migraciones de base de datos

`0001_baseline` es la fotografía del esquema Prisma al momento de introducir
migraciones versionadas (incluye `Tenant`, citas, conversaciones, `Message`,
`ChannelConfig`, `FaqItem` y la cola durable `Job`).

## Base de datos nueva (CI, staging, producción)

```bash
DATABASE_URL="file:./dev.db" npm run db:migrate
```

Aplica todas las migraciones pendientes con `prisma migrate deploy`.
En SQLite el archivo de base de datos debe existir antes de migrar; si es
totalmente nuevo, créalo vacío primero:

```bash
node -e "require('fs').writeFileSync('packages/database/prisma/dev.db','')"
npm run db:migrate
```

## Base de datos de desarrollo ya existente (creada con `prisma db push`)

La BD local ya tiene las tablas, así que el baseline debe marcarse como aplicado
en lugar de ejecutarse:

```bash
cd packages/database
npx prisma migrate resolve --applied 0001_baseline
```

Después de eso, `npm run db:migrate:status` debe reportar el esquema al día.

## Regla para agentes

- No edites `migration.sql` a mano: modifica `schema.prisma` y genera una nueva
  migración (`prisma migrate dev --name <descripcion>` en un entorno local).
- Nunca ejecutes `prisma migrate reset` sobre una BD con datos reales.
