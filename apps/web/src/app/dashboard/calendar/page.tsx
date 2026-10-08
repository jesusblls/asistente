'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  addDaysToDateKey,
  formatDateKeyLong,
  formatDateKeyShort,
  mexicoCityWallTimeToUtcIso,
  todayInMexicoCity,
} from '../../../lib/format';
import { usePolling } from '../../../hooks/usePolling';
import { useTenant } from '../../../context/TenantContext';
import { API_BASE_URL, apiFetch } from '../../../lib/api';
import { AppointmentRow } from '../../../components/dashboard/calendar/AppointmentRow';
import { NewAppointmentModal } from '../../../components/dashboard/calendar/NewAppointmentModal';
import type { ApiAppointment, TenantDoctor, TenantService, TenantCatalogItem } from './types';
import { DEMO_APPOINTMENTS, DEMO_DOCTORS, DEMO_SERVICES } from './demo';

/** Participio para el toast de cambio de estado: "Cita de Ana confirmada". */
const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'confirmada',
  COMPLETED: 'marcada como completada',
  CANCELLED: 'cancelada',
};

/**
 * Normalización mínima a E.164 (+52) para las citas creadas en Modo Demo, que
 * no pasan por la API. En vivo, la API normaliza con `phone.ts` del agente.
 */
function toDemoE164(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('044') || digits.startsWith('045')) digits = digits.slice(3);
  if (digits.length === 13 && digits.startsWith('521')) digits = `52${digits.slice(3)}`;
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return `+${digits}`;
  return phone.trim();
}

