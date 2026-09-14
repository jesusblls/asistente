'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, apiFetch, getToken } from '../lib/api';

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
  seedTenantData: (tenantId: string) => Promise<boolean>;
  resetTenantData: (tenantId: string) => Promise<boolean>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DashboardMode>('live');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string>('');
  const [loadingTenants, setLoadingTenants] = useState<boolean>(true);

  // Inicializar modo y clínica guardada en localStorage
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('asistente_dashboard_mode') as DashboardMode;
      if (savedMode === 'live' || savedMode === 'demo') {
        setModeState(savedMode);
      }

      const savedTenantId = localStorage.getItem('asistente_active_tenant_id');
      if (savedTenantId) {
        setActiveTenantIdState(savedTenantId);
      }
    } catch (e) {
      // Ignorar errores de SSR
    }
  }, []);

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
    if (!getToken()) {
      setLoadingTenants(false);
      return;
    }
    try {
      setLoadingTenants(true);
      const res = await apiFetch(`${API_BASE_URL}/api/tenants`);
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
        if (data.length > 0) {
          // Si no hay seleccionado o el seleccionado ya no existe, seleccionar el primero
          setActiveTenantIdState((prev) => {
            const exists = data.some((t: TenantItem) => t.id === prev);
            const chosen = exists ? prev : data[0].id;
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
    refreshTenants();
  }, [refreshTenants]);

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
        return res.ok;
      } catch (e) {
        console.error('Error poblando datos de prueba:', e);
        return false;
      }
    },
    []
  );

  // Limpiar datos de prueba
  const resetTenantData = useCallback(
    async (tenantId: string) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/reset`, {
          method: 'DELETE',
        });
        return res.ok;
      } catch (e) {
        console.error('Error reseteando clínica:', e);
        return false;
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
