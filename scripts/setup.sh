#!/usr/bin/env bash
# ==============================================================================
# AsistentePro Clínicas 🇲🇽 — Script de Preparación de Entorno (Setup)
# ==============================================================================
# Prepara automáticamente todo lo necesario para correr el proyecto en una
# máquina nueva (macOS / Linux / WSL2):
#   1. Valida versiones de Node.js, npm y OpenSSL.
#   2. Activa los hooks de Git (.githooks).
#   3. Genera .env con claves criptográficas si no existe.
#   4. Comprueba conectividad a PostgreSQL (o levanta docker-compose.dev.yml si Docker corre).
#   5. Instala dependencias npm en los workspaces.
#   6. Genera cliente Prisma, ejecuta migraciones y puebla la clínica modelo (seed).
# ==============================================================================

set -euo pipefail

# Colores para la terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # Sin color

info() { echo -e "${CYAN}ℹ️  ${1}${NC}"; }
success() { echo -e "${GREEN}✅ ${1}${NC}"; }
warn() { echo -e "${YELLOW}⚠️  ${1}${NC}"; }
error() { echo -e "${RED}❌ ${1}${NC}"; }
header() { echo -e "\n${BOLD}${BLUE}=== ${1} ===${NC}"; }

echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║     AsistentePro Clínicas 🇲🇽  — Setup de Entorno      ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ------------------------------------------------------------------------------
# 1. Validación de Herramientas de Sistema
# ------------------------------------------------------------------------------
header "1. Verificando herramientas de sistema"

if ! command -v node >/dev/null 2>&1; then
  error "Node.js no está instalado. Instala Node.js v20 o v22+ (https://nodejs.org)."
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Se requiere Node.js v20 o superior. Versión actual: $(node -v)"
  exit 1
fi
success "Node.js $(node -v) detectado."

if ! command -v npm >/dev/null 2>&1; then
  error "npm no está instalado."
  exit 1
fi
success "npm v$(npm -v) detectado."

if ! command -v openssl >/dev/null 2>&1; then
  warn "OpenSSL no está en PATH. Prisma y la generación de claves podrían requerirlo."
fi

# ------------------------------------------------------------------------------
# 2. Configuración de Git Hooks
# ------------------------------------------------------------------------------
header "2. Configurando Git Hooks"

if [ -d ".git" ]; then
  git config core.hooksPath .githooks
  success "Git hooks configurados (.githooks/commit-msg activo para Conventional Commits)."
else
  warn "No se detectó directorio .git (parece que no es un clon de Git). Omitiendo hooks."
fi

# ------------------------------------------------------------------------------
# 3. Configuración de Variables de Entorno (.env)
# ------------------------------------------------------------------------------
header "3. Verificando archivo de entorno (.env)"

if [ ! -f ".env" ]; then
  info "No existe .env. Creando uno a partir de .env.example..."
  cp .env.example .env

  # Generar claves criptográficas seguras
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  CRED_KEY=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  ADMIN_PASS="CambiaEstaContrasena2026!"

  # Reemplazar de forma portable usando Node.js
  node -e "
    const fs = require('fs');
    let env = fs.readFileSync('.env', 'utf8');
    
    // Asignar DATABASE_URL por defecto para dev
    env = env.replace(
      /DATABASE_URL=.*/,
      'DATABASE_URL=\"postgresql://asistente:asistente_dev_secret_2026@localhost:5432/asistente_dev\"'
    );
    // Asignar JWT_SECRET
    env = env.replace(
      /JWT_SECRET=.*/,
      'JWT_SECRET=${JWT_SECRET}'
    );
    // Asignar CREDENTIALS_ENCRYPTION_KEY
    env = env.replace(
      /CREDENTIALS_ENCRYPTION_KEY=.*/,
      'CREDENTIALS_ENCRYPTION_KEY=${CRED_KEY}'
    );
    // Asignar SEED_ADMIN_PASSWORD
    env = env.replace(
      /SEED_ADMIN_PASSWORD=.*/,
      'SEED_ADMIN_PASSWORD=\"${ADMIN_PASS}\"'
    );
    
    fs.writeFileSync('.env', env);
  "
  success "Archivo .env creado con secretos autogenerados:"
  info "  - JWT_SECRET: configurado (64 caracteres hex)"
  info "  - CREDENTIALS_ENCRYPTION_KEY: configurado (AES-256 base64)"
  info "  - SEED_ADMIN_PASSWORD: ${ADMIN_PASS}"
else
  success "Archivo .env existente detectado. Se mantienen tus configuraciones."
fi

# ------------------------------------------------------------------------------
# 4. Verificación de Base de Datos (PostgreSQL)
# ------------------------------------------------------------------------------
header "4. Verificando conectividad a PostgreSQL"

