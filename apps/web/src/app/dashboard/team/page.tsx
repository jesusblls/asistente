'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Users,
  Clock,
  DollarSign,
  Stethoscope,
  Plus,
  Trash2,
  Mail,
  Phone,
  Calendar,
  Sparkles,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Tag,
  ShieldCheck,
  Building2,
  RotateCcw,
} from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { cn } from '@/lib/utils';
import { API_BASE_URL, apiFetch } from '@/lib/api';
import { formatMexicanPhone } from '@/lib/format';

export interface ScheduleChip {
  days: string;
  hours: string;
}

interface DisplayDoctor {
  id: string;
  name: string;
  specialty: string;
  email: string;
  phone: string;
  schedule: string;
  scheduleChips?: ScheduleChip[];
  slotDuration: string;
  status: string;
  isDemo?: boolean;
}

interface DisplayService {
  id: string;
  name: string;
  category: string;
  duration: string;
  durationMinutes: number;
  price: string;
  priceMxn: number;
  deposit: string;
  requiredDepositMxn: number;
  description?: string;
  isDemo?: boolean;
}

const INITIAL_DEMO_DOCTORS: DisplayDoctor[] = [
  {
    id: 'doc-1',
    name: 'Dra. Sofía Silva',
    specialty: 'Odontología General y Estética Dental',
    email: 'dra.sofia@sonrisaspolanco.mx',
    phone: '+52 (55) 1122-3344',
    schedule: 'Lunes a Jueves: 9:00 - 18:00 • Viernes: 9:00 - 15:00 • Sábado: 10:00 - 14:00',
    scheduleChips: [
      { days: 'Lun - Jue', hours: '09:00 - 18:00' },
      { days: 'Vie', hours: '09:00 - 15:00' },
      { days: 'Sáb', hours: '10:00 - 14:00' },
    ],
    slotDuration: '45 minutos',
    status: 'Activa',
    isDemo: true,
  },
  {
    id: 'doc-2',
    name: 'Dr. Alejandro Morales',
    specialty: 'Cirugía Maxilofacial y Endodoncia',
    email: 'dr.alejandro@sonrisaspolanco.mx',
    phone: '+52 (55) 9988-7766',
    schedule: 'Lunes, Miércoles y Viernes: 10:00 - 19:00',
    scheduleChips: [
      { days: 'Lun, Mié', hours: '10:00 - 19:00' },
      { days: 'Vie', hours: '10:00 - 17:00' },
    ],
    slotDuration: '60 minutos',
    status: 'Activo',
    isDemo: true,
  },
];

const INITIAL_DEMO_SERVICES: DisplayService[] = [
  {
    id: 'demo-s1',
    name: 'Valoración Inicial y Diagnóstico con Rx',
    price: '$400 MXN',
    priceMxn: 400,
    deposit: '$0 MXN (Sin anticipo)',
    requiredDepositMxn: 0,
    duration: '30 min',
    durationMinutes: 30,
    category: 'Diagnóstico',
    description: 'Evaluación bucodental completa y toma de radiografía diagnóstica',
    isDemo: true,
  },
  {
    id: 'demo-s2',
    name: 'Limpieza Dental con Ultrasonido y Pulido',
    price: '$850 MXN',
    priceMxn: 850,
    deposit: '$200 MXN',
    requiredDepositMxn: 200,
    duration: '45 min',
    durationMinutes: 45,
    category: 'Prevención',
    description: 'Eliminación ultrasónica de sarro supra y subgingival con pulido profiláctico',
    isDemo: true,
  },
  {
    id: 'demo-s3',
    name: 'Blanqueamiento Dental Láser / LED',
    price: '$2,600 MXN',
    priceMxn: 2600,
    deposit: '$500 MXN',
    requiredDepositMxn: 500,
    duration: '60 min',
    durationMinutes: 60,
    category: 'Estética',
    description: 'Aclaramiento dental seguro en una sola sesión con lámpara fotoactivadora',
    isDemo: true,
  },
  {
    id: 'demo-s4',
    name: 'Tratamiento de Conductos (Endodoncia)',
    price: '$3,200 MXN',
    priceMxn: 3200,
    deposit: '$500 MXN',
    requiredDepositMxn: 500,
    duration: '90 min',
    durationMinutes: 90,
    category: 'Especialidad',
    description: 'Instrumentación rotatoria mecanizada y sellado tridimensional radicular',
    isDemo: true,
  },
  {
    id: 'demo-s5',
    name: 'Extracción de Muela del Juicio',
    price: '$1,950 MXN',
    priceMxn: 1950,
    deposit: '$300 MXN',
    requiredDepositMxn: 300,
    duration: '60 min',
    durationMinutes: 60,
    category: 'Cirugía',
    description: 'Cirugía ambulatoria mínimamente invasiva con anestesia local de alta eficacia',
    isDemo: true,
  },
];

