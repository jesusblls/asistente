'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CreditCard,
  ShieldCheck,
  Crown,
  Stethoscope,
  Building2,
  ExternalLink,
  Clock,
  RefreshCw,
  Receipt,
} from 'lucide-react';
import { API_BASE_URL, apiFetch } from '@/lib/api';
import { useTenant } from '@/context/TenantContext';

/**
 * Contratación y gestión de la suscripción de la clínica.
 *
 * El cobro ocurre en la página alojada por Mercado Pago: de aquí solo sale el
 * plan elegido y de vuelta llega un link. Ningún dato de tarjeta pasa por el
 * panel, ni se guarda de este lado.
 */

type Ciclo = 'MONTHLY' | 'ANNUAL';

interface PlanCatalogo {
  slug: string;
  name: string;
  priceMonthlyMxn: number;
  priceAnnualMxn: number;
  importeMensual: number;
  importeAnual: number;
  limits: {
    maxDoctors: number | null;
    maxAppointmentsPerMonth: number | null;
    includedVoiceMinutes: number;
    voiceEnabled: boolean;
  };
}

interface Suscripcion {
  planSlug: string;
  planName: string;
  status: string;
  trialDaysLeft: number | null;
  gracePeriodEndsAt: string | null;
  graceDaysLeft: number | null;
  pastDueSince: string | null;
  lastPaymentError: string | null;
  isSuspended: boolean;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  tieneSuscripcion: boolean;
  usage: { doctors: number; appointments: number; voiceMinutes: number };
  catalogo: PlanCatalogo[];
}

interface SubscriptionChargeItem {
  id: string;
  amountMxn: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  statusDetail: string | null;
  failureReason: string | null;
  paymentMethod: string | null;
  lastFourDigits: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

const ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
  consultorio: Stethoscope,
  'clinica-pro': Crown,
  cadenas: Building2,
};

const pesos = (monto: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(monto);

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso));

/** Cupos del plan en frases, no en campos. */
function describirCupos(limits: PlanCatalogo['limits']): string[] {
  return [
    limits.maxDoctors === null
      ? 'Especialistas ilimitados'
      : `${limits.maxDoctors} ${limits.maxDoctors === 1 ? 'especialista' : 'especialistas'}`,
    limits.maxAppointmentsPerMonth === null
      ? 'Citas ilimitadas al mes'
      : `${limits.maxAppointmentsPerMonth} citas al mes`,
    limits.voiceEnabled
      ? `${limits.includedVoiceMinutes} minutos de voz con IA`
      : 'Sin telefonía con IA',
    'WhatsApp Cloud API oficial 24/7',
  ];
}