# Leer DATABASE_URL del .env
DB_URL=$(node -e "
  const fs = require('fs');
  const content = fs.readFileSync('.env', 'utf8');
  const match = content.match(/^DATABASE_URL=[\"']?([^\"'\r\n]+)[\"']?/m);
  console.log(match ? match[1] : '');
")

# Extraer host y puerto
DB_HOST=$(node -e "
  try {
    const url = new URL(process.argv[1]);
    console.log(url.hostname || 'localhost');
  } catch {
    console.log('localhost');
  }
" "$DB_URL")

DB_PORT=$(node -e "
  try {
    const url = new URL(process.argv[1]);
    console.log(url.port || '5432');
  } catch {
    console.log('5432');
  }
" "$DB_URL")

info "Probando conexión con PostgreSQL en ${DB_HOST}:${DB_PORT}..."

check_db_port() {
  node -e "
    const net = require('net');
    const client = net.createConnection({ host: '${DB_HOST}', port: ${DB_PORT}, timeout: 2000 }, () => {
      client.end();
      process.exit(0);
    });
    client.on('error', () => process.exit(1));
    client.on('timeout', () => { client.destroy(); process.exit(1); });
  " >/dev/null 2>&1
}

if check_db_port; then
  success "PostgreSQL responde en ${DB_HOST}:${DB_PORT}."
else
  warn "PostgreSQL no responde en ${DB_HOST}:${DB_PORT}."

  # Verificar si Docker está disponible y corriendo
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    info "Docker está corriendo. Levantando contenedor PostgreSQL vía docker-compose.dev.yml..."
    docker compose -f docker-compose.dev.yml up -d postgres redis
    
    info "Esperando a que PostgreSQL esté listo..."
    MAX_ATTEMPTS=15
    ATTEMPT=1
    while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
      if check_db_port; then
        success "PostgreSQL listo en contenedor Docker."
        break
      fi
      sleep 2
      ATTEMPT=$((ATTEMPT + 1))
    done

    if [ $ATTEMPT -gt $MAX_ATTEMPTS ]; then
      error "PostgreSQL no respondió a tiempo en Docker."
      exit 1
    fi
  else
    echo -e "${YELLOW}"
    echo "  PostgreSQL no está activo en ${DB_HOST}:${DB_PORT} y Docker no está en ejecución."
    echo "  Para resolverlo:"
    echo "    1) Si tienes Docker: inicia Docker Desktop y ejecuta: npm run dev:db"
    echo "    2) Si usas Homebrew (macOS): brew services start postgresql@16"
    echo "    3) Si usas Linux: sudo systemctl start postgresql"
    echo "    4) Recuerda crear la base de datos si es local: createdb asistente_dev"
    echo -e "${NC}"
    error "No se pudo conectar a la base de datos. Inicia PostgreSQL y vuelve a correr npm run setup."
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 5. Instalación de Dependencias
# ------------------------------------------------------------------------------
header "5. Instalando dependencias del monorepo"

info "Ejecutando npm install..."
npm install
success "Dependencias instaladas."

# ------------------------------------------------------------------------------
# 6. Compilación de Paquetes y Base de Datos (Prisma)
# ------------------------------------------------------------------------------
header "6. Inicializando base de datos y paquetes"

info "Generando cliente de Prisma..."
npm run db:generate

info "Aplicando migraciones SQL..."
npm run db:migrate

info "Poblando datos semilla (Clínica modelo Polanco + Admin)..."
npm run db:seed

# ------------------------------------------------------------------------------
# 7. Resumen de Éxito
# ------------------------------------------------------------------------------
header "🎉 ¡Entorno preparado con éxito!"

ADMIN_EMAIL=$(node -e "
  const fs = require('fs');
  const content = fs.readFileSync('.env', 'utf8');
  const match = content.match(/^SEED_ADMIN_EMAIL=[\"']?([^\"'\r\n]+)[\"']?/m);
  console.log(match ? match[1] : 'admin@sonrisaspolanco.mx');
")

echo -e "${GREEN}El proyecto está 100% configurado y listo para desarrollo.${NC}\n"
echo -e "${BOLD}Acceso al Dashboard Clínico:${NC}"
echo -e "  🌐 URL:      ${CYAN}http://localhost:3001/login${NC}"
echo -e "  👤 Correo:   ${BOLD}${ADMIN_EMAIL}${NC}"
echo -e "  🔑 Clave:    (la configurada en SEED_ADMIN_PASSWORD dentro de .env)"
echo ""
echo -e "${BOLD}Cómo arrancar la plataforma:${NC}"
echo -e "  ${BOLD}Opción recomendada (2 terminales):${NC}"
echo -e "    Terminal 1 (Backend API Fastify):  ${CYAN}npm run dev:api${NC}  (puerto 3000)"
echo -e "    Terminal 2 (Frontend Web Next.js): ${CYAN}npm run dev:web${NC}  (puerto 3001)"
echo ""
echo -e "  ${BOLD}Si usas contenedores para la BD:${NC}"
echo -e "    Levantar BD + Redis:  ${CYAN}npm run dev:db${NC}"
echo -e "    Detener BD + Redis:   ${CYAN}npm run dev:db:down${NC}"
echo ""
echo -e "  ${BOLD}Para correr las pruebas:${NC}"
echo -e "    Todas las suites:     ${CYAN}npm test${NC}"
echo -e "    Estrés y colisiones:  ${CYAN}npm run test:stress${NC}"
echo ""
