# Construye e inicia el panel Next.js (apps/web) usando salida standalone.
# Se corre con el contexto de build en la raíz del monorepo:
#   docker build -f apps/web/Dockerfile .
# (docker-compose.yml en la raíz ya lo hace así).

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web

# Opcional: solo hace falta si el navegador debe llamar a la API por una URL
# propia (p. ej. una API en otro subdominio). NEXT_PUBLIC_API_URL queda
# "horneado" en el bundle del navegador porque Next.js resuelve las
# variables NEXT_PUBLIC_* en build, no en runtime.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# API_PROXY_TARGET también debe ser build-arg, no variable de runtime: Next
# evalúa rewrites() una sola vez durante `next build` y congela el resultado
# en routes-manifest.json dentro de .next/standalone — definirla solo en el
# `environment:` del contenedor en docker-compose.yml no tiene ningún efecto
# porque el server ya arrancó con el rewrite vacío. El navegador llama a
# rutas relativas del mismo origen y es el propio servidor de Next quien las
# reenvía a la API por la red interna de Docker.
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
ENV NODE_ENV=production
RUN npm run build --workspace=packages/shared-types \
  && npm run build --workspace=apps/web

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# La salida "standalone" de Next ya trae un node_modules podado a lo que el
# servidor necesita en runtime; solo faltan los estáticos y `public/`, que
# el propio Next excluye de standalone a propósito.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3001
CMD ["node", "apps/web/server.js"]
