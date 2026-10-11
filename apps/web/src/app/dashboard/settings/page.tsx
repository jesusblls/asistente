'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  PhoneCall,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  MapPin,
  Clock,
  Save,
  RefreshCw,
  Info,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { ChannelsPanel } from '@/components/dashboard/settings/ChannelsPanel';

const DEMO_SETTINGS = {
  name: 'Clínica Dental Sonrisas Polanco',
  phoneE164: '+52 (55) 5512-3456',
  address: 'Av. Horacio 1520, Polanco, Miguel Hidalgo, 11550 Ciudad de México, CDMX (Con Valet Parking)',
  timezone: 'America/Mexico_City (GMT-6)',
  welcomeMessage:
    '¡Hola! Bienvenido a Clínica Dental Sonrisas Polanco. ¿En qué podemos apoyarte hoy? Puedes agendar una consulta de valoración o consultar nuestros servicios.',
  emergencyInstructions:
    'En caso de traumatismo facial grave, pérdida de conciencia o dolor incapacitante, indicar al paciente acudir al Hospital Español de inmediato o marcar al 911.',
};

export default function SettingsPage() {
  const { mode, setMode, activeTenant, updateTenant, refreshTenants } = useTenant();

  // Estado del formulario para modo Live con sincronización reactiva al cambiar activeTenant
  const [prevTenantId, setPrevTenantId] = useState(activeTenant?.id);
  const [formData, setFormData] = useState(() => ({
    name: activeTenant?.name || '',
    phoneE164: activeTenant?.phoneE164 || '',
    address: activeTenant?.address || '',
    welcomeMessage:
      activeTenant?.welcomeMessage ||
      (activeTenant ? `¡Hola! Bienvenido a ${activeTenant.name}. ¿En qué podemos apoyarte hoy?` : ''),
    emergencyInstructions:
      activeTenant?.emergencyInstructions ||
      'En caso de traumatismo facial grave, pérdida de conciencia o dificultad para respirar, indicar al paciente acudir de inmediato al hospital más cercano o marcar al 911.',
 
    surveyEnabled: activeTenant?.surveyEnabled ?? true,
    recallMonths: activeTenant?.recallMonths === undefined ? 6 : activeTenant.recallMonths,
  }));

  if (activeTenant && activeTenant.id !== prevTenantId) {
    setPrevTenantId(activeTenant.id);
    setFormData({
      name: activeTenant.name || '',
      phoneE164: activeTenant.phoneE164 || '',
      address: activeTenant.address || '',
      welcomeMessage:
        activeTenant.welcomeMessage ||
        `¡Hola! Bienvenido a ${activeTenant.name}. ¿En qué podemos apoyarte hoy?`,
      emergencyInstructions:
        activeTenant.emergencyInstructions ||
        'En caso de traumatismo facial grave, pérdida de conciencia o dificultad para respirar, indicar al paciente acudir de inmediato al hospital más cercano o marcar al 911.',

      surveyEnabled: activeTenant.surveyEnabled ?? true,
      recallMonths: activeTenant.recallMonths === undefined ? 6 : activeTenant.recallMonths,
    });
  }

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Un solo temporizador: un aviso nuevo no debe desaparecer por el timeout del anterior.
  const notify = useCallback((tone: 'success' | 'error', text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ tone, text });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  // Manejador de guardado en tiempo real
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (mode === 'demo') {
      notify('success', 'Modo Showcase: los parámetros mostrados son de muestra. Cambia a "En Vivo" para guardar cambios reales.');
      return;
    }

    if (!activeTenant?.id) return;

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const payload = {
        name: formData.name.trim(),
        phoneE164: formData.phoneE164.trim(),
        address: formData.address.trim(),
        welcomeMessage: formData.welcomeMessage.trim(),
        emergencyInstructions: formData.emergencyInstructions.trim(),
        surveyEnabled: formData.surveyEnabled,
        recallMonths: formData.recallMonths,
      };

      const res = await updateTenant(activeTenant.id, payload);

      if (res) {
        setSaveStatus('success');
        notify('success', 'Datos de la clínica guardados');
        await refreshTenants();

        setTimeout(() => {
          setSaveStatus('idle');
        }, 3500);
      } else {
        setSaveStatus('error');
        notify('error', 'No fue posible guardar los cambios. Verifica la conexión.');
      }
    } catch (err) {
      console.error('Error guardando configuración de clínica:', err);
      setSaveStatus('error');
      notify('error', 'Error inesperado al conectar con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  const isDemo = mode === 'demo';

  return (
    <div className="p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto">
      {/* Toast Flotante de Notificación */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          {toast.tone === 'success' ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 border border-red-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
          )}
          <p className="text-sm font-semibold text-white">{toast.text}</p>
        </div>
      )}

      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight font-sans">
              Configuración de Canales y Telefonía (+52)
            </h1>
            {isDemo ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Modo Demo Showcase
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Base de Datos Viva
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isDemo
              ? 'Parámetros modelo predeterminados para demostraciones de recepción virtual en clínicas de México'
              : `Gestionando: ${activeTenant?.name || 'Clínica Activa'} • WhatsApp, llamadas y pagos`}
          </p>
          <p className="text-xs text-slate-400 mt-1">Motor de IA: DeepSeek</p>
        </div>
      </div>

      {/* Banner de Estado del Modo */}
      {isDemo ? (
        <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl shrink-0 mt-0.5 sm:mt-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-purple-900">Parámetros Modelo de Muestra (Showcase)</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">
                  Solo Lectura
                </span>
              </div>
              <p className="text-xs text-purple-700 mt-1 leading-relaxed">
                Estás visualizando la configuración recomendada para clínicas dentales de alta gama en México.
                Para configurar tu propia clínica y su número de WhatsApp, activa el modo <strong className="font-semibold text-purple-900">&quot;En Vivo&quot;</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMode('live')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-semibold shrink-0 transition-colors shadow-sm"
          >
            Cambiar a Modo En Vivo
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-emerald-900">Configuración de tu clínica</h2>
              </div>
              <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                Los datos que guardes aquí los usa el asistente desde el siguiente mensaje o llamada. Abajo ves el estado real de cada canal.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <span className="text-xs font-mono font-medium text-emerald-800 bg-emerald-100/80 px-3 py-1.5 rounded-lg border border-emerald-200">
              ID: {activeTenant?.id}
            </span>
          </div>
        </div>
      )}

      {/* Estado real de los canales (WhatsApp propio, llamadas y pagos) */}
      <ChannelsPanel
        isDemo={isDemo}
        demoPhone={DEMO_SETTINGS.phoneE164}
        tenantId={activeTenant?.id}
        notify={notify}
      />

      {/* Formulario de Datos de la Clínica */}
      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-8 space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight font-sans">
                {isDemo ? 'Parámetros Informativos de la Clínica (Demo)' : 'Datos de la Clínica Activa'}
              </h2>
              {isDemo ? (
                <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full">
                  Showcase
                </span>
              ) : (
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Base de Datos Viva
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isDemo
                ? 'Parámetros modelo recomendados para una clínica dental y médica de alta gama en México'
                : 'Configura la información oficial que el agente de inteligencia artificial utilizará para atender llamadas y ubicar a los pacientes'}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0">
            ID: {isDemo ? 'demo-polanco' : activeTenant?.id || 'cargando...'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          {/* Nombre de la Clínica */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-600" />
                Nombre Oficial de la Clínica
              </label>
              {isDemo && (
                <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Showcase
                </span>
              )}
            </div>
            <input
              type="text"
              value={isDemo ? DEMO_SETTINGS.name : formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              readOnly={isDemo}
              placeholder="Ej. Clínica Dental Sonrisas Polanco"
              className={`w-full px-4 py-2.5 rounded-xl text-sm transition-all shadow-2xs ${
                isDemo
                  ? 'bg-slate-100/80 border border-slate-200 text-slate-700 cursor-default'
                  : 'bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white'
              }`}
            />
            <p className="text-xs text-slate-400">
              Nombre con el que la recepcionista virtual se presenta ante los pacientes en llamadas y chats.
            </p>
          </div>

          {/* Teléfono Oficial (+52) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                <PhoneCall className="w-4 h-4 text-teal-600" />
                Teléfono Oficial en México (+52)
              </label>
              {isDemo && (
                <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Showcase
                </span>
              )}
            </div>
            <input
              type="text"
              value={isDemo ? DEMO_SETTINGS.phoneE164 : formData.phoneE164}
              onChange={(e) => setFormData((prev) => ({ ...prev, phoneE164: e.target.value }))}
              readOnly={isDemo}
              placeholder="+525512345678"
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-mono tabular-nums transition-all shadow-2xs ${
                isDemo
                  ? 'bg-slate-100/80 border border-slate-200 text-slate-700 cursor-default'
                  : 'bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white'
              }`}
            />
            <p className="text-xs text-slate-400">
              Teléfono principal de la clínica (+52, formato E.164); con él se identifican las llamadas entrantes. El número de WhatsApp se configura en la sección de canales.
            </p>
          </div>

          {/* Zona Horaria Oficial */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-600" />
                Zona Horaria Oficial de Operación
              </label>
              <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Predeterminada México
              </span>
            </div>
            <input
              type="text"
              value={isDemo ? DEMO_SETTINGS.timezone : activeTenant?.timezone || 'America/Mexico_City (GMT-6)'}
              disabled
              className="w-full px-4 py-2.5 bg-slate-100/80 border border-slate-200 rounded-xl text-sm text-slate-600 cursor-not-allowed font-mono shadow-2xs"
            />
            <p className="text-xs text-slate-400">
              Alineada con el huso horario oficial de Ciudad de México para validación rigurosa de agenda y citas.
            </p>
          </div>

          {/* Dirección física y Referencias */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-teal-600" />
                Dirección Física y Referencias de Llegada
              </label>
              {isDemo && (
                <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Showcase
                </span>
              )}
            </div>
            <input
              type="text"
              value={isDemo ? DEMO_SETTINGS.address : formData.address}
              onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
              readOnly={isDemo}
              placeholder="Calle, número, colonia, código postal y referencias (estacionamiento, valet, metro cercano)"
              className={`w-full px-4 py-2.5 rounded-xl text-sm transition-all shadow-2xs ${
                isDemo
                  ? 'bg-slate-100/80 border border-slate-200 text-slate-700 cursor-default'
                  : 'bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white'
              }`}
            />
            <p className="text-xs text-slate-400">
              La recepcionista IA comparte esta dirección exacta cuando los pacientes solicitan indicaciones o confirman su cita.
            </p>
          </div>

          {/* Mensaje de Bienvenida Personalizado */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-teal-600" />
                Mensaje de Bienvenida Personalizado (Saludo Inicial)
              </label>
              {isDemo && (
                <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Showcase
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={isDemo ? DEMO_SETTINGS.welcomeMessage : formData.welcomeMessage}
              onChange={(e) => setFormData((prev) => ({ ...prev, welcomeMessage: e.target.value }))}
              readOnly={isDemo}
              placeholder="¡Hola! Bienvenido a nuestra clínica. ¿En qué podemos apoyarte hoy? Puedes agendar una cita o consultar tratamientos."
              className={`w-full px-4 py-2.5 rounded-xl text-sm leading-relaxed transition-all shadow-2xs ${
                isDemo
                  ? 'bg-slate-100/80 border border-slate-200 text-slate-700 cursor-default'
                  : 'bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white'
              }`}
            />
            <p className="text-xs text-slate-400">
              Frase inicial empleada para contestar llamadas entrantes y el primer mensaje de WhatsApp.
            </p>
          </div>

          {/* Protocolo de Urgencias Médicas (911 / Hospital) */}
          <div className="space-y-2 md:col-span-2 p-5 rounded-2xl bg-amber-50/40 border border-amber-200/80">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-amber-900 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Protocolo de Urgencias Médicas (Triaje Nivel 1: 911 / Hospital)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full">
                  Protocolo Crítico
                </span>
                {isDemo && (
                  <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    Showcase
                  </span>
                )}
              </div>
            </div>
            <textarea
              rows={3}
              value={isDemo ? DEMO_SETTINGS.emergencyInstructions : formData.emergencyInstructions}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, emergencyInstructions: e.target.value }))
              }
              readOnly={isDemo}
              placeholder="Instrucciones en caso de traumatismo facial, dolor severo, hemorragia o disnea..."
              className={`w-full px-4 py-2.5 rounded-xl text-sm leading-relaxed transition-all shadow-2xs ${
                isDemo
                  ? 'bg-white/80 border border-amber-200 text-slate-700 cursor-default'
                  : 'bg-white border border-amber-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600'
              }`}
            />
            <p className="text-xs text-amber-700/90">
              Cuando el motor de triaje detecta signos de emergencia médica o dolor severo incapacitante, activa de inmediato este protocolo e instruye al paciente acudir al hospital de urgencias o marcar al 911.
            </p>
          </div>
        </div>

        {/* Seguimiento después de la cita */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              checked={isDemo ? true : formData.surveyEnabled}
              disabled={isDemo}
              onChange={(e) => setFormData((prev) => ({ ...prev, surveyEnabled: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Encuesta después de la cita</span>
              <span className="block text-xs text-slate-500 mt-1 leading-relaxed">
                Unas horas después de una cita marcada como <strong>completada</strong>, el paciente califica su visita
                por WhatsApp. Si responde &ldquo;Mejorable&rdquo;, el chat pasa a recepción y te avisamos.
              </span>
            </span>
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <label htmlFor="recallMonths" className="block text-sm font-semibold text-slate-800">
              Invitación a revisión periódica
            </label>
            <select
              id="recallMonths"
              disabled={isDemo}
              value={isDemo ? '6' : formData.recallMonths === null ? 'off' : String(formData.recallMonths)}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  recallMonths: e.target.value === 'off' ? null : Number(e.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              <option value="off">Desactivada</option>
              <option value="3">Cada 3 meses</option>
              <option value="6">Cada 6 meses (limpieza semestral)</option>
              <option value="12">Cada 12 meses</option>
            </select>
            <p className="text-xs text-slate-500 leading-relaxed">
              A quien no ha vuelto en ese tiempo y no tiene cita en agenda se le invita por WhatsApp a agendar su
              revisión.
            </p>
          </div>
        </div>

        {/* Barra de Acciones y Guardado */}
        <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            {isDemo ? (
              <span className="flex items-center gap-1.5 text-purple-700 font-medium">
                <Info className="w-4 h-4 shrink-0" />
                Los parámetros en modo Demo Showcase son informativos y no modifican la base de datos viva.
              </span>
            ) : saveStatus === 'success' ? (
              <span className="flex items-center gap-2 text-emerald-700 font-semibold bg-emerald-50 px-3.5 py-2 rounded-xl border border-emerald-200 animate-in fade-in duration-300 shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Datos de la clínica guardados
              </span>
            ) : saveStatus === 'error' ? (
              <span className="flex items-center gap-2 text-red-600 font-medium bg-red-50 px-3.5 py-2 rounded-xl border border-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Error al guardar los datos. Inténtalo de nuevo.
              </span>
            ) : (
              <span className="text-slate-400">
                El asistente usará los datos guardados desde el siguiente mensaje o llamada.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {isDemo ? (
              <button
                type="button"
                onClick={() => setMode('live')}
                className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Cambiar a Modo En Vivo para Editar
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSaving}
                className={`px-6 py-2.5 text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2 ${
                  saveStatus === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando cambios...
                  </>
                ) : saveStatus === 'success' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Configuración Guardada
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Cambios
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