const PRESET_CATEGORIES = [
  'Diagnóstico',
  'Prevención',
  'Estética',
  'Cirugía',
  'Especialidad',
  'Ortodoncia',
  'General',
];

const PRESET_DURATIONS = [15, 30, 45, 60, 90, 120];

function formatAvailabilityRules(rulesStr?: string | null): { scheduleText: string; chips: ScheduleChip[]; slotDuration: string } {
  if (!rulesStr) {
    return {
      scheduleText: 'Lunes a Viernes: 09:00 - 18:00',
      chips: [{ days: 'Lun - Vie', hours: '09:00 - 18:00' }],
      slotDuration: '45 minutos',
    };
  }

  // Si ya es texto legible
  if (!rulesStr.trim().startsWith('{')) {
    const parts = rulesStr.split('•').map((p) => p.trim());
    const chips: ScheduleChip[] = parts.map((p) => {
      const idx = p.indexOf(':');
      if (idx > -1) {
        return { days: p.slice(0, idx).trim(), hours: p.slice(idx + 1).trim() };
      }
      return { days: 'Horario', hours: p };
    });
    return {
      scheduleText: rulesStr,
      chips: chips.length > 0 ? chips : [{ days: 'General', hours: rulesStr }],
      slotDuration: '45 minutos',
    };
  }

  try {
    const parsed = JSON.parse(rulesStr);
    const daysMap: Record<string, string> = {
      '1': 'Lun',
      '2': 'Mar',
      '3': 'Mié',
      '4': 'Jue',
      '5': 'Vie',
      '6': 'Sáb',
      '0': 'Dom',
      '7': 'Dom',
    };

    const days = parsed.days || {};
    const dayKeys = Object.keys(days).sort();

    if (dayKeys.length === 0) {
      return {
        scheduleText: 'Lunes a Viernes: 09:00 - 18:00',
        chips: [{ days: 'Lun - Vie', hours: '09:00 - 18:00' }],
        slotDuration: parsed.slotDurationMinutes ? `${parsed.slotDurationMinutes} minutos` : '45 minutos',
      };
    }

    const dayHourMap: { dayNum: number; dayName: string; hours: string }[] = [];
    dayKeys.forEach((d) => {
      const slots = days[d];
      if (Array.isArray(slots) && slots.length > 0) {
        const slot = slots[0];
        dayHourMap.push({
          dayNum: parseInt(d, 10),
          dayName: daysMap[d] || `Día ${d}`,
          hours: `${slot.start} - ${slot.end}`,
        });
      }
    });

    const chips: ScheduleChip[] = [];
    let currentGroup: { days: string[]; hours: string } | null = null;

    dayHourMap.forEach((item) => {
      if (!currentGroup) {
        currentGroup = { days: [item.dayName], hours: item.hours };
      } else if (currentGroup.hours === item.hours) {
        currentGroup.days.push(item.dayName);
      } else {
        const dayLabel =
          currentGroup.days.length > 2
            ? `${currentGroup.days[0]} - ${currentGroup.days[currentGroup.days.length - 1]}`
            : currentGroup.days.join(', ');
        chips.push({ days: dayLabel, hours: currentGroup.hours });
        currentGroup = { days: [item.dayName], hours: item.hours };
      }
    });

    if (currentGroup) {
      const g = currentGroup as { days: string[]; hours: string };
      const dayLabel =
        g.days.length > 2
          ? `${g.days[0]} - ${g.days[g.days.length - 1]}`
          : g.days.join(', ');
      chips.push({ days: dayLabel, hours: g.hours });
    }

    const slotDuration = parsed.slotDurationMinutes ? `${parsed.slotDurationMinutes} minutos` : '45 minutos';
    const scheduleText = chips.map((c) => `${c.days}: ${c.hours}`).join(' • ');

    return { scheduleText, chips, slotDuration };
  } catch (e) {
    return {
      scheduleText: rulesStr,
      chips: [{ days: 'Horario', hours: rulesStr }],
      slotDuration: '45 minutos',
    };
  }
}

