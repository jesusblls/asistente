'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Users,
  Clock,
  DollarSign,
  Stethoscope,
  Plus,
  Trash2,
  Pencil,
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
import { AddDoctorModal } from '@/components/dashboard/team/AddDoctorModal';
import { AddServiceModal } from '@/components/dashboard/team/AddServiceModal';
import { DeleteConfirmModal } from '@/components/dashboard/team/DeleteConfirmModal';
import { FaqSection } from '@/components/dashboard/team/FaqSection';
import {
  defaultWeeklySchedule,
  fromAvailabilityRules,
  toAvailabilityRules,
  type WeeklySchedule,
} from '@/components/schedule/ScheduleEditor';

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
  /** Valores tal como los guarda la API, para poder reabrirlos en el editor. */
  rawPhone?: string | null;
  rawEmail?: string | null;
  rawAvailabilityRules?: string | null;
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
  const [docSchedule, setDocSchedule] = useState<WeeklySchedule>(defaultWeeklySchedule);
  const [docSlotDuration, setDocSlotDuration] = useState(45);
  const [isSubmittingDoctor, setIsSubmittingDoctor] = useState(false);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  // null = alta; con id = corrección de un especialista existente.
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);

  // Estados para Modal de Servicio
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcCategory, setSvcCategory] = useState('Diagnóstico');
  const [svcDurationMinutes, setSvcDurationMinutes] = useState(30);
  const [svcPriceMxn, setSvcPriceMxn] = useState<number | ''>(450);
  const [svcRequiredDepositMxn, setSvcRequiredDepositMxn] = useState<number | ''>(0);
  const [svcDescription, setSvcDescription] = useState('');
  const [isSubmittingService, setIsSubmittingService] = useState(false);
  // null = alta; con id = corrección de un tratamiento existente.
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
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
        rawPhone: doc.phone ?? null,
        rawEmail: doc.email ?? null,
        rawAvailabilityRules: doc.availabilityRules ?? null,
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
    setDocSchedule(defaultWeeklySchedule());
    setDocSlotDuration(45);
    setDoctorError(null);
    setEditingDoctorId(null);
  };

  // Abre el modal con los datos actuales del especialista para corregirlos.
  const openDoctorEditor = (doc: DisplayDoctor) => {
    const { schedule, slotDurationMinutes } = fromAvailabilityRules(doc.rawAvailabilityRules);
    setEditingDoctorId(doc.id);
    setDocName(doc.name);
    setDocSpecialty(doc.specialty);
    setDocPhone(doc.rawPhone || '');
    setDocEmail(doc.rawEmail || '');
    setDocSchedule(schedule);
    setDocSlotDuration(slotDurationMinutes);
    setDoctorError(null);
    setIsDoctorModalOpen(true);
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
    setEditingServiceId(null);
  };

  // Abre el modal con los datos actuales del tratamiento para corregirlos.
  const openServiceEditor = (svc: DisplayService) => {
    setEditingServiceId(svc.id);
    setSvcName(svc.name);
    setSvcCategory(svc.category);
    setSvcDurationMinutes(svc.durationMinutes);
    setSvcPriceMxn(svc.priceMxn);
    setSvcRequiredDepositMxn(svc.requiredDepositMxn);
    setSvcDescription(svc.description || '');
    setServiceError(null);
    setIsServiceModalOpen(true);
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
      const availabilityRules = toAvailabilityRules(docSchedule, docSlotDuration);

      if (mode === 'demo') {
        const { scheduleText, chips, slotDuration } = formatAvailabilityRules(
          JSON.stringify(availabilityRules)
        );
        const newDemoDoc: DisplayDoctor = {
          id: `demo-doc-${Date.now()}`,
          name: docName.trim(),
          specialty: docSpecialty.trim(),
          email: docEmail.trim() || 'contacto@sonrisaspolanco.mx',
          phone: docPhone.trim() ? formatMexicanPhone(docPhone) : '+52 (55) 0000-0000',
          schedule: scheduleText,
          scheduleChips: chips,
          slotDuration,
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

        const payload = {
          name: docName.trim(),
          specialty: docSpecialty.trim(),
          phone: docPhone.trim() || null,
          email: docEmail.trim() || null,
          availabilityRules,
        };

        const res = editingDoctorId
          ? await apiFetch(`${API_BASE_URL}/api/doctors/${editingDoctorId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await apiFetch(`${API_BASE_URL}/api/tenants/${targetTenantId}/doctors`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || (editingDoctorId ? 'Error al guardar los cambios' : 'Error al registrar el doctor')
          );
        }

        await refreshTenants();
        showToast(
          editingDoctorId
            ? `Especialista "${docName.trim()}" actualizado`
            : `Especialista "${docName.trim()}" registrado con éxito`
        );
        setIsDoctorModalOpen(false);
        resetDoctorForm();
      }
    } catch (err: unknown) {
      console.error('Error creando especialista:', err);
      setDoctorError(err instanceof Error ? err.message : 'No se pudo guardar el especialista');
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

        const payload = {
          name: svcName.trim(),
          description: svcDescription.trim() || null,
          durationMinutes: Number(svcDurationMinutes) || 30,
          priceMxn: price,
          requiredDepositMxn: deposit,
          category: svcCategory.trim() || 'General',
        };

        const res = editingServiceId
          ? await apiFetch(`${API_BASE_URL}/api/services/${editingServiceId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await apiFetch(`${API_BASE_URL}/api/tenants/${targetTenantId}/services`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error ||
              (editingServiceId ? 'Error al guardar los cambios' : 'Error al registrar el tratamiento')
          );
        }

        await refreshTenants();
        showToast(
          editingServiceId
            ? `Tratamiento "${svcName.trim()}" actualizado`
            : `Tratamiento "${svcName.trim()}" registrado con éxito`
        );
        setIsServiceModalOpen(false);
        resetServiceForm();
      }
    } catch (err: unknown) {
      console.error('Error creando tratamiento:', err);
      setServiceError(err instanceof Error ? err.message : 'No se pudo registrar el tratamiento');
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
    } catch (err: unknown) {
      console.error('Error al eliminar:', err);
      setDeleteError(err instanceof Error ? err.message : 'Error al procesar la eliminación');
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
                      onClick={() => openDoctorEditor(doc)}
                      className="p-1.5 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Editar especialista"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
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
            className="self-start sm:self-auto text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 py-1 px-2 rounded-md hover:bg-teal-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar tratamiento
          </button>
        </div>

        {/* Móvil: tarjetas por tratamiento; la tabla de 6 columnas no cabe en pantallas chicas */}
        {services.length > 0 && (
          <div className="md:hidden space-y-3">
            {services.map((s) => (
              <div
                key={s.id}
                className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                    {s.description && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{s.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => openServiceEditor(s)}
                    className="flex h-10 w-10 -mt-1 items-center justify-center text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors shrink-0"
                    title="Editar tratamiento"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setItemToDelete({
                        type: 'service',
                        id: s.id,
                        name: s.name,
                      })
                    }
                    className="flex h-10 w-10 -mr-1.5 -mt-1 items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Eliminar tratamiento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full border font-medium',
                      getCategoryBadgeClass(s.category)
                    )}
                  >
                    {s.category}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 tabular-nums font-medium">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {s.duration}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Precio oficial
                    </div>
                    <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                      {s.price}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Anticipo
                    </div>
                    <div className="mt-0.5">
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
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
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
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openServiceEditor(s)}
                          className="p-1.5 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Editar tratamiento"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
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

      {/* Preguntas frecuentes: el guion del Asistente IA fuera de la agenda */}
      <FaqSection
        mode={mode}
        tenantId={activeTenantId || activeTenant?.id}
        canEdit
        onToast={showToast}
      />

      {/* Modal: Registrar Nuevo Especialista */}
      <AddDoctorModal
        isOpen={isDoctorModalOpen}
        onClose={() => setIsDoctorModalOpen(false)}
        onSubmit={handleCreateDoctor}
        mode={mode}
        tenantName={activeTenant?.name}
        name={docName}
        setName={setDocName}
        specialty={docSpecialty}
        setSpecialty={setDocSpecialty}
        phone={docPhone}
        setPhone={setDocPhone}
        email={docEmail}
        setEmail={setDocEmail}
        isEditing={Boolean(editingDoctorId)}
        schedule={docSchedule}
        setSchedule={setDocSchedule}
        slotDuration={docSlotDuration}
        setSlotDuration={setDocSlotDuration}
        error={doctorError}
        isSubmitting={isSubmittingDoctor}
      />

      {/* Modal: Registrar Nuevo Tratamiento */}
      <AddServiceModal
        isOpen={isServiceModalOpen}
        onClose={() => setIsServiceModalOpen(false)}
        onSubmit={handleCreateService}
        mode={mode}
        tenantName={activeTenant?.name}
        name={svcName}
        setName={setSvcName}
        category={svcCategory}
        setCategory={setSvcCategory}
        isEditing={Boolean(editingServiceId)}
        presetCategories={PRESET_CATEGORIES}
        durationMinutes={svcDurationMinutes}
        setDurationMinutes={setSvcDurationMinutes}
        presetDurations={PRESET_DURATIONS}
        priceMxn={svcPriceMxn}
        setPriceMxn={setSvcPriceMxn}
        requiredDepositMxn={svcRequiredDepositMxn}
        setRequiredDepositMxn={setSvcRequiredDepositMxn}
        description={svcDescription}
        setDescription={setSvcDescription}
        error={serviceError}
        isSubmitting={isSubmittingService}
      />

      {/* Modal: Confirmación de Eliminación */}
      <DeleteConfirmModal
        target={itemToDelete}
        onClose={() => {
          setItemToDelete(null);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        error={deleteError}
      />
    </div>
  );
}