export default function SuscripcionPage() {
  const { mode } = useTenant();
  const searchParams = useSearchParams();
  const vieneDeAutorizar = searchParams.get('estado') === 'autorizada';

  const [datos, setDatos] = useState<Suscripcion | null>(null);
  const [ciclo, setCiclo] = useState<Ciclo>('MONTHLY');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contratando, setContratando] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargos, setCargos] = useState<SubscriptionChargeItem[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/subscription`);
      if (!res.ok) throw new Error('No se pudo cargar tu suscripción');
      const data: Suscripcion = await res.json();
      setDatos(data);
      if (data.billingCycle === 'ANNUAL') setCiclo('ANNUAL');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/subscription/history`);
      if (!res.ok) return;
      const data = await res.json();
      setCargos(data.cargos || []);
    } catch {
      // Fallo secundario de red no bloquea la interfaz
    } finally {
      setCargandoHistorial(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarHistorial();
  }, [cargar, cargarHistorial]);

  const reintentar = async () => {
    setReintentando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/subscription/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo reintentar el cobro');

      if (data.simulado) {
        setAviso('Modo desarrollo: reintento de cobro simulado correctamente.');
      } else {
        setAviso(data.mensaje || 'Reintento procesado con Mercado Pago.');
      }
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reintentar el cobro');
    } finally {
      setReintentando(false);
    }
  };

  const contratar = async (planSlug: string) => {
    setContratando(planSlug);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/subscription/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug, billingCycle: ciclo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la contratación');

      if (data.simulado) {
        // En desarrollo no hay credencial: se dice con todas sus letras en vez
        // de mandar a una página que no va a cobrar nada.
        setAviso(
          'Modo desarrollo: no hay credencial de Mercado Pago configurada, así que el link es simulado y no cobra.'
        );
        return;
      }

      // La captura de la tarjeta ocurre en Mercado Pago, nunca aquí.
      window.location.href = data.initPoint;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la contratación');
    } finally {
      setContratando(null);
    }
  };

  const cancelar = async () => {
    setCancelando(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/subscription/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cancelar');

      setAviso(
        data.accesoHasta
          ? `Renovación cancelada. Tu servicio sigue activo hasta el ${fechaLarga(data.accesoHasta)}.`
          : 'Renovación cancelada.'
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar');
    } finally {
      setCancelando(false);
    }
  };

  if (mode === 'demo') {
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Suscripción</h1>
        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-2xl text-sm text-purple-900">
          La contratación solo está disponible en Modo En Vivo. El Modo Demo muestra una clínica
          de ejemplo y no tiene una cuenta que cobrar.
        </div>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="p-6 lg:p-8 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando tu suscripción…
      </div>
    );
  }

  const enPrueba = datos?.status === 'TRIALING';
  const activa = datos?.status === 'ACTIVE';

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
          Suscripción
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tarifas en pesos mexicanos. Sin contratos forzosos: cancelas cuando quieras y conservas
          el servicio hasta el fin del periodo que ya pagaste.
        </p>
      </header>

      {vieneDeAutorizar && (
        <div className="mb-5 p-3.5 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 flex items-start gap-2">
          <Clock className="w-4 h-4 shrink-0 mt-0.5 text-teal-600" />
          <span>
            Autorizaste la suscripción en Mercado Pago. La activación aparece aquí en cuanto se
            confirme el primer cobro — suele tardar unos minutos.
          </span>
        </div>
      )}

      {aviso && (
        <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{aviso}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Aviso prioritario de morosidad y período de gracia */}
      {datos?.status === 'PAST_DUE' && (
        <div
          role="alert"
          className={`mb-6 p-5 rounded-2xl border ${
            datos.isSuspended
              ? 'bg-red-50/90 border-red-200 text-red-950'
              : 'bg-amber-50/90 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  datos.isSuspended ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight">
                  {datos.isSuspended
                    ? 'Servicio suspendido por falta de pago'
                    : `Cobro de suscripción no procesado — Período de gracia activo (${
                        datos.graceDaysLeft === 1 ? '1 día restante' : `${datos.graceDaysLeft ?? 3} días restantes`
                      })`}
                </h2>
                <p className="text-xs mt-1 text-slate-700 leading-relaxed">
                  {datos.lastPaymentError ? (
                    <span className="block mb-1">
                      Motivo del banco:{' '}
                      <strong className="font-semibold text-slate-900">{datos.lastPaymentError}</strong>.
                    </span>
                  ) : null}
                  {datos.isSuspended
                    ? 'El período de gracia de 3 días naturales ha vencido y los servicios de atención automatizada (IA, WhatsApp y telefonía) se encuentran pausados. Tus expedientes, citas pasadas y configuración están 100% resguardados. Regulariza tu pago para restaurar la atención inmediatamente.'
                    : `Para proteger la atención de tus pacientes, tu asistente de IA y telefonía siguen operando con normalidad. Cuentas con un período de gracia hasta el ${
                        datos.gracePeriodEndsAt ? fechaLarga(datos.gracePeriodEndsAt) : 'fin del plazo'
                      } para regularizar el cobro antes de que el servicio sea suspendido temporalmente.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0 sm:self-center">
              <button
                type="button"
                onClick={reintentar}
                disabled={reintentando || contratando !== null}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 shadow-xs transition-colors disabled:opacity-50"
              >
                {reintentando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-teal-600" />
                )}
                {reintentando ? 'Reintentando cobro…' : 'Reintentar cobro ahora'}
              </button>

              <button
                type="button"
                onClick={() => contratar(datos.planSlug)}
                disabled={contratando !== null || reintentando}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 ${
                  datos.isSuspended
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {contratando === datos.planSlug ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CreditCard className="w-3.5 h-3.5" />
                )}
                Cambiar tarjeta bancaria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estado actual */}
      {datos && (
        <section className="mb-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Plan actual
              </p>
              <p className="text-xl font-extrabold text-slate-900 mt-0.5">{datos.planName}</p>

              <p className="text-xs text-slate-600 mt-1.5">
                {datos.isSuspended ? (
                  <span className="text-red-700 font-semibold">
                    Suspendida: activa un plan para volver a operar.
                  </span>
                ) : enPrueba && datos.trialDaysLeft !== null ? (
                  <>
                    Prueba gratuita ·{' '}
                    <span className="font-semibold">
                      {datos.trialDaysLeft === 1
                        ? 'te queda 1 día'
                        : `te quedan ${datos.trialDaysLeft} días`}
                    </span>
                  </>
                ) : activa && datos.currentPeriodEnd ? (
                  <>
                    Activa · se renueva el{' '}
                    <span className="font-semibold">{fechaLarga(datos.currentPeriodEnd)}</span>
                  </>
                ) : datos.status === 'CANCELED' && datos.currentPeriodEnd ? (
                  <>
                    Renovación cancelada · servicio hasta el{' '}
                    <span className="font-semibold">{fechaLarga(datos.currentPeriodEnd)}</span>
                  </>
                ) : datos.status === 'PAST_DUE' ? (
                  datos.isSuspended ? (
                    <span className="text-red-700 font-semibold">
                      Suspendida por morosidad · Reactiva tu tarjeta o reintenta el cobro.
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold">
                      Morosidad · Período de gracia ({datos.graceDaysLeft ?? 3}{' '}
                      {datos.graceDaysLeft === 1 ? 'día restante' : 'días restantes'} hasta el{' '}
                      {datos.gracePeriodEndsAt ? fechaLarga(datos.gracePeriodEndsAt) : 'fin del plazo'})
                    </span>
                  )
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
              <div>
                <p className="font-bold text-slate-900 tabular-nums text-base">
                  {datos.usage.doctors}
                </p>
                <p className="text-[11px]">Especialistas</p>
              </div>
              <div>
                <p className="font-bold text-slate-900 tabular-nums text-base">
                  {datos.usage.appointments}
                </p>
                <p className="text-[11px]">Citas este mes</p>
              </div>
              <div>
                <p className="font-bold text-slate-900 tabular-nums text-base">
                  {datos.usage.voiceMinutes}
                </p>
                <p className="text-[11px]">Minutos de voz</p>
              </div>
            </div>
          </div>

          {datos.tieneSuscripcion && datos.status !== 'CANCELED' && (
            <button
              onClick={cancelar}
              disabled={cancelando}
              className="mt-4 text-xs font-semibold text-slate-500 hover:text-red-700 underline disabled:opacity-50"
            >
              {cancelando ? 'Cancelando…' : 'Cancelar renovación automática'}
            </button>
          )}
        </section>
      )}

      {/* Selector de ciclo */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center p-1.5 rounded-xl bg-slate-100 border border-slate-200">
          {(['MONTHLY', 'ANNUAL'] as Ciclo[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCiclo(c)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 ${
                ciclo === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {c === 'MONTHLY' ? 'Pago mensual' : 'Pago anual'}
              {c === 'ANNUAL' && (
                <span className="bg-amber-300 text-amber-950 text-[10px] font-black px-1.5 py-0.5 rounded">
                  AHORRAS 20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Planes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {datos?.catalogo.map((plan) => {
          const Icono = ICONOS[plan.slug] || Stethoscope;
          const esActual = datos.planSlug === plan.slug && !enPrueba;
          const destacado = plan.slug === 'clinica-pro';
          const precioMensual = ciclo === 'ANNUAL' ? plan.priceAnnualMxn : plan.priceMonthlyMxn;
          const cargo = ciclo === 'ANNUAL' ? plan.importeAnual : plan.importeMensual;

          return (
            <div
              key={plan.slug}
              className={`rounded-2xl p-6 flex flex-col border transition-colors ${
                destacado
                  ? 'bg-slate-900 text-white border-teal-500'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    destacado ? 'bg-teal-500/20 text-teal-300' : 'bg-teal-50 text-teal-700'
                  }`}
                >
                  <Icono className="w-5 h-5" />
                </div>
                {esActual && (
                  <span className="text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
                    Tu plan
                  </span>
                )}
              </div>

              <h2 className="text-base font-bold tracking-tight">{plan.name}</h2>

              <div className="mt-3">
                <span className="text-3xl font-extrabold tabular-nums">{pesos(precioMensual)}</span>
                <span className={`text-xs ml-1 ${destacado ? 'text-slate-400' : 'text-slate-500'}`}>
                  MXN / mes
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${destacado ? 'text-slate-400' : 'text-slate-500'}`}>
                {ciclo === 'ANNUAL'
                  ? `Se cobra ${pesos(cargo)} una vez al año`
                  : 'Se cobra cada mes'}
              </p>

              <ul className="mt-4 space-y-2 flex-1">
                {describirCupos(plan.limits).map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs">
                    <Check
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        destacado ? 'text-teal-400' : 'text-teal-600'
                      }`}
                    />
                    <span className={destacado ? 'text-slate-200' : 'text-slate-600'}>{item}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => contratar(plan.slug)}
                disabled={contratando !== null || esActual}
                className={`mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 ${
                  destacado
                    ? 'bg-teal-500 hover:bg-teal-400 text-slate-900'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                {contratando === plan.slug ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {esActual ? 'Plan contratado' : 'Contratar'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Historial de facturación y cobros */}
      <section className="mt-10 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Historial de facturación y cobros
              </h2>
              <p className="text-[11px] text-slate-500">
                Registro de recibos periódicos procesados a través de Mercado Pago.
              </p>
            </div>
          </div>
          {cargandoHistorial && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>

        {cargos.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            Aún no se registran cobros periódicos en esta cuenta.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 font-semibold">Fecha</th>
                  <th className="pb-3 font-semibold">Período</th>
                  <th className="pb-3 font-semibold">Método</th>
                  <th className="pb-3 font-semibold">Monto</th>
                  <th className="pb-3 font-semibold text-right">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargos.map((c) => {
                  const esAprobado = c.status === 'APPROVED';
                  const esRechazado = c.status === 'REJECTED';
                  const esPendiente = c.status === 'PENDING';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 font-medium text-slate-900 whitespace-nowrap">
                        {fechaLarga(c.createdAt)}
                      </td>
                      <td className="py-3 text-slate-600 whitespace-nowrap">
                        {c.periodStart && c.periodEnd
                          ? `${fechaLarga(c.periodStart)} – ${fechaLarga(c.periodEnd)}`
                          : 'Mensualidad'}
                      </td>
                      <td className="py-3 text-slate-600 whitespace-nowrap">
                        {c.lastFourDigits
                          ? `Tarjeta •••• ${c.lastFourDigits}`
                          : c.paymentMethod || 'Mercado Pago'}
                      </td>
                      <td className="py-3 font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {pesos(c.amountMxn)}{' '}
                        <span className="text-[10px] font-normal text-slate-400">MXN</span>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        {esAprobado ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3" /> Pagado
                          </span>
                        ) : esRechazado ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                              <AlertCircle className="w-3 h-3" /> Rechazado
                            </span>
                            {(c.failureReason || c.statusDetail) && (
                              <span
                                className="text-[10px] text-red-600 mt-0.5 max-w-[220px] truncate"
                                title={c.failureReason || c.statusDetail || ''}
                              >
                                {c.failureReason || c.statusDetail}
                              </span>
                            )}
                          </div>
                        ) : esPendiente ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> Procesando
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                            {c.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          El pago se procesa en Mercado Pago; tus datos de tarjeta nunca pasan por este panel.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" />
          Al contratar te enviamos a la página segura de Mercado Pago.
        </span>
      </footer>
    </div>
  );
}
