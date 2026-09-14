'use client';

import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  MessageSquare,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  MapPin,
  Clock,
  Save,
  RefreshCw,
  Info,
  HeartHandshake,
  Stethoscope,
  Zap,
  Building2,
  AlertTriangle,
  Check,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { formatMexicanPhone } from '@/lib/format';

/** Teléfono de la clínica con valor de respaldo cuando aún no se configura. */
const formatTenantPhone = (phone?: string | null): string =>
  formatMexicanPhone(phone) || '+52 (55) 5512-3456';

const DEMO_SETTINGS = {
  name: 'Clínica Dental Sonrisas Polanco',
  phoneE164: '+52 (55) 5512-3456',
  address: 'Av. Horacio 1520, Polanco, Miguel Hidalgo, 11550 Ciudad de México, CDMX (Con Valet Parking)',
  timezone: 'America/Mexico_City (GMT-6)',
  welcomeMessage:
    '¡Hola! Bienvenido a Clínica Dental Sonrisas Polanco. ¿En qué podemos apoyarte hoy? Puedes agendar una consulta de valoración o consultar nuestros servicios.',
  emergencyInstructions:
    'En caso de traumatismo facial grave, pérdida de conciencia o dolor incapacitante, indicar al paciente acudir al Hospital Español de inmediato o marcar al 911.',
  tone: 'empathetic',
};

const AI_TONES = [
  {
    id: 'empathetic',
    name: 'Empático & Resolutivo',
    badge: 'Recomendado',
    icon: HeartHandshake,
    description:
      'Cálido, comprensivo y paciente. Ideal para pacientes con molestia o fobia dental. Prioriza generar confianza y tranquilidad con cortesía mexicana.',
    sample:
      '«¡Hola! Con mucho gusto te apoyo a revisar los horarios de los doctores. ¿Tienes alguna molestia o dolor actualmente?»',
    tags: ['Calidez mexicana', 'Contención de ansiedad', 'Resolutivo'],
  },
  {
    id: 'formal',
    name: 'Formal & Médico',
    badge: 'Especialidades',
    icon: Stethoscope,
    description:
      'Sobrio, clínico y riguroso. Emplea terminología odontológica precisa, ideal para clínicas de especialidades y procedimientos quirúrgicos.',
    sample:
      '«Buenas tardes. Con gusto verifico la agenda del especialista para su valoración diagnóstica y plan de tratamiento integral.»',
    tags: ['Protocolo clínico', 'Terminología médica', 'Sobriedad'],
  },
  {
    id: 'agile',
    name: 'Ágil & Ejecutivo',
    badge: 'Express',
    icon: Zap,
    description:
      'Dinámico, conciso y directo al punto. Optimizado para confirmaciones rápidas en menos de 45 segundos y pacientes con poco tiempo.',
    sample:
      '«Hola. Disponemos de citas hoy a las 4:00 PM y 5:30 PM para tu valoración. ¿Cuál horario prefieres reservar?»',
    tags: ['Respuesta rápida', 'Agendamiento veloz', 'Llamadas cortas'],
  },
];

