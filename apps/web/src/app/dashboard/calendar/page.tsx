'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  User,
  Phone,
  MessageSquare,
  Sparkles,
  Trash2,
  Check,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import {
  formatDateKeyLong,
  formatDateKeyShort,
  formatMexicanPhone,
  todayInMexicoCity,
} from '../../../lib/format';
import { usePolling } from '../../../hooks/usePolling';

interface ApiAppointment {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  depositAmountMxn?: number | null;
  channelOrigin: string;
  symptoms?: string | null;
  notes?: string | null;
  createdAt: string;
  patient: {
    id: string;
    fullName: string;
    phoneE164: string;
  };
  doctor: {
    id: string;
    name: string;
    specialty: string;
  };
  service: {
    id: string;
    name: string;
    priceMxn: number;
    durationMinutes: number;
  };
}

interface TenantDoctor {
  id: string;
  name: string;
  specialty: string;
}

interface TenantService {
  id: string;
  name: string;
  priceMxn: number;
  durationMinutes: number;
  requiredDepositMxn: number;
}

import { useTenant } from '../../../context/TenantContext';
import { API_BASE_URL, apiFetch } from '../../../lib/api';

const DEMO_APPOINTMENTS: ApiAppointment[] = [
  {
    id: 'demo-1',
    tenantId: 'demo-tenant',
    patientId: 'p-1',
    doctorId: 'd-1',
    serviceId: 's-1',
    startTime: '2026-09-09T15:00:00.000Z',
    endTime: '2026-09-09T15:45:00.000Z',
    status: 'CONFIRMED',
    paymentStatus: 'DEPOSIT_PAID',
    depositAmountMxn: 200,
    channelOrigin: 'WHATSAPP',
    symptoms: 'Limpieza semestral de rutina',
    notes: 'Confirmada por WhatsApp',
    createdAt: '2026-09-08T10:00:00.000Z',
    patient: { id: 'p-1', fullName: 'Mariana Hernández', phoneE164: '+52 (55) 1234-9988' },
    doctor: { id: 'd-1', name: 'Dra. Sofía Silva', specialty: 'Odontología General y Estética' },
    service: { id: 's-1', name: 'Limpieza Dental con Ultrasonido', priceMxn: 850, durationMinutes: 45 },
  },
  {
    id: 'demo-2',
    tenantId: 'demo-tenant',
    patientId: 'p-2',
    doctorId: 'd-1',
    serviceId: 's-2',
    startTime: '2026-09-09T16:00:00.000Z',
    endTime: '2026-09-09T17:00:00.000Z',
    status: 'CONFIRMED',
    paymentStatus: 'DEPOSIT_PAID',
    depositAmountMxn: 500,
    channelOrigin: 'WHATSAPP',
    symptoms: 'Aclaramiento para boda',
    notes: 'Anticipo acreditado con Mercado Pago',
    createdAt: '2026-09-08T11:00:00.000Z',
    patient: { id: 'p-2', fullName: 'Laura Patricia Vega', phoneE164: '+52 (55) 4433-2211' },
    doctor: { id: 'd-1', name: 'Dra. Sofía Silva', specialty: 'Estética Dental' },
    service: { id: 's-2', name: 'Blanqueamiento Dental LED', priceMxn: 2600, durationMinutes: 60 },
  },
  {
    id: 'demo-3',
    tenantId: 'demo-tenant',
    patientId: 'p-3',
    doctorId: 'd-2',
    serviceId: 's-3',
    startTime: '2026-09-09T17:30:00.000Z',
    endTime: '2026-09-09T19:00:00.000Z',
    status: 'CONFIRMED',
    paymentStatus: 'DEPOSIT_PAID',
    depositAmountMxn: 300,
    channelOrigin: 'PHONE_CALL',
    symptoms: 'Dolor agudo nocturno al masticar',
    notes: 'Atendido por recepcionista IA telefónica',
    createdAt: '2026-09-08T12:00:00.000Z',
    patient: { id: 'p-3', fullName: 'Carlos Gómez', phoneE164: '+52 (55) 8877-6655' },
    doctor: { id: 'd-2', name: 'Dr. Alejandro Morales', specialty: 'Endodoncia y Cirugía' },
    service: { id: 's-3', name: 'Tratamiento de Conductos (Endodoncia)', priceMxn: 3200, durationMinutes: 90 },
  },
  {
    id: 'demo-4',
    tenantId: 'demo-tenant',
    patientId: 'p-4',
    doctorId: 'd-2',
    serviceId: 's-4',
    startTime: '2026-09-09T19:00:00.000Z',
    endTime: '2026-09-09T20:00:00.000Z',
    status: 'URGENT',
    paymentStatus: 'NONE',
    depositAmountMxn: 0,
    channelOrigin: 'PHONE_CALL',
    symptoms: 'Traumatismo dental con sangrado activo',
    notes: '🚨 Triaje Urgencia Prioritaria',
    createdAt: '2026-09-09T08:00:00.000Z',
    patient: { id: 'p-4', fullName: 'Fernando Rivas (Urgencia)', phoneE164: '+52 (55) 7766-5544' },
    doctor: { id: 'd-2', name: 'Dr. Alejandro Morales', specialty: 'Cirugía Maxilofacial' },
    service: { id: 's-4', name: 'Extracción Quirúrgica Urgente', priceMxn: 1950, durationMinutes: 60 },
  },
  {
    id: 'demo-5',
    tenantId: 'demo-tenant',
    patientId: 'p-5',
    doctorId: 'd-1',
    serviceId: 's-1',
    startTime: '2026-09-10T17:00:00.000Z',
    endTime: '2026-09-10T17:45:00.000Z',
    status: 'CONFIRMED',
    paymentStatus: 'DEPOSIT_PENDING',
    depositAmountMxn: 200,
    channelOrigin: 'WHATSAPP',
    symptoms: 'Limpieza dental con ultrasonido y pulido',
    notes: 'Asistencia confirmada vía WhatsApp',
    createdAt: '2026-09-09T09:00:00.000Z',
    patient: { id: 'p-5', fullName: 'JC (Confirmado)', phoneE164: '+52 (81) 2865-1819' },
    doctor: { id: 'd-1', name: 'Dra. Sofía Silva', specialty: 'Odontología General y Estética' },
    service: { id: 's-1', name: 'Limpieza Dental con Ultrasonido y Pulido', priceMxn: 850, durationMinutes: 45 },
  },
  {
    id: 'demo-6',
    tenantId: 'demo-tenant',
    patientId: 'p-6',
    doctorId: 'd-2',
    serviceId: 's-5',
    startTime: '2026-09-10T22:00:00.000Z',
    endTime: '2026-09-10T23:00:00.000Z',
    status: 'CONFIRMED',
    paymentStatus: 'DEPOSIT_PAID',
    depositAmountMxn: 300,
    channelOrigin: 'WHATSAPP',
    symptoms: 'Molestia en muela del juicio',
    notes: 'Anticipo pagado',
    createdAt: '2026-09-09T09:30:00.000Z',
    patient: { id: 'p-6', fullName: 'Roberto Domínguez', phoneE164: '+52 (55) 9988-7711' },
    doctor: { id: 'd-2', name: 'Dr. Alejandro Morales', specialty: 'Cirugía' },
    service: { id: 's-5', name: 'Extracción Muela del Juicio', priceMxn: 1950, durationMinutes: 60 },
  },
];

