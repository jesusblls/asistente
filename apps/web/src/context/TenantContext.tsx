'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, apiFetch, fetchAuthMe, isAuthenticated, getSessionTenant } from '../lib/api';

export type DashboardMode = 'live' | 'demo';

export interface DoctorItem {
  id: string;
  name: string;
  specialty: string;
  phone?: string | null;
  email?: string | null;
  calendarId?: string | null;
  availabilityRules?: string | null;
  isActive?: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceMxn: number;
  requiredDepositMxn: number;
  category?: string | null;
  isActive?: boolean;
}

export interface TenantItem {
  id: string;
  name: string;
  slug: string;
  phoneE164: string;
  address?: string | null;
  timezone: string;
  doctors: DoctorItem[];
  services: ServiceItem[];
  welcomeMessage?: string | null;
  emergencyInstructions?: string | null;
  surveyEnabled?: boolean;
  publicBookingEnabled?: boolean;
  recallMonths?: number | null;
}

interface TenantContextType {
  mode: DashboardMode;
  setMode: (mode: DashboardMode) => void;
  tenants: TenantItem[];
  activeTenant: TenantItem | null;
  activeTenantId: string;
  setActiveTenantId: (id: string) => void;
  loadingTenants: boolean;
  refreshTenants: () => Promise<void>;
  createTenant: (data: {
    name: string;
    phoneE164?: string;
    city?: string;
    address?: string;
  }) => Promise<TenantItem | null>;
  updateTenant: (id: string, data: Partial<TenantItem>) => Promise<TenantItem | null>;
  seedTenantData: (tenantId: string) => Promise<SandboxActionResult>;
  resetTenantData: (tenantId: string) => Promise<SandboxActionResult>;
  /**
   * Si la sesión es de un administrador de plataforma (`PLATFORM_ADMIN_EMAILS`).
   * Solo ellos ven `+ Citas Demo` y `Limpiar`; la API lo vuelve a verificar.
   */
  isPlatformAdmin: boolean;
  /** Sube tras sembrar o limpiar la clínica: las vistas lo usan para recargar. */
  dataVersion: number;
}

export interface SandboxActionResult {
  ok: boolean;
  /** Mensaje listo para mostrar en un toast, de éxito o de error. */
  message: string;
}