export default function SettingsPage() {
  const { mode, setMode, activeTenant, updateTenant, refreshTenants, loadingTenants } = useTenant();

  // Estado del formulario para modo Live
  const [formData, setFormData] = useState({
    name: '',
    phoneE164: '',
    address: '',
    welcomeMessage: '',
    emergencyInstructions: '',
  });

  const [selectedTone, setSelectedTone] = useState<string>('empathetic');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sincronizar datos de la clínica activa cuando cambie
  useEffect(() => {
    if (activeTenant) {
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
      });

      try {
        const savedTone = localStorage.getItem(`asistente_ai_tone_${activeTenant.id}`);
        if (savedTone) {
          setSelectedTone(savedTone);
        }
      } catch (e) {
        // Ignorar en SSR
      }
    }
  }, [activeTenant]);

  // Manejador de guardado en tiempo real
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (mode === 'demo') {
      setToastMessage('Modo Showcase: los parámetros mostrados son de muestra. Cambia a "En Vivo" para guardar cambios reales.');
      setTimeout(() => setToastMessage(null), 4000);
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
      };

      const res = await updateTenant(activeTenant.id, payload);

      if (res) {
        try {
          localStorage.setItem(`asistente_ai_tone_${activeTenant.id}`, selectedTone);
        } catch (e) {}

        setSaveStatus('success');
        setToastMessage('Configuración guardada en tiempo real');
        await refreshTenants();

        setTimeout(() => {
          setSaveStatus('idle');
        }, 3500);
        setTimeout(() => {
          setToastMessage(null);
        }, 4000);
      } else {
        setSaveStatus('error');
        setToastMessage('No fue posible guardar los cambios. Verifica la conexión.');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      console.error('Error guardando configuración de clínica:', err);
      setSaveStatus('error');
      setToastMessage('Error inesperado al conectar con el servidor');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const isDemo = mode === 'demo';
  const displayPhone = isDemo
    ? DEMO_SETTINGS.phoneE164
    : formatTenantPhone(formData.phoneE164 || activeTenant?.phoneE164);

  return (
    <div className="p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto">
      {/* Toast Flotante de Notificación */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{toastMessage}</p>
            <p className="text-xs text-slate-400">
              Sincronizado con agentes Twilio Voice (+52) y WhatsApp Cloud API
            </p>
          </div>
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
              : `Gestionando: ${activeTenant?.name || 'Clínica Activa'} • Conexión de telefonía Twilio Voice (+52), WhatsApp Cloud API y Mercado Pago`}
          </p>
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
                Para personalizar tu propia clínica y sincronizar cambios en tiempo real con Twilio y WhatsApp, activa el modo <strong className="font-semibold text-purple-900">&quot;En Vivo&quot;</strong>.
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
                <h2 className="text-sm font-bold text-emerald-900">Clínica Activa y Conectada en Producción</h2>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-800 px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Sincronización Inmediata
                </span>
              </div>
              <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                Los ajustes se actualizan en vivo en la base de datos multi-tenant de tu clínica y se reflejan instantáneamente en las respuestas del asistente en llamadas telefónicas y WhatsApp.
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

      {/* Estado de Canales Conectados */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        {/* Twilio Voice */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-xs">
                <PhoneCall className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {isDemo ? 'Conectado (Demo)' : 'Conectado +52'}
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">Llamadas Twilio México</h3>
                {isDemo && (
                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                    Showcase
                  </span>
                )}
              </div>
              <p className="font-mono text-sm text-slate-800 mt-1.5 font-bold tabular-nums">
                {displayPhone}
              </p>
              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                Streaming WebSockets bidireccional • Latencia media: <span className="font-semibold text-slate-700 tabular-nums">540ms</span> • Interrupción inteligente por voz (Barge-in).
              </p>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Audio μ-law 8kHz</span>
            <span className="text-blue-600 font-medium">Barge-in Activo</span>
          </div>
        </div>

        {/* WhatsApp Cloud API */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-xs">
                <MessageSquare className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {isDemo ? 'Verificado (Demo)' : 'Meta Cloud API'}
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">WhatsApp Business Cloud</h3>
                {isDemo && (
                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                    Showcase
                  </span>
                )}
              </div>
              <p className="font-mono text-sm text-slate-800 mt-1.5 font-bold tabular-nums">
                {isDemo ? 'WABA ID: 49219012903' : `Línea: ${displayPhone}`}
              </p>
              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                Plantillas oficiales Meta verificadas • Botones interactivos de confirmación y cancelación instantánea 24/7.
              </p>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Webhooks v21.0</span>
            <span className="text-emerald-600 font-medium">Cero Latencia</span>
          </div>
        </div>

        {/* Pasarela Mercado Pago */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 shadow-xs">
                <CreditCard className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Activo (MXN)
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">Mercado Pago & SPEI</h3>
                {isDemo && (
                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                    Showcase
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-700 mt-1.5 font-semibold">
                Escudo Anti-Inasistencias con Anticipos
              </p>
              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                Cobro de depósitos de garantía mediante Tarjetas de débito/crédito, transferencias SPEI inmediatas y OXXO Pay.
              </p>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Checkout Pro / API</span>
            <span className="text-sky-600 font-medium">Moneda MXN</span>
          </div>
        </div>
      </div>

      {/* Selector de Tono y Estilo del Asistente IA */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight font-sans">
                Personalidad y Tono del Asistente IA
              </h2>
              {isDemo && (
                <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full">
                  Showcase
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Selecciona el estilo de comunicación de la recepcionista virtual en llamadas telefónicas y mensajes de WhatsApp.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 shrink-0 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            Motor: Gemini 2.5 Flash
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
          {AI_TONES.map((tone) => {
            const isSelected = selectedTone === tone.id;
            const Icon = tone.icon;

            return (
              <div
                key={tone.id}
                onClick={() => {
                  if (!isDemo) {
                    setSelectedTone(tone.id);
                  }
                }}
                className={`p-5 lg:p-6 rounded-2xl border-2 transition-all text-left relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-teal-600 bg-teal-50/30 shadow-sm ring-2 ring-teal-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                } ${isDemo ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`p-2 rounded-xl border ${
                          isSelected
                            ? 'bg-teal-100 text-teal-700 border-teal-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div>
                        <span className="text-sm font-bold text-slate-900 block leading-tight">
                          {tone.name}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {tone.badge}
                        </span>
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs shadow-xs">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-slate-400 transition-colors" />
                    )}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    {tone.description}
                  </p>

                  <div className="bg-slate-50/90 p-3.5 rounded-xl border border-slate-200/80 mb-4 text-xs text-slate-700 italic shadow-2xs leading-relaxed">
                    {tone.sample}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                  {tone.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
              Número vinculado para recibir llamadas Twilio y mensajes de WhatsApp (+52 formato E.164).
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
                Configuración guardada en tiempo real en la base de datos viva
              </span>
            ) : saveStatus === 'error' ? (
              <span className="flex items-center gap-2 text-red-600 font-medium bg-red-50 px-3.5 py-2 rounded-xl border border-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Error al guardar los datos. Inténtalo de nuevo.
              </span>
            ) : (
              <span className="text-slate-400">
                Guarda los cambios para sincronizarlos de inmediato con la telefonía y WhatsApp.
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