export default function CalendarPage() {
  const { mode, activeTenantId } = useTenant();
  const [appointments, setAppointments] = useState<ApiAppointment[]>(() =>
    mode === 'demo' ? DEMO_APPOINTMENTS : []
  );
  const [doctors, setDoctors] = useState<TenantDoctor[]>(() =>
    mode === 'demo' ? DEMO_DOCTORS : []
  );
  const [services, setServices] = useState<TenantService[]>(() =>
    mode === 'demo' ? DEMO_SERVICES : []
  );
  const [tenantId, setTenantId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(() => mode !== 'demo');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Ahora');

  // Estado de carga del catálogo (doctores/servicios) para el modal de nueva cita
  const [catalogLoading, setCatalogLoading] = useState<boolean>(() => mode !== 'demo');
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Ajuste de estado durante render al cambiar de modo
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === 'demo') {
      setDoctors(DEMO_DOCTORS);
      setServices(DEMO_SERVICES);
      setAppointments(DEMO_APPOINTMENTS);
      setLoading(false);
      setLastSyncTime('Demo');
      setCatalogLoading(false);
      setCatalogError(null);
    }
  }

  // Filtros
  const [selectedDoctor, setSelectedDoctor] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateView, setDateView] = useState<'all' | 'today' | 'tomorrow' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>(() => todayInMexicoCity());

  // Modal para agregar cita
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newPatientName, setNewPatientName] = useState<string>('');
  const [newPatientPhone, setNewPatientPhone] = useState<string>('');
  const [newDoctorId, setNewDoctorId] = useState<string>('');
  const [newServiceId, setNewServiceId] = useState<string>('');
  const [newDate, setNewDate] = useState<string>(() => todayInMexicoCity());
  const [newTime, setNewTime] = useState<string>('11:00');
  const [newSymptoms, setNewSymptoms] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Cambios de estado en vuelo (id -> estado elegido + secuencia). El polling
  // los respeta para no "regresar" la fila mientras la API responde, y la
  // secuencia evita que el fallo de un clic viejo revierta uno más reciente.
  const pendingStatusRef = useRef(new Map<string, { status: string; seq: number }>());
  const statusSeqRef = useRef(0);

  // Toast de feedback para mutaciones (cambio de estado, alta de cita)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Cargar catálogo de doctores y servicios de la clínica en vivo
  useEffect(() => {
    if (mode !== 'live' || !activeTenantId) return;

    let active = true;
    const fetchCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/tenants`);
        if (!res.ok) throw new Error(`La API respondió ${res.status}`);
        const data: TenantCatalogItem[] = await res.json();
        if (!active) return;
        if (data && data.length > 0) {
          const current = data.find((t: TenantCatalogItem) => t.id === activeTenantId) || data[0];
          setTenantId(current.id);
          const docs = current.doctors || [];
          const svcs = current.services || [];
          setDoctors(docs);
          setServices(svcs);
          // Al cambiar de clínica, la selección previa puede pertenecer a otra.
          setNewDoctorId((prev) => (docs.some((d) => d.id === prev) ? prev : docs[0]?.id ?? ''));
          setNewServiceId((prev) => (svcs.some((sv) => sv.id === prev) ? prev : svcs[0]?.id ?? ''));
        }
      } catch (err) {
        if (!active) return;
        console.warn('Error cargando doctores y servicios:', err);
        setCatalogError(
          'No se pudieron cargar los especialistas y tratamientos de la clínica. Revisa tu conexión e inténtalo de nuevo.'
        );
      } finally {
        if (active) setCatalogLoading(false);
      }
    };

    fetchCatalog();
    return () => {
      active = false;
    };
  }, [mode, activeTenantId]);

  // Cargar citas desde la API o modo demo
  const fetchAppointments = useCallback(async (options: { showLoading?: boolean; signal?: AbortSignal } = {}) => {
    const { showLoading = false, signal } = options;
    if (mode === 'demo') {
      setAppointments(DEMO_APPOINTMENTS);
      setLoading(false);
      setRefreshing(false);
      setLastSyncTime('Demo');
      return;
    }

    if (!activeTenantId) {
      setAppointments([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showLoading) setRefreshing(true);
    try {
      const res = await apiFetch(
        `${API_BASE_URL}/api/appointments?tenantId=${activeTenantId}`,
        { signal }
      );
      if (!res.ok) throw new Error(`La API respondió ${res.status}`);
      const fetched: ApiAppointment[] = await res.json();
      const pending = pendingStatusRef.current;
      setAppointments(
        pending.size === 0
          ? fetched
          : fetched.map((a) => {
              const override = pending.get(a.id);
              return override ? { ...a, status: override.status } : a;
            })
      );
      setLastSyncTime(
        new Date().toLocaleTimeString('es-MX', {
          timeZone: 'America/Mexico_City',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Error al consultar citas:', err);
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, activeTenantId]);

  // Polling resiliente de citas: pausa con la pestaña oculta y aplica backoff.
  const pollAppointments = useCallback(
    (signal: AbortSignal) => fetchAppointments({ signal }),
    [fetchAppointments]
  );
  const { refresh: refreshAppointments } = usePolling(pollAppointments, {
    intervalMs: 3500,
    enabled: mode === 'live' && Boolean(activeTenantId),
  });

  // Manejador de cambio de estado de cita (Confirmar / Completar / Cancelar).
  // Actualización optimista: la fila cambia al instante y, si la API rechaza el
  // cambio, se revierte al estado anterior y se avisa con un toast de error.
  const handleUpdateStatus = async (appointmentId: string, newStatus: string) => {
    const previous = appointments.find((a) => a.id === appointmentId);
    if (!previous || previous.status === newStatus) return;

    const label = STATUS_LABELS[newStatus] ?? 'actualizada';
    const patientName = previous.patient?.fullName ?? 'el paciente';
    const applyStatus = (status: string) =>
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, status } : a))
      );

    applyStatus(newStatus);

    if (mode === 'demo') {
      showToast(`Cita de ${patientName} ${label} (Modo Demo)`);
      return;
    }

    const seq = ++statusSeqRef.current;
    pendingStatusRef.current.set(appointmentId, { status: newStatus, seq });
    const isLatest = () => pendingStatusRef.current.get(appointmentId)?.seq === seq;

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `La API respondió ${res.status}`);
      }
      if (isLatest()) pendingStatusRef.current.delete(appointmentId);
      showToast(`Cita de ${patientName} ${label}`);
      void refreshAppointments();
    } catch (err) {
      console.error('Error actualizando estado de cita:', err);
      // Solo se revierte si nadie cambió la cita después de este clic.
      if (isLatest()) {
        pendingStatusRef.current.delete(appointmentId);
        applyStatus(previous.status);
      }
      showToast(
        `No se pudo actualizar la cita de ${patientName}: ${
          err instanceof Error ? err.message : 'error de conexión'
        }`,
        'error'
      );
    }
  };

  // Crear cita manual
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Si la selección quedó vacía (catálogo recién cargado o clínica cambiada),
    // se usa la primera opción, que es la que el <select> muestra en pantalla.
    const doctor = doctors.find((d) => d.id === newDoctorId) ?? doctors[0];
    const service = services.find((sv) => sv.id === newServiceId) ?? services[0];
    if (!doctor || !service) {
      setSubmitError('Primero registra al menos un especialista y un tratamiento en Equipo.');
      return;
    }

    // La hora capturada es hora de CDMX, sin importar la zona del navegador.
    const startTimeIso = mexicoCityWallTimeToUtcIso(newDate, newTime);
    if (!startTimeIso) {
      setSubmitError('Captura una fecha y un horario válidos.');
      return;
    }

    if (mode === 'demo') {
      const start = new Date(startTimeIso);
      const demoAppt: ApiAppointment = {
        id: `demo-${start.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: 'demo',
        patientId: `demo-patient-${start.getTime()}`,
        doctorId: doctor.id,
        serviceId: service.id,
        startTime: startTimeIso,
        endTime: new Date(start.getTime() + (service.durationMinutes || 45) * 60_000).toISOString(),
        status: 'CONFIRMED',
        paymentStatus: 'NONE',
        channelOrigin: 'WEBCHAT',
        symptoms: newSymptoms || 'Agendado manualmente en panel',
        createdAt: new Date().toISOString(),
        patient: {
          id: `demo-patient-${start.getTime()}`,
          fullName: newPatientName,
          phoneE164: toDemoE164(newPatientPhone),
        },
        doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty },
        service: {
          id: service.id,
          name: service.name,
          priceMxn: service.priceMxn,
          durationMinutes: service.durationMinutes,
        },
      };
      setAppointments((prev) =>
        [...prev, demoAppt].sort((a, b) => a.startTime.localeCompare(b.startTime))
      );
      setIsModalOpen(false);
      setNewPatientName('');
      setNewPatientPhone('');
      setNewSymptoms('');
      showToast(`Cita de ${demoAppt.patient.fullName} agendada (Modo Demo)`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          patientName: newPatientName,
          patientPhone: newPatientPhone,
          doctorId: doctor.id,
          serviceId: service.id,
          startTimeIso,
          symptoms: newSymptoms || 'Agendado manualmente en panel',
          channelOrigin: 'WEBCHAT',
        }),
      });

      if (res.ok) {
        const patientName = newPatientName;
        setIsModalOpen(false);
        setNewPatientName('');
        setNewPatientPhone('');
        setNewSymptoms('');
        showToast(`Cita de ${patientName} agendada`);
        void refreshAppointments();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setSubmitError(errorData.error || 'No se pudo agendar la cita. Verifica el horario.');
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error de conexión con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper para formatear fecha en huso de CDMX
  const formatApptDate = (isoStr: string) => {
    const d = new Date(isoStr);
    const formatted = d.toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  // Helper para formatear hora en huso de CDMX (ej: "11:00 AM")
  const formatApptTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Helper para obtener YYYY-MM-DD en CDMX
  const getApptDayStr = (isoStr: string) => {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d);
  };

  // Fechas de referencia calculadas en huso de CDMX (nunca hardcodeadas).
  // Se recalcula en cada render (el polling re-renderiza cada 3.5 s) para que
  // "Hoy" y "Mañana" cambien solos a la medianoche de CDMX.
  const todayDayStr = todayInMexicoCity();
  const tomorrowDayStr = addDaysToDateKey(todayDayStr, 1);

  // Filtrado de citas
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      // 1. Filtro de fecha
      const apptDay = getApptDayStr(appt.startTime);
      if (dateView === 'today' && apptDay !== todayDayStr) return false;
      if (dateView === 'tomorrow' && apptDay !== tomorrowDayStr) return false;
      if (dateView === 'custom' && apptDay !== customDate) return false;

      // 2. Filtro de doctor
      if (selectedDoctor !== 'all' && appt.doctorId !== selectedDoctor) return false;

      // 3. Filtro de estatus
      if (selectedStatus !== 'all' && appt.status !== selectedStatus) return false;

      // 4. Búsqueda por texto (nombre, teléfono, servicio)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = appt.patient?.fullName?.toLowerCase().includes(q);
        const matchPhone = appt.patient?.phoneE164?.includes(q);
        const matchService = appt.service?.name?.toLowerCase().includes(q);
        const matchDoctor = appt.doctor?.name?.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchService && !matchDoctor) return false;
      }

      return true;
    });
  }, [
    appointments,
    dateView,
    customDate,
    selectedDoctor,
    selectedStatus,
    searchQuery,
    todayDayStr,
    tomorrowDayStr,
  ]);

  // Contadores para métricas
  const todayCount = appointments.filter((a) => getApptDayStr(a.startTime) === todayDayStr).length;
  const tomorrowCount = appointments.filter((a) => getApptDayStr(a.startTime) === tomorrowDayStr).length;
  const totalConfirmed = appointments.filter((a) => a.status === 'CONFIRMED').length;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast de feedback */}
      {toast && (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-6 right-6 z-[60] max-w-sm flex items-start gap-2.5 text-white text-xs sm:text-sm px-4 py-3 rounded-xl shadow-xl border animate-in fade-in slide-in-from-bottom-2 ${
            toast.tone === 'error' ? 'bg-red-700 border-red-800' : 'bg-slate-900 border-slate-700'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-100 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Encabezado y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Agenda Médica y Citas</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado en vivo
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Conexión en tiempo real con WhatsApp Cloud API y recepción telefónica en México
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshAppointments}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-teal-600' : ''}`} />
            Actualizar
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nueva Cita
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">
            Citas Hoy (
            {formatDateKeyShort(todayDayStr)}
            )
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{todayCount}</div>
          <div className="text-[11px] text-teal-700 font-medium mt-0.5">Consultorio activo</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-teal-200 bg-teal-50/20 shadow-sm">
          <div className="text-xs font-medium text-teal-800">
            Citas Mañana (
            {formatDateKeyShort(tomorrowDayStr)}
            )
          </div>
          <div className="text-2xl font-bold text-teal-900 mt-1">{tomorrowCount}</div>
          <div className="text-[11px] text-teal-700 font-medium mt-0.5">Incluye cita por WhatsApp</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Total Confirmadas</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{totalConfirmed}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Recordatorios enviados</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Última Sincronización</div>
          <div className="text-lg font-mono font-bold text-slate-800 mt-1.5">{lastSyncTime}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Polling cada 3.5s</div>
        </div>
      </div>

      {/* Barra de Filtros y Navegación de Fechas */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Selector de Días Rápido */}
          <div className="flex items-center flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setDateView('all')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateView === 'all'
                  ? 'bg-white text-teal-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas las Citas ({appointments.length})
            </button>
            <button
              onClick={() => setDateView('today')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateView === 'today'
                  ? 'bg-white text-teal-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoy ({formatDateKeyShort(todayDayStr)}) • {todayCount}
            </button>
            <button
              onClick={() => setDateView('tomorrow')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateView === 'tomorrow'
                  ? 'bg-teal-600 text-white shadow-sm font-bold'
                  : 'text-teal-700 hover:text-teal-900'
              }`}
            >
              Mañana ({formatDateKeyShort(tomorrowDayStr)}) • {tomorrowCount} ⭐
            </button>
            <button
              onClick={() => setDateView('custom')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateView === 'custom'
                  ? 'bg-white text-teal-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Fecha
            </button>
          </div>

          {/* Selector de fecha personalizado si está activo */}
          {dateView === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Fecha:</span>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                aria-label="Fecha personalizada para filtrar la agenda"
                className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}

          {/* Buscador de Paciente */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por paciente, teléfono o servicio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar cita por paciente, teléfono o servicio"
              className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
            />
          </div>
        </div>

        {/* Filtro por Doctor y Estado */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">Filtrar por Especialista:</span>
          </div>

          <button
            onClick={() => setSelectedDoctor('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              selectedDoctor === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos
          </button>

          {doctors.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDoctor(doc.id)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedDoctor === doc.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {doc.name}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-slate-500 font-medium">Estado:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="Filtrar agenda por estado de la cita"
              className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">Todos los estados</option>
              <option value="CONFIRMED">Confirmadas</option>
              <option value="COMPLETED">Completadas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Citas */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Cargando agenda médica...</p>
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No hay citas registradas con estos filtros</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {dateView === 'today'
              ? `No hay citas para hoy (${formatDateKeyLong(todayDayStr)}). Revisa las citas de mañana (${formatDateKeyLong(tomorrowDayStr)}).`
              : 'Puedes cambiar los filtros o crear una nueva cita médica con el botón superior.'}
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setDateView('tomorrow')}
              className="px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
            >
              Ver Citas de Mañana ({formatDateKeyShort(tomorrowDayStr)})
            </button>
            <button
              onClick={() => {
                setDateView('all');
                setSelectedDoctor('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Restablecer Filtros
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {filteredAppointments.map((appt) => (
            <AppointmentRow
              key={appt.id}
              appt={appt}
              isToday={getApptDayStr(appt.startTime) === todayDayStr}
              isTomorrow={getApptDayStr(appt.startTime) === tomorrowDayStr}
              formatApptTime={formatApptTime}
              formatApptDate={formatApptDate}
              onUpdateStatus={handleUpdateStatus}
            />
          ))}
        </div>
      )}

      <NewAppointmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateAppointment}
        doctors={doctors}
        services={services}
        patientName={newPatientName}
        setPatientName={setNewPatientName}
        patientPhone={newPatientPhone}
        setPatientPhone={setNewPatientPhone}
        doctorId={newDoctorId}
        setDoctorId={setNewDoctorId}
        serviceId={newServiceId}
        setServiceId={setNewServiceId}
        date={newDate}
        setDate={setNewDate}
        time={newTime}
        setTime={setNewTime}
        symptoms={newSymptoms}
        setSymptoms={setNewSymptoms}
        isSubmitting={isSubmitting}
        submitError={submitError}
        catalogLoading={mode === 'live' && Boolean(activeTenantId) && catalogLoading}
        catalogError={mode === 'live' ? catalogError : null}
      />
    </div>
  );
}