async function readSandboxResult(res: Response, fallbackError: string): Promise<SandboxActionResult> {
  let body: { message?: string; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // Respuesta sin JSON (p. ej. un proxy caído): se usa el mensaje genérico.
  }
  if (res.ok) return { ok: true, message: body.message || 'Listo' };
  return { ok: false, message: body.error || body.message || fallbackError };
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DashboardMode>(() => {
    if (typeof window === 'undefined') return 'live';
    try {
      const saved = localStorage.getItem('asistente_dashboard_mode') as DashboardMode;
      return saved === 'live' || saved === 'demo' ? saved : 'live';
    } catch {
      return 'live';
    }
  });
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem('asistente_active_tenant_id') || '';
    } catch {
      return '';
    }
  });
  const [loadingTenants, setLoadingTenants] = useState<boolean>(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const setMode = useCallback((newMode: DashboardMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem('asistente_dashboard_mode', newMode);
    } catch (e) {}
  }, []);

  const setActiveTenantId = useCallback((id: string) => {
    setActiveTenantIdState(id);
    try {
      localStorage.setItem('asistente_active_tenant_id', id);
    } catch (e) {}
  }, []);

  // Cargar lista de tenants desde la API
  const refreshTenants = useCallback(async () => {
    if (!isAuthenticated()) {
      setLoadingTenants(false);
      return;
    }
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/tenants`);
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
        if (data.length > 0) {
          const sessionTenant = getSessionTenant();
          setActiveTenantIdState((prev) => {
            const exists = data.some((t: TenantItem) => t.id === prev);
            const sessionMatch = sessionTenant
              ? data.find((t: TenantItem) => t.id === sessionTenant.id || t.slug === sessionTenant.slug)
              : undefined;
            const chosen = exists ? prev : (sessionMatch ? sessionMatch.id : data[0].id);
            try {
              localStorage.setItem('asistente_active_tenant_id', chosen);
            } catch (e) {}
            return chosen;
          });
        }
      }
    } catch (err) {
      console.error('Error cargando tenants:', err);
    } finally {
      setLoadingTenants(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!isAuthenticated()) {
        if (active) setLoadingTenants(false);
        return;
      }
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/tenants`);
        if (active && res.ok) {
          const data = await res.json();
          setTenants(data);
          if (data.length > 0) {
            const sessionTenant = getSessionTenant();
            setActiveTenantIdState((prev) => {
              const exists = data.some((t: TenantItem) => t.id === prev);
              const sessionMatch = sessionTenant
                ? data.find((t: TenantItem) => t.id === sessionTenant.id || t.slug === sessionTenant.slug)
                : undefined;
              const chosen = exists ? prev : (sessionMatch ? sessionMatch.id : data[0].id);
              try {
                localStorage.setItem('asistente_active_tenant_id', chosen);
              } catch (e) {}
              return chosen;
            });
          }
        }
      } catch (err) {
        if (active) console.error('Error cargando tenants:', err);
      } finally {
        if (active) setLoadingTenants(false);
      }
    };
    const loadSessionFlags = async () => {
      if (!isAuthenticated()) return;
      // Sin respuesta (null) se asume que no es administrador de plataforma:
      // las herramientas destructivas quedan ocultas, nunca expuestas por error.
      const data = await fetchAuthMe();
      if (active) setIsPlatformAdmin(data?.isPlatformAdmin === true);
    };
    init();
    loadSessionFlags();
    return () => {
      active = false;
    };
  }, []);

  // Crear nuevo cliente
  const createTenant = useCallback(
    async (data: { name: string; phoneE164?: string; city?: string; address?: string }) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/tenants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const newTenant: TenantItem = await res.json();
          setTenants((prev) => [...prev, newTenant]);
          setActiveTenantId(newTenant.id);
          return newTenant;
        }
        return null;
      } catch (e) {
        console.error('Error creando clínica:', e);
        return null;
      }
    },
    [setActiveTenantId]
  );

  // Poblar clínica con citas de prueba
  const seedTenantData = useCallback(
    async (tenantId: string) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/seed`, {
          method: 'POST',
        });
        const result = await readSandboxResult(res, 'No se pudieron generar los datos de prueba');
        if (result.ok) setDataVersion((v) => v + 1);
        return result;
      } catch (e) {
        console.error('Error poblando datos de prueba:', e);
        return { ok: false, message: 'Sin conexión con la API: no se generaron datos de prueba' };
      }
    },
    []
  );

  // Borrar TODO el historial clínico de la clínica (citas, chats y mensajes)
  const resetTenantData = useCallback(
    async (tenantId: string) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/reset`, {
          method: 'DELETE',
        });
        const result = await readSandboxResult(res, 'No se pudo limpiar la clínica');
        if (result.ok) setDataVersion((v) => v + 1);
        return result;
      } catch (e) {
        console.error('Error reseteando clínica:', e);
        return { ok: false, message: 'Sin conexión con la API: no se pudo confirmar el borrado' };
      }
    },
    []
  );

  // Actualizar clínica en tiempo real
  const updateTenant = useCallback(
    async (id: string, data: Partial<TenantItem>) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/tenants/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const updated: TenantItem = await res.json();
          setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
          return updated;
        }
        return null;
      } catch (e) {
        console.error('Error actualizando clínica:', e);
        return null;
      }
    },
    []
  );

  const activeTenant = tenants.find((t) => t.id === activeTenantId) || tenants[0] || null;

  return (
    <TenantContext.Provider
      value={{
        mode,
        setMode,
        tenants,
        activeTenant,
        activeTenantId,
        setActiveTenantId,
        loadingTenants,
        refreshTenants,
        createTenant,
        updateTenant,
        seedTenantData,
        resetTenantData,
        isPlatformAdmin,
        dataVersion,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant debe usarse dentro de un TenantProvider');
  }
  return context;
}
