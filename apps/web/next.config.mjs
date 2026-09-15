/** @type {import('next').NextConfig} */
const apiProxyTarget = process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL;
const isProduction = process.env.NODE_ENV === 'production';

// Next evalúa este archivo varias veces por build; el aviso se emite una sola vez.
if (isProduction && !apiProxyTarget && !globalThis.__asistenteProxyWarned) {
  globalThis.__asistenteProxyWarned = true;
  console.warn(
    '[next.config] API_PROXY_TARGET / NEXT_PUBLIC_API_URL no configurados: el rewrite /api/* queda deshabilitado ' +
      'en producción. Define NEXT_PUBLIC_API_URL en el build del panel para que alcance la API.'
  );
}

const nextConfig = {
  // Imagen de Docker autocontenida: copia solo lo que `next start` necesita
  // en vez del monorepo completo con todos sus node_modules de workspace.
  output: 'standalone',
  // Evita que Next genere AGENTS.md/CLAUDE.md dentro de apps/web (la
  // especificación canónica vive en la raíz del monorepo).
  agentRules: false,
  // Playwright y el navegador pueden alcanzar el dev server por 127.0.0.1;
  // Next bloquea /_next/* para orígenes no listados y la página no hidrata.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites() {
    if (!apiProxyTarget) {
      // En desarrollo el rewrite a la API local evita CORS y permite rutas relativas.
      return isProduction
        ? []
        : [
            {
              source: '/api/:path*',
              destination: 'http://localhost:3000/api/:path*',
            },
            {
              source: '/auth/:path*',
              destination: 'http://localhost:3000/auth/:path*',
            },
          ];
    }
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${apiProxyTarget}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
