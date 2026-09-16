'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Stethoscope,
  DollarSign,
  HelpCircle,
  CheckCircle2,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { API_BASE_URL, apiFetch, getSessionTenant } from '@/lib/api';
import {
  ScheduleEditor,
  defaultWeeklySchedule,
  describeSchedule,
  toAvailabilityRules,
  type WeeklySchedule,
} from '@/components/schedule/ScheduleEditor';

/**
 * Asistente de configuración inicial.
 *
 * Una clínica recién registrada no tiene doctores, horarios, precios ni
 * preguntas frecuentes. Sin eso el agente no puede ofrecer un solo horario ni
 * cotizar un tratamiento: contestaría el teléfono para no poder ayudar en
 * nada. Este flujo captura ese mínimo antes de soltarla al panel.
 */

const STEPS = [
  { key: 'clinica', label: 'Tu clínica', icon: Building2 },
  { key: 'doctores', label: 'Especialistas', icon: Stethoscope },
  { key: 'tratamientos', label: 'Tratamientos', icon: DollarSign },
  { key: 'faqs', label: 'Preguntas', icon: HelpCircle },
  { key: 'listo', label: 'Listo', icon: CheckCircle2 },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

/** Arranques sugeridos: se capturan de un clic y se pueden editar después. */
const FAQ_SUGERIDAS = [
  {
    question: '¿Tienen estacionamiento?',
    answer: 'Sí, contamos con estacionamiento para pacientes.',
    category: 'Ubicación',
  },
  {
    question: '¿Qué formas de pago aceptan?',
    answer: 'Aceptamos efectivo, tarjeta de débito y crédito, y transferencia SPEI.',
    category: 'Pagos',
  },
  {
    question: '¿Trabajan con aseguradoras?',
    answer: 'Sí, trabajamos con las principales aseguradoras. Trae tu póliza vigente.',
    category: 'Pagos',
  },
  {
    question: '¿Atienden urgencias el mismo día?',
    answer: 'Sí, damos prioridad a urgencias dentales. Llámanos y te canalizamos de inmediato.',
    category: 'Procedimientos',
  },
];

const CATEGORIAS = ['Diagnóstico', 'Prevención', 'Estética', 'Cirugía', 'Especialidad', 'General'];

interface Progreso {
  doctors: number;
  services: number;
  faqs: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progreso>({ doctors: 0, services: 0, faqs: 0 });

  // Paso 1: datos de la clínica
  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [emergencyInstructions, setEmergencyInstructions] = useState('');

  // Paso 2: especialista
  const [docName, setDocName] = useState('');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docSchedule, setDocSchedule] = useState<WeeklySchedule>(defaultWeeklySchedule);
  const [docSlotDuration, setDocSlotDuration] = useState(45);

  // Paso 3: tratamiento
  const [svcName, setSvcName] = useState('');
  const [svcCategory, setSvcCategory] = useState('Diagnóstico');
  const [svcDuration, setSvcDuration] = useState(30);
  const [svcPrice, setSvcPrice] = useState<number | ''>(450);
  const [svcDeposit, setSvcDeposit] = useState<number | ''>(0);

  // Paso 4: preguntas seleccionadas
  const [faqsElegidas, setFaqsElegidas] = useState<number[]>([0, 1]);

  const currentStep = STEPS[stepIndex];

  const cargarEstado = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/onboarding`);
      if (!res.ok) throw new Error('No se pudo cargar la configuración');
      const data = await res.json();

      // Ya terminó: no tiene sentido volver a pasarlo por el asistente.
      if (data.completedAt) {
        router.replace('/dashboard');
        return;
      }

      setTenantId(data.tenant.id);
      setClinicName(data.tenant.name || '');
      setAddress(data.tenant.address || '');
      setWelcomeMessage(data.tenant.welcomeMessage || '');
      setEmergencyInstructions(data.tenant.emergencyInstructions || '');
      setProgress(data.progress);

      const guardado = STEPS.findIndex((s) => s.key === (data.step as StepKey));
      if (guardado > 0) setStepIndex(guardado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const sesion = getSessionTenant();
    if (sesion) setTenantId(sesion.id);
    cargarEstado();
  }, [cargarEstado]);

  const guardarPaso = async (siguiente: StepKey) => {
    await apiFetch(`${API_BASE_URL}/api/onboarding`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: siguiente }),
    });
  };

  const avanzar = async () => {
    setError(null);
    setSaving(true);

    try {
      if (!tenantId) throw new Error('No hay una clínica activa');

      if (currentStep.key === 'clinica') {
        if (!clinicName.trim()) throw new Error('El nombre de la clínica es obligatorio');
        const res = await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: clinicName.trim(),
            address: address.trim(),
            welcomeMessage: welcomeMessage.trim(),
            emergencyInstructions: emergencyInstructions.trim(),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'No se pudieron guardar los datos de la clínica');
        }
      }

      if (currentStep.key === 'doctores') {
        // Solo se exige capturar uno si todavía no hay ninguno: quien regresa
        // al asistente con especialistas ya dados de alta puede seguir de largo.
        if (progress.doctors === 0 || docName.trim()) {
          if (!docName.trim() || !docSpecialty.trim()) {
            throw new Error('Captura el nombre y la especialidad del primer especialista');
          }
          const res = await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/doctors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: docName.trim(),
              specialty: docSpecialty.trim(),
              availabilityRules: toAvailabilityRules(docSchedule, docSlotDuration),
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'No se pudo registrar al especialista');
          }
          setProgress((p) => ({ ...p, doctors: p.doctors + 1 }));
          setDocName('');
          setDocSpecialty('');
        }
      }

      if (currentStep.key === 'tratamientos') {
        if (progress.services === 0 || svcName.trim()) {
          if (!svcName.trim()) throw new Error('Captura el nombre del primer tratamiento');
          const res = await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: svcName.trim(),
              category: svcCategory,
              durationMinutes: Number(svcDuration) || 30,
              priceMxn: Number(svcPrice) || 0,
              requiredDepositMxn: Number(svcDeposit) || 0,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'No se pudo registrar el tratamiento');
          }
          setProgress((p) => ({ ...p, services: p.services + 1 }));
          setSvcName('');
        }
      }

      if (currentStep.key === 'faqs') {
        for (const i of faqsElegidas) {
          const faq = FAQ_SUGERIDAS[i];
          await apiFetch(`${API_BASE_URL}/api/tenants/${tenantId}/faqs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(faq),
          });
        }
        setProgress((p) => ({ ...p, faqs: p.faqs + faqsElegidas.length }));
      }

      const siguiente = STEPS[stepIndex + 1];
      if (siguiente) {
        await guardarPaso(siguiente.key);
        setStepIndex(stepIndex + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar este paso');
    } finally {
      setSaving(false);
    }
  };

  const terminar = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'listo', completed: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo terminar la configuración');
      }
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo terminar la configuración');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Preparando tu clínica…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <div className="inline-flex items-center gap-2 text-teal-700 mb-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Configura tu asistente
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Enséñale a tu asistente cómo trabaja tu clínica
          </h1>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Sin horarios, precios y respuestas reales, la IA contestaría el teléfono sin poder
            ayudar a nadie. Son cinco pasos y puedes cambiarlo todo después.
          </p>
        </header>

        {/* Barra de pasos */}
        <nav aria-label="Progreso" className="mb-6">
          <ol className="flex items-center gap-1.5 sm:gap-2">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <li key={step.key} className="flex-1">
                  <div
                    className={`flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : done
                          ? 'bg-teal-50 border-teal-200 text-teal-800'
                          : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    {done ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="hidden sm:inline truncate">{step.label}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {error && (
            <div
              role="alert"
              className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Paso 1 */}
          {currentStep.key === 'clinica' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Datos de tu clínica</h2>
              <p className="text-xs text-slate-500 -mt-2">
                El asistente los usa para saludar y para decirle a los pacientes dónde estás.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-name">
                  Nombre de la clínica *
                </label>
                <input
                  id="ob-name"
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-addr">
                  Dirección
                </label>
                <textarea
                  id="ob-addr"
                  rows={2}
                  maxLength={300}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle, número, colonia, referencias (estacionamiento, metro cercano)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-wel">
                  Saludo de bienvenida
                </label>
                <textarea
                  id="ob-wel"
                  rows={2}
                  maxLength={1000}
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder="¡Hola! Bienvenido a nuestra clínica. ¿En qué podemos apoyarte hoy?"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-eme">
                  Qué decir en una urgencia
                </label>
                <textarea
                  id="ob-eme"
                  rows={2}
                  maxLength={1000}
                  value={emergencyInstructions}
                  onChange={(e) => setEmergencyInstructions(e.target.value)}
                  placeholder="Acudir a urgencias o llamar al 911 en caso de dolor incapacitante, hemorragia o dificultad para respirar."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* Paso 2 */}
          {currentStep.key === 'doctores' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Tu primer especialista</h2>
              <p className="text-xs text-slate-500 -mt-2">
                El horario es lo que decide qué citas puede ofrecer el asistente. Si lo dejas mal,
                rechazará pacientes en horas en las que sí atiendes.
              </p>

              {progress.doctors > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Ya tienes {progress.doctors}{' '}
                  {progress.doctors === 1 ? 'especialista registrado' : 'especialistas registrados'}.
                  Puedes agregar otro o continuar.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-doc">
                    Nombre {progress.doctors === 0 && '*'}
                  </label>
                  <input
                    id="ob-doc"
                    type="text"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Dra. Mariana Valdez"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-esp">
                    Especialidad {progress.doctors === 0 && '*'}
                  </label>
                  <input
                    id="ob-esp"
                    type="text"
                    value={docSpecialty}
                    onChange={(e) => setDocSpecialty(e.target.value)}
                    placeholder="Odontología General"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              <ScheduleEditor
                schedule={docSchedule}
                onChange={setDocSchedule}
                slotDurationMinutes={docSlotDuration}
                onSlotDurationChange={setDocSlotDuration}
              />

              <p className="text-[11px] text-slate-500">
                Resumen: <span className="font-semibold">{describeSchedule(docSchedule)}</span>
              </p>
            </div>
          )}

          {/* Paso 3 */}
          {currentStep.key === 'tratamientos' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Tu primer tratamiento</h2>
              <p className="text-xs text-slate-500 -mt-2">
                Con esto el asistente cotiza por teléfono y WhatsApp. El anticipo es opcional y
                sirve para reducir inasistencias.
              </p>

              {progress.services > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Ya tienes {progress.services}{' '}
                  {progress.services === 1 ? 'tratamiento registrado' : 'tratamientos registrados'}.
                  Puedes agregar otro o continuar.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-svc">
                  Nombre del tratamiento {progress.services === 0 && '*'}
                </label>
                <input
                  id="ob-svc"
                  type="text"
                  value={svcName}
                  onChange={(e) => setSvcName(e.target.value)}
                  placeholder="Limpieza Dental con Ultrasonido"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-cat">
                    Categoría
                  </label>
                  <select
                    id="ob-cat"
                    value={svcCategory}
                    onChange={(e) => setSvcCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-dur">
                    Duración
                  </label>
                  <select
                    id="ob-dur"
                    value={svcDuration}
                    onChange={(e) => setSvcDuration(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-pre">
                    Precio (MXN)
                  </label>
                  <input
                    id="ob-pre"
                    type="number"
                    min={0}
                    value={svcPrice}
                    onChange={(e) => setSvcPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ob-ant">
                    Anticipo (MXN)
                  </label>
                  <input
                    id="ob-ant"
                    type="number"
                    min={0}
                    value={svcDeposit}
                    onChange={(e) =>
                      setSvcDeposit(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Paso 4 */}
          {currentStep.key === 'faqs' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">
                Lo que más te preguntan tus pacientes
              </h2>
              <p className="text-xs text-slate-500 -mt-2">
                Elige las que apliquen. Se guardan como están y las puedes editar después con tus
                datos reales. Si no eliges ninguna, el asistente improvisará estas respuestas.
              </p>

              <div className="space-y-2">
                {FAQ_SUGERIDAS.map((faq, i) => {
                  const elegida = faqsElegidas.includes(i);
                  return (
                    <button
                      key={faq.question}
                      type="button"
                      onClick={() =>
                        setFaqsElegidas((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                        )
                      }
                      className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                        elegida
                          ? 'bg-teal-50 border-teal-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                            elegida ? 'bg-teal-600 border-teal-600' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {elegida ? (
                            <Check className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Plus className="w-3 h-3 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{faq.question}</p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {faqsElegidas.length === 0 && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                  <Trash2 className="w-3 h-3" /> No elegiste ninguna; puedes agregarlas después
                  desde Doctores y Servicios.
                </p>
              )}
            </div>
          )}

          {/* Paso 5 */}
          {currentStep.key === 'listo' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Tu asistente ya puede atender</h2>
              <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                Con esto ya puede ofrecer horarios reales, cotizar tratamientos y contestar dudas
                por WhatsApp y teléfono.
              </p>

              <div className="grid grid-cols-3 gap-3 mt-6 max-w-md mx-auto">
                {[
                  { label: 'Especialistas', value: progress.doctors },
                  { label: 'Tratamientos', value: progress.services },
                  { label: 'Respuestas', value: progress.faqs },
                ].map((item) => (
                  <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                      {item.value}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navegación */}
          <div className="flex items-center justify-between gap-3 mt-7 pt-5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0 || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Atrás
            </button>

            {currentStep.key === 'listo' ? (
              <button
                type="button"
                onClick={terminar}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-xs transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Entrar al panel
              </button>
            ) : (
              <button
                type="button"
                onClick={avanzar}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-xs transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Continuar
                {!saving && <ArrowRight className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
