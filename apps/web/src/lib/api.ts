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

const TOKEN_KEY = 'asistente_auth_token'; // Clave obsoleta: se remueve de localStorage para evitar tokens expuestos
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

/**
 * @deprecated El token JWT ahora se gestiona exclusivamente en la cookie httpOnly asistente_session
 */
export function getToken(): string | null {
  return null;
}

export function isAuthenticated(): boolean {
  return Boolean(getUser());
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

export function setSession(
  userOrToken: string | AuthUserInfo,
  userOrTenant?: AuthUserInfo | AuthTenantInfo,
  maybeTenant?: AuthTenantInfo
): void {
  try {
    // Asegurar que ningún token quede en localStorage
    localStorage.removeItem(TOKEN_KEY);

    let user: AuthUserInfo | undefined;
    let tenant: AuthTenantInfo | undefined;

    if (typeof userOrToken === 'string') {
      user = userOrTenant as AuthUserInfo;
      tenant = maybeTenant;
    } else {
      user = userOrToken;
      tenant = userOrTenant as AuthTenantInfo;
    }

    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (tenant) {
      localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
      localStorage.setItem('asistente_active_tenant_id', tenant.id);
    }
  } catch {
    // Ignorar restricciones de almacenamiento del navegador.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem('asistente_active_tenant_id');
  } catch {
    // Ignorar restricciones de almacenamiento del navegador.
  }
}

export function redirectToLogin(): void {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    clearSession();
    window.location.replace('/login');
  }
}

/**
 * Envoltorio de fetch que transmite la cookie de sesión (httpOnly) y expulsa al login ante 401.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers,
  });

  if (response.status === 401) {
    redirectToLogin();
  }
  return response;
}

/** Lo que devuelve `GET /auth/me` y usa el panel (solo los campos leídos). */
export interface AuthMeResponse {
  user?: AuthUserInfo;
  isPlatformAdmin?: boolean;
  onboarding?: { step?: string | null; completedAt?: string | null };
}

let authMeInFlight: Promise<AuthMeResponse | null> | null = null;

/**
 * `GET /auth/me` compartido: si varios componentes lo piden a la vez (el
 * proveedor de clínica y la compuerta de onboarding al montar el panel), sale
 * una sola petición. Devuelve null si falla.
 */
export function fetchAuthMe(): Promise<AuthMeResponse | null> {
  if (authMeInFlight) return authMeInFlight;
  authMeInFlight = (async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/me`);
      if (!res.ok) return null;
      return (await res.json()) as AuthMeResponse;
    } catch {
      return null;
    } finally {
      authMeInFlight = null;
    }
  })();
  return authMeInFlight;
}

export async function loginRequest(params: {
  email: string;
  password: string;
  tenantSlug?: string;
}): Promise<{ token: string; user: AuthUserInfo; tenant: AuthTenantInfo }> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo iniciar sesión');
  }
  return data;
}

/**
 * Alta autoservicio de una clínica nueva con prueba gratuita.
 * Devuelve una sesión ya iniciada: el prospecto entra directo al asistente
 * de configuración en vez de tener que volver a capturar sus credenciales.
 */
export async function registerRequest(params: {
  clinicName: string;
  phoneE164: string;
  adminName: string;
  email: string;
  password: string;
  acceptedLegalVersion: string;
}): Promise<{
  token: string;
  user: AuthUserInfo;
  tenant: AuthTenantInfo;
  trialEndsAt: string;
  onboardingStep: string | null;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo crear la cuenta');
  }
  return data;
}

/**
 * Pide el enlace de recuperación. La API responde igual exista o no el
 * correo, así que el mensaje de éxito no confirma que la cuenta exista.
 */
export async function forgotPasswordRequest(email: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo enviar el enlace');
  }
  return data.message;
}

export async function resetPasswordRequest(token: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo restablecer la contraseña');
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // Ignorar errores de red en logout
  } finally {
    clearSession();
  }
}
