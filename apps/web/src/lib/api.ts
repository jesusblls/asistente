'use client';

/**
 * Base de la API.
 *
 * - Si `NEXT_PUBLIC_API_URL` está definida (p. ej. https://api.clinica.mx), se usa tal cual.
 * - Si no, queda vacío y las peticiones salen al mismo origen, donde el rewrite de
 *   `next.config.mjs` las proxya a la API (`API_PROXY_TARGET`). Esto es lo que permite
 *   que desarrollo y producción no dependan de URLs quemadas en el código.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

const TOKEN_KEY = 'asistente_auth_token';
const USER_KEY = 'asistente_auth_user';
const TENANT_KEY = 'asistente_auth_tenant';

export interface AuthUserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthTenantInfo {
  id: string;
  name: string;
  slug: string;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function getUser(): AuthUserInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUserInfo) : null;
  } catch {
    return null;
  }
}

export function getSessionTenant(): AuthTenantInfo | null {
  try {
    const raw = localStorage.getItem(TENANT_KEY);
    return raw ? (JSON.parse(raw) as AuthTenantInfo) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUserInfo, tenant: AuthTenantInfo): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TENANT_KEY);
  } catch {
    // Ignorar restricciones de almacenamiento del navegador.
  }
}

export function redirectToLogin(): void {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    clearSession();
    window.location.href = '/login';
  }
}

/**
 * Envoltorio de fetch que adjunta el token de sesión y expulsa al login ante 401.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    redirectToLogin();
  }
  return response;
}

export async function loginRequest(params: {
  email: string;
  password: string;
  tenantSlug?: string;
}): Promise<{ token: string; user: AuthUserInfo; tenant: AuthTenantInfo }> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo iniciar sesión');
  }
  return data;
}
