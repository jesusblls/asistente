# Construye e inicia el servidor Fastify (apps/api). Se corre con el
# contexto de build en la raíz del monorepo:
#   docker build -f apps/api/Dockerfile .
# (docker-compose.yml en la raíz ya lo hace así).

FROM node:22-slim AS build
# Prisma necesita openssl para su motor de consultas en Debian.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copiar solo los package.json primero: la capa de `npm ci` se reutiliza
# mientras no cambien las dependencias, aunque cambie el código fuente.
COPY package.json package-lock.json ./
COPY packages/observability/package.json packages/observability/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/ai-agent/package.json packages/ai-agent/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/observability packages/observability
COPY packages/database packages/database
COPY packages/shared-types packages/shared-types
COPY packages/ai-agent packages/ai-agent
COPY apps/api apps/api

# Mismo orden que el build raíz: observability y database no dependen de
# nadie más del monorepo, ai-agent depende de database, api depende de todos.
RUN npm run build --workspace=packages/observability \
  && npm run build --workspace=packages/database \
  && npm run build --workspace=packages/shared-types \
  && npm run build --workspace=packages/ai-agent \
  && npm run build --workspace=apps/api

FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

# Se copia el árbol completo (node_modules incluidos) en vez de podar a solo
# dependencias de producción: con workspaces de npm, podar de forma segura
# los symlinks entre paquetes es más frágil que el ahorro de tamaño vale la
# pena en un primer despliegue. Optimizarlo queda como mejora futura.
COPY --from=build /app /app

EXPOSE 3000
WORKDIR /app/apps/api
# `migrate deploy` es seguro de repetir en cada arranque: solo aplica lo
# pendiente y nunca reescribe una migración ya aplicada.
CMD ["sh", "-c", "npx prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma && node dist/index.js"]