/** Teléfonos del equipo en formato visual mexicano, con fallback de texto. */
const formatTeamPhone = (phone?: string | null): string =>
  formatMexicanPhone(phone) || 'Sin teléfono registrado';

export default function TeamAndServicesPage() {
  const { mode, activeTenant, activeTenantId, loadingTenants, refreshTenants } = useTenant();

  // Estados de datos en modo Demo
  const [demoDoctors, setDemoDoctors] = useState<DisplayDoctor[]>(INITIAL_DEMO_DOCTORS);
  const [demoServices, setDemoServices] = useState<DisplayService[]>(INITIAL_DEMO_SERVICES);

  // Estados de actualización manual y notificaciones
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Estados para Modal de Doctor
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [docName, setDocName] = useState('');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docSchedule, setDocSchedule] = useState('Lunes a Viernes: 9:00 - 18:00');
  const [docSlotDuration, setDocSlotDuration] = useState('45 minutos');
  const [isSubmittingDoctor, setIsSubmittingDoctor] = useState(false);
  const [doctorError, setDoctorError] = useState<string | null>(null);

  // Estados para Modal de Servicio
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcCategory, setSvcCategory] = useState('Diagnóstico');
  const [svcDurationMinutes, setSvcDurationMinutes] = useState(30);
  const [svcPriceMxn, setSvcPriceMxn] = useState<number | ''>(450);
  const [svcRequiredDepositMxn, setSvcRequiredDepositMxn] = useState<number | ''>(0);
  const [svcDescription, setSvcDescription] = useState('');
  const [isSubmittingService, setIsSubmittingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // Estados para Modal de Confirmación de Eliminación
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'doctor' | 'service';
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Lista de doctores calculada según el modo
  const doctors: DisplayDoctor[] = useMemo(() => {
    if (mode === 'demo') {
      return demoDoctors;
    }
    if (!activeTenant || !activeTenant.doctors) {
      return [];
    }
    return activeTenant.doctors.map((doc) => {
      const { scheduleText, chips, slotDuration } = formatAvailabilityRules(doc.availabilityRules);
      return {
        id: doc.id,
        name: doc.name,
        specialty: doc.specialty,
        email: doc.email || 'Sin correo registrado',
        phone: formatTeamPhone(doc.phone),
        schedule: scheduleText,
        scheduleChips: chips,
        slotDuration: slotDuration,
        status: doc.isActive !== false ? 'Activo' : 'Inactivo',
        isDemo: false,
      };
    });
  }, [mode, demoDoctors, activeTenant]);

  // Lista de servicios calculada según el modo
  const services: DisplayService[] = useMemo(() => {
    if (mode === 'demo') {
      return demoServices;
    }
    if (!activeTenant || !activeTenant.services) {
      return [];
    }
    return activeTenant.services.map((svc) => ({
      id: svc.id,
      name: svc.name,
      category: svc.category || 'General',
      duration: `${svc.durationMinutes} min`,
      durationMinutes: svc.durationMinutes,
      price: `$${(svc.priceMxn || 0).toLocaleString('es-MX')} MXN`,
      priceMxn: svc.priceMxn || 0,
      deposit:
        (svc.requiredDepositMxn || 0) > 0
          ? `$${(svc.requiredDepositMxn || 0).toLocaleString('es-MX')} MXN`
          : '$0 MXN (Sin anticipo)',
      requiredDepositMxn: svc.requiredDepositMxn || 0,
      description: svc.description || '',
      isDemo: false,
    }));
  }, [mode, demoServices, activeTenant]);

  // Sincronización manual con el backend
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshTenants();
    setIsRefreshing(false);
    showToast('Datos de la clínica sincronizados');
  };

  // Restaurar demo a valores originales
  const handleResetDemo = () => {
    setDemoDoctors(INITIAL_DEMO_DOCTORS);
    setDemoServices(INITIAL_DEMO_SERVICES);
    showToast('Datos demo restaurados al estado original');
  };

  // Limpiar formulario de doctor
  const resetDoctorForm = () => {
    setDocName('');
    setDocSpecialty('');
    setDocPhone('');
    setDocEmail('');
    setDocSchedule('Lunes a Viernes: 9:00 - 18:00');
    setDocSlotDuration('45 minutos');
    setDoctorError(null);
  };

  // Limpiar formulario de servicio
  const resetServiceForm = () => {
    setSvcName('');
    setSvcCategory('Diagnóstico');
    setSvcDurationMinutes(30);
    setSvcPriceMxn(450);
    setSvcRequiredDepositMxn(0);
    setSvcDescription('');
    setServiceError(null);
  };

  // Guardar doctor
  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim() || !docSpecialty.trim()) {
      setDoctorError('El nombre y la especialidad son obligatorios');
      return;
    }

    setIsSubmittingDoctor(true);
    setDoctorError(null);

    try {
      if (mode === 'demo') {
        const { scheduleText, chips, slotDuration } = formatAvailabilityRules(docSchedule);
        const newDemoDoc: DisplayDoctor = {
          id: `demo-doc-${Date.now()}`,
          name: docName.trim(),
          specialty: docSpecialty.trim(),
          email: docEmail.trim() || 'contacto@sonrisaspolanco.mx',
          phone: docPhone.trim() ? formatMexicanPhone(docPhone) : '+52 (55) 0000-0000',
          schedule: scheduleText || 'Lunes a Viernes: 9:00 - 18:00',
          scheduleChips: chips,
          slotDuration: docSlotDuration.trim() || slotDuration,
          status: 'Activo',
          isDemo: true,
        };
        setDemoDoctors((prev) => [...prev, newDemoDoc]);
        showToast(`Especialista "${newDemoDoc.name}" agregado (Modo Demo)`);
        setIsDoctorModalOpen(false);
        resetDoctorForm();
      } else {
        const targetTenantId = activeTenantId || activeTenant?.id;
        if (!targetTenantId) {
          throw new Error('No hay una clínica activa seleccionada');
        }

        const res = await apiFetch(`${API_BASE_URL}/api/tenants/${targetTenantId}/doctors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: docName.trim(),
            specialty: docSpecialty.trim(),
            phone: docPhone.trim() || null,
            email: docEmail.trim() || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Error al registrar el doctor');
        }

        await refreshTenants();
        showToast(`Especialista "${docName.trim()}" registrado con éxito`);
        setIsDoctorModalOpen(false);
        resetDoctorForm();
      }
    } catch (err: any) {
      console.error('Error creando especialista:', err);
      setDoctorError(err.message || 'No se pudo guardar el especialista');
    } finally {
      setIsSubmittingDoctor(false);
    }
  };

  // Guardar servicio
  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svcName.trim()) {
      setServiceError('El nombre del tratamiento es obligatorio');
      return;
    }
    const price = Number(svcPriceMxn) || 0;
    const deposit = Number(svcRequiredDepositMxn) || 0;

    if (price < 0) {
      setServiceError('El precio oficial no puede ser negativo');
      return;
    }
    if (deposit < 0) {
      setServiceError('El anticipo requerido no puede ser negativo');
      return;
    }
    if (deposit > price) {
      setServiceError('El anticipo no puede ser mayor que el precio total');
      return;
    }

    setIsSubmittingService(true);
    setServiceError(null);

    try {
      if (mode === 'demo') {
        const newDemoSvc: DisplayService = {
          id: `demo-svc-${Date.now()}`,
          name: svcName.trim(),
          category: svcCategory.trim() || 'General',
          duration: `${svcDurationMinutes} min`,
          durationMinutes: Number(svcDurationMinutes) || 30,
          price: `$${price.toLocaleString('es-MX')} MXN`,
          priceMxn: price,
          deposit:
            deposit > 0
              ? `$${deposit.toLocaleString('es-MX')} MXN`
              : '$0 MXN (Sin anticipo)',
          requiredDepositMxn: deposit,
          description: svcDescription.trim(),
          isDemo: true,
        };
        setDemoServices((prev) => [...prev, newDemoSvc]);
        showToast(`Tratamiento "${newDemoSvc.name}" agregado (Modo Demo)`);
        setIsServiceModalOpen(false);
        resetServiceForm();
      } else {
        const targetTenantId = activeTenantId || activeTenant?.id;
        if (!targetTenantId) {
          throw new Error('No hay una clínica activa seleccionada');
        }

        const res = await apiFetch(`${API_BASE_URL}/api/tenants/${targetTenantId}/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: svcName.trim(),
            description: svcDescription.trim() || null,
            durationMinutes: Number(svcDurationMinutes) || 30,
            priceMxn: price,
            requiredDepositMxn: deposit,
            category: svcCategory.trim() || 'General',
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Error al registrar el tratamiento');
        }

        await refreshTenants();
        showToast(`Tratamiento "${svcName.trim()}" registrado con éxito`);
        setIsServiceModalOpen(false);
        resetServiceForm();
      }
    } catch (err: any) {
      console.error('Error creando tratamiento:', err);
      setServiceError(err.message || 'No se pudo registrar el tratamiento');
    } finally {
      setIsSubmittingService(false);
    }
  };

  // Confirmar y procesar eliminación
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (mode === 'demo') {
        if (itemToDelete.type === 'doctor') {
          setDemoDoctors((prev) => prev.filter((d) => d.id !== itemToDelete.id));
          showToast(`Especialista "${itemToDelete.name}" eliminado (Modo Demo)`);
        } else {
          setDemoServices((prev) => prev.filter((s) => s.id !== itemToDelete.id));
          showToast(`Tratamiento "${itemToDelete.name}" eliminado (Modo Demo)`);
        }
        setItemToDelete(null);
      } else {
        const endpoint =
          itemToDelete.type === 'doctor'
            ? `${API_BASE_URL}/api/doctors/${itemToDelete.id}`
            : `${API_BASE_URL}/api/services/${itemToDelete.id}`;

        const res = await apiFetch(endpoint, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error ||
              `Error al eliminar ${
                itemToDelete.type === 'doctor' ? 'especialista' : 'servicio'
              }`
          );
        }

        await refreshTenants();
        showToast(
          `${
            itemToDelete.type === 'doctor' ? 'Especialista' : 'Tratamiento'
          } "${itemToDelete.name}" eliminado correctamente`
        );
        setItemToDelete(null);
      }
    } catch (err: any) {
      console.error('Error al eliminar:', err);
      setDeleteError(err.message || 'Error al procesar la eliminación');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper para initials
  const getInitials = (name: string) => {
    const clean = name.replace(/^(Dra\.|Dr\.|Lic\.)\s*/i, '').trim();
    const parts = clean.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || 'MD';
  };

  // Helper para color de categoría
  const getCategoryBadgeClass = (category?: string) => {
    switch (category?.toLowerCase()) {
      case 'diagnóstico':
      case 'diagnostico':
        return 'bg-blue-50 text-blue-700 border-blue-200/70';
      case 'prevención':
      case 'prevencion':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
      case 'estética':
      case 'estetica':
        return 'bg-purple-50 text-purple-700 border-purple-200/70';
      case 'especialidad':
      case 'endodoncia':
        return 'bg-amber-50 text-amber-700 border-amber-200/70';
      case 'cirugía':
      case 'cirugia':
        return 'bg-rose-50 text-rose-700 border-rose-200/70';
      case 'ortodoncia':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/70';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200/70';
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-slate-900 text-white text-xs sm:text-sm px-4 py-3 rounded-xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Especialistas Médicos y Tratamientos
            </h1>

            {/* Badge de Modo */}
            {mode === 'demo' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200/70">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                Modo Demo (Sonrisas Polanco)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Modo En Vivo: {activeTenant?.name || 'Clínica activa'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Parámetros utilizados por el Asistente IA para validar disponibilidad y cotizar citas
          </p>
        </div>

        {/* Acciones de la cabecera */}
        <div className="flex items-center gap-2.5">
          {mode === 'demo' ? (
            <button
              onClick={handleResetDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors shadow-xs"
              title="Restaurar datos predeterminados de la demo"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Restaurar demo</span>
            </button>
          ) : (
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || loadingTenants}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-teal-600')}
              />
              <span>{isRefreshing ? 'Actualizando...' : 'Actualizar'}</span>
            </button>
          )}

          <button
            onClick={() => {
              resetDoctorForm();
              setIsDoctorModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Especialista</span>
          </button>

          <button
            onClick={() => {
              resetServiceForm();
              setIsServiceModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Tratamiento</span>
          </button>
        </div>
      </div>

      {/* Doctores */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600" /> Especialistas Registrados
            </h2>
            <span className="text-xs bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-full border border-teal-200/60">
              {doctors.length} {doctors.length === 1 ? 'médico' : 'médicos'}
            </span>
          </div>

          <button
            onClick={() => {
              resetDoctorForm();
              setIsDoctorModalOpen(true);
            }}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 py-1 px-2 rounded-md hover:bg-teal-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar especialista
          </button>
        </div>

        {doctors.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="font-semibold text-slate-900 text-sm">
                No hay especialistas registrados en esta clínica
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Agrega especialistas para que el Asistente IA pueda consultar sus agendas y programar citas en tiempo real.
              </p>
            </div>
            <button
              onClick={() => {
                resetDoctorForm();
                setIsDoctorModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Registrar Primer Especialista
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {doctors.map((doc) => (
              <div
                key={doc.id}
                className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4 relative group hover:border-teal-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                      {getInitials(doc.name)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base sm:text-lg">{doc.name}</h3>
                      <p className="text-xs text-teal-700 font-medium mt-0.5">{doc.specialty}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {doc.status}
                    </span>
                    <button
                      onClick={() =>
                        setItemToDelete({
                          type: 'doctor',
                          id: doc.id,
                          name: doc.name,
                        })
                      }
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar especialista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 text-xs pt-3 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate text-slate-700">{doc.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="tabular-nums font-semibold text-slate-800">{doc.phone}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                      <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Horarios de Consulta:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {doc.scheduleChips?.map((chip, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200/90 rounded-lg text-xs tabular-nums text-slate-700"
                        >
                          <span className="font-bold text-teal-800">{chip.days}:</span>
                          <span className="font-medium text-slate-600">{chip.hours}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Duración base por cita:</span>
                    </span>
                    <span className="tabular-nums font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md">
                      {doc.slotDuration}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Servicios y Precios */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" /> Catálogo de Servicios y Anticipos
            </h2>
            <span className="text-xs bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-full border border-teal-200/60">
              {services.length} {services.length === 1 ? 'tratamiento' : 'tratamientos'}
            </span>
          </div>

          <button
            onClick={() => {
              resetServiceForm();
              setIsServiceModalOpen(true);
            }}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 py-1 px-2 rounded-md hover:bg-teal-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar tratamiento
          </button>
        </div>

        {services.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="font-semibold text-slate-900 text-sm">
                No hay tratamientos registrados en esta clínica
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Registra los tratamientos para que el Asistente IA pueda informar precios, duración y generar enlaces de pago de anticipos.
              </p>
            </div>
            <button
              onClick={() => {
                resetServiceForm();
                setIsServiceModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Registrar Primer Tratamiento
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">Tratamiento</th>
                    <th className="px-5 py-3.5">Categoría</th>
                    <th className="px-5 py-3.5">Duración</th>
                    <th className="px-5 py-3.5">Precio Oficial</th>
                    <th className="px-5 py-3.5">Anticipo Requerido</th>
                    <th className="px-5 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {services.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900">{s.name}</div>
                        {s.description && (
                          <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                            {s.description}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full border font-medium',
                            getCategoryBadgeClass(s.category)
                          )}
                        >
                          {s.category}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 tabular-nums font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {s.duration}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 tabular-nums">{s.price}</td>
                      <td className="px-5 py-3.5">
                        {s.requiredDepositMxn > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full tabular-nums">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            {s.deposit}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">
                            {s.deposit}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() =>
                            setItemToDelete({
                              type: 'service',
                              id: s.id,
                              name: s.name,
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar tratamiento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Registrar Nuevo Especialista */}
      {isDoctorModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Stethoscope className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Registrar Nuevo Especialista
                  </h3>
                  <p className="text-xs text-slate-500">
                    {mode === 'demo'
                      ? 'Se agregará a la demostración interactiva'
                      : `Se asociará a la clínica: ${activeTenant?.name || 'Activa'}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDoctorModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDoctor}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {doctorError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{doctorError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre completo del médico o especialista *
                  </label>
                  <input
                    type="text"
                    required
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Ej. Dra. Mariana Valdez"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Especialidad médica o dental *
                  </label>
                  <input
                    type="text"
                    required
                    value={docSpecialty}
                    onChange={(e) => setDocSpecialty(e.target.value)}
                    placeholder="Ej. Ortodoncia y Ortopedia Maxilofacial"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Teléfono WhatsApp
                    </label>
                    <input
                      type="text"
                      value={docPhone}
                      onChange={(e) => setDocPhone(e.target.value)}
                      placeholder="+52 55 1234 5678"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      value={docEmail}
                      onChange={(e) => setDocEmail(e.target.value)}
                      placeholder="dra.mariana@clinica.mx"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Horario de consulta / Disponibilidad
                  </label>
                  <input
                    type="text"
                    value={docSchedule}
                    onChange={(e) => setDocSchedule(e.target.value)}
                    placeholder="Lunes a Viernes: 9:00 - 18:00"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Duración base por cita
                  </label>
                  <select
                    value={docSlotDuration}
                    onChange={(e) => setDocSlotDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  >
                    <option value="30 minutos">30 minutos</option>
                    <option value="45 minutos">45 minutos</option>
                    <option value="60 minutos">60 minutos</option>
                    <option value="90 minutos">90 minutos</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDoctorModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDoctor}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmittingDoctor ? 'Guardando...' : 'Guardar Especialista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Nuevo Tratamiento */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Registrar Nuevo Tratamiento
                  </h3>
                  <p className="text-xs text-slate-500">
                    {mode === 'demo'
                      ? 'Se agregará a la demostración interactiva'
                      : `Se asociará a la clínica: ${activeTenant?.name || 'Activa'}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsServiceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateService}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {serviceError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{serviceError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre del tratamiento o procedimiento *
                  </label>
                  <input
                    type="text"
                    required
                    value={svcName}
                    onChange={(e) => setSvcName(e.target.value)}
                    placeholder="Ej. Ortodoncia con Brackets de Zafiro"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Categoría
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESET_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSvcCategory(cat)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                          svcCategory === cat
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={svcCategory}
                    onChange={(e) => setSvcCategory(e.target.value)}
                    placeholder="O escribe una categoría personalizada"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Duración del procedimiento
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESET_DURATIONS.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setSvcDurationMinutes(dur)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                          svcDurationMinutes === dur
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        )}
                      >
                        {dur} min
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="5"
                      step="5"
                      value={svcDurationMinutes}
                      onChange={(e) => setSvcDurationMinutes(Number(e.target.value))}
                      className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                    />
                    <span className="text-xs text-slate-500">minutos reservados en agenda</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Precio Oficial (MXN) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={svcPriceMxn}
                        onChange={(e) =>
                          setSvcPriceMxn(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        placeholder="450"
                        className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-12 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-xs">MXN</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Anticipo Requerido (MXN) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={svcRequiredDepositMxn}
                        onChange={(e) =>
                          setSvcRequiredDepositMxn(
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        placeholder="0"
                        className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-12 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-xs">MXN</span>
                    </div>
                  </div>
                </div>

                {/* Accesos rápidos de porcentaje para el anticipo */}
                {typeof svcPriceMxn === 'number' && svcPriceMxn > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="text-[11px] text-slate-400">Atajos de anticipo:</span>
                    <button
                      type="button"
                      onClick={() => setSvcRequiredDepositMxn(0)}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                    >
                      Sin anticipo ($0)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSvcRequiredDepositMxn(Math.round(svcPriceMxn * 0.2))
                      }
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                    >
                      20% (${Math.round(svcPriceMxn * 0.2)})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSvcRequiredDepositMxn(Math.round(svcPriceMxn * 0.5))
                      }
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                    >
                      50% (${Math.round(svcPriceMxn * 0.5)})
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Descripción breve (para el Asistente IA)
                  </label>
                  <textarea
                    rows={2}
                    value={svcDescription}
                    onChange={(e) => setSvcDescription(e.target.value)}
                    placeholder="Detalles clave que la IA puede explicarle al paciente por WhatsApp o llamada..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingService}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmittingService ? 'Guardando...' : 'Guardar Tratamiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Eliminación */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  ¿Eliminar{' '}
                  {itemToDelete.type === 'doctor' ? 'especialista' : 'tratamiento'}?
                </h3>
                <p className="text-xs text-slate-500">
                  Estás a punto de eliminar a{' '}
                  <strong className="text-slate-800 font-semibold">
                    &quot;{itemToDelete.name}&quot;
                  </strong>
                  . Esta acción removerá el registro de la disponibilidad del Asistente IA.
                </p>
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setItemToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