export default function CalendarPage() {
  const { mode, activeTenant, activeTenantId } = useTenant();
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [doctors, setDoctors] = useState<TenantDoctor[]>([]);
  const [services, setServices] = useState<TenantService[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Ahora');

  // Filtros
  const [selectedDoctor, setSelectedDoctor] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateView, setDateView] = useState<'all' | 'today' | 'tomorrow' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');

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

  // Cargar clínicas, doctores y servicios
  const loadTenantData = useCallback(async () => {
    if (mode === 'demo') {
      setDoctors([
        { id: 'd-1', name: 'Dra. Sofía Silva', specialty: 'Odontología General y Estética' },
        { id: 'd-2', name: 'Dr. Alejandro Morales', specialty: 'Endodoncia y Cirugía' },
      ]);
      setServices([
        { id: 's-1', name: 'Limpieza Dental con Ultrasonido', priceMxn: 850, durationMinutes: 45, requiredDepositMxn: 200 },
        { id: 's-2', name: 'Blanqueamiento Dental LED', priceMxn: 2600, durationMinutes: 60, requiredDepositMxn: 500 },
        { id: 's-3', name: 'Tratamiento de Conductos', priceMxn: 3200, durationMinutes: 90, requiredDepositMxn: 300 },
      ]);
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/tenants`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const current = data.find((t: any) => t.id === activeTenantId) || data[0];
          setTenantId(current.id);
          setDoctors(current.doctors || []);
          setServices(current.services || []);
          if (current.doctors?.length > 0 && !newDoctorId) {
            setNewDoctorId(current.doctors[0].id);
          }
          if (current.services?.length > 0 && !newServiceId) {
            setNewServiceId(current.services[0].id);
          }
        }
      }
    } catch (err) {
      console.warn('Error cargando doctores y servicios:', err);
    }
  }, [mode, activeTenantId, newDoctorId, newServiceId]);

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
      setAppointments(await res.json());
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

  // Carga inicial de catálogo (doctores/servicios) al cambiar de clínica o modo.
  useEffect(() => {
    loadTenantData();
  }, [loadTenantData]);

  // Polling resiliente de citas: pausa con la pestaña oculta y aplica backoff.
  const pollAppointments = useCallback(
    (signal: AbortSignal) => fetchAppointments({ signal }),
    [fetchAppointments]
  );
  const { refresh: refreshAppointments } = usePolling(pollAppointments, {
    intervalMs: 3500,
    enabled: mode === 'live' && Boolean(activeTenantId),
  });

  // Manejador de cambio de estado de cita (Confirmar / Completar / Cancelar)
  const handleUpdateStatus = async (appointmentId: string, newStatus: string) => {
    if (mode === 'demo') {
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, status: newStatus } : a))
      );
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        void refreshAppointments();
      }
    } catch (err) {
      console.error('Error actualizando estado de cita:', err);
    }
  };

  // Crear cita manual
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const startTimeIso = new Date(`${newDate}T${newTime}:00`).toISOString();
      const res = await apiFetch(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          patientName: newPatientName,
          patientPhone: newPatientPhone,
          doctorId: newDoctorId,
          serviceId: newServiceId,
          startTimeIso,
          symptoms: newSymptoms || 'Agendado manualmente en panel',
          channelOrigin: 'WEBCHAT',
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewPatientName('');
        setNewPatientPhone('');
        setNewSymptoms('');
        void refreshAppointments();
      } else {
        const errorData = await res.json();
        setSubmitError(errorData.error || 'No se pudo agendar la cita. Verifica el horario.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Error de conexión con el servidor.');
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
  const getCdmxDayStr = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);

  const todayDayStr = getCdmxDayStr(new Date());
  const tomorrowDayStr = (() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getCdmxDayStr(tomorrow);
  })();

  useEffect(() => {
    setCustomDate((current) => current || todayDayStr);
  }, [todayDayStr]);

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
            {new Intl.DateTimeFormat('es-MX', {
              timeZone: 'America/Mexico_City',
              day: 'numeric',
              month: 'short',
            }).format(new Date())}
            )
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{todayCount}</div>
          <div className="text-[11px] text-teal-700 font-medium mt-0.5">Consultorio activo</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-teal-200 bg-teal-50/20 shadow-sm">
          <div className="text-xs font-medium text-teal-800">
            Citas Mañana (
            {new Intl.DateTimeFormat('es-MX', {
              timeZone: 'America/Mexico_City',
              day: 'numeric',
              month: 'short',
            }).format(new Date(Date.now() + 86_400_000))}
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
              Hoy (9 Sep) • {todayCount}
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
          {filteredAppointments.map((appt) => {
            const isTomorrow = getApptDayStr(appt.startTime) === tomorrowDayStr;
            const isToday = getApptDayStr(appt.startTime) === todayDayStr;

            return (
              <div
                key={appt.id}
                className={`p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors hover:bg-slate-50 ${
                  isTomorrow ? 'border-l-4 border-l-teal-500 bg-teal-50/10' : ''
                }`}
              >
                {/* Horario y Fecha */}
                <div className="flex items-start gap-4">
                  <div className="w-28 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 font-mono">
                      <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      {formatApptTime(appt.startTime)}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-600 mt-1 flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3 text-slate-400" />
                      {formatApptDate(appt.startTime)}
                    </div>
                    {isTomorrow && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 rounded">
                        Mañana
                      </span>
                    )}
                    {isToday && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded">
                        Hoy
                      </span>
                    )}
                  </div>

                  {/* Datos del Paciente y Consulta */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base">{appt.patient?.fullName}</h3>
                      <span className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {formatMexicanPhone(appt.patient?.phoneE164)}
                      </span>
                      {appt.channelOrigin === 'WHATSAPP' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <MessageSquare className="w-3 h-3" />
                          WhatsApp
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 font-medium">
                      <span className="font-semibold text-slate-900">{appt.service?.name}</span> •{' '}
                      <span className="text-teal-700 font-semibold">{appt.doctor?.name}</span> (
                      {appt.doctor?.specialty})
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                      <span>Duración: {appt.service?.durationMinutes || 45} min</span>
                      <span>•</span>
                      <span>Precio: ${appt.service?.priceMxn} MXN</span>
                      {appt.symptoms && (
                        <>
                          <span>•</span>
                          <span className="italic text-slate-600">"{appt.symptoms}"</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Badges y Acciones Rápidas */}
                <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
                  {/* Badge de Estatus */}
                  {appt.status === 'CONFIRMED' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Confirmada
                    </span>
                  ) : appt.status === 'COMPLETED' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-md border border-blue-200">
                      <Check className="w-3.5 h-3.5 text-blue-600" />
                      Completada
                    </span>
                  ) : appt.status === 'CANCELLED' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-md border border-red-200">
                      <X className="w-3.5 h-3.5 text-red-600" />
                      Cancelada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md">
                      Pendiente
                    </span>
                  )}

                  {/* Anticipo */}
                  {appt.paymentStatus === 'DEPOSIT_PENDING' && (
                    <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                      Anticipo ${appt.depositAmountMxn || 200} MXN Pendiente
                    </span>
                  )}

                  {/* Botón WhatsApp directo */}
                  <a
                    href={`https://wa.me/${appt.patient?.phoneE164?.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    WhatsApp
                  </a>

                  {/* Acciones de Estado */}
                  {appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED' && (
                    <button
                      onClick={() => handleUpdateStatus(appt.id, 'CONFIRMED')}
                      className="px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
                      title="Confirmar Asistencia"
                    >
                      Confirmar
                    </button>
                  )}

                  {appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')}
                      className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      title="Marcar como atendida"
                    >
                      Completar
                    </button>
                  )}

                  {appt.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleUpdateStatus(appt.id, 'CANCELLED')}
                      className="px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Cancelar cita"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Agendar Nueva Cita Manualmente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Agendar Cita Médica / Dental</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registra una consulta presencial directamente en el sistema
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="p-6 space-y-4">
              {submitError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {submitError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo del Paciente</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: JC o Juan Carlos Martínez"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono Móvil (México +52)</label>
                <input
                  type="tel"
                  required
                  placeholder="Ej: 8128651819 o +528128651819"
                  value={newPatientPhone}
                  onChange={(e) => setNewPatientPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Especialista</label>
                  <select
                    value={newDoctorId}
                    onChange={(e) => setNewDoctorId(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {doctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tratamiento</label>
                  <select
                    value={newServiceId}
                    onChange={(e) => setNewServiceId(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} (${svc.priceMxn} MXN)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Horario (CDMX)</label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo o Síntomas (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Limpieza dental de rutina"
                  value={newSymptoms}
                  onChange={(e) => setNewSymptoms(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm transition-all"
                >
                  {isSubmitting ? 'Guardando...' : 'Confirmar y Agendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
