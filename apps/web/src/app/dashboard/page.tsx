'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  MessageSquare,
  CalendarCheck,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { API_BASE_URL, apiFetch } from '../../lib/api';
import { formatMexicanPhone } from '../../lib/format';
import { usePolling } from '../../hooks/usePolling';

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  PENDING: 'Pendiente',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
  URGENT: 'Urgencia',
};

export default function DashboardOverviewPage() {
  const { mode, activeTenant, activeTenantId, seedTenantData } = useTenant();

  const [liveAppointments, setLiveAppointments] = useState<any[]>([]);
  const [liveConversations, setLiveConversations] = useState<any[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Cargar datos en vivo cuando mode === 'live'
  const fetchLiveData = useCallback(async (signal?: AbortSignal) => {
    if (mode === 'demo') return;
    // Sin clínica seleccionada no se consulta: evita traer datos de todas las clínicas.
    if (!activeTenantId) {
      setLiveAppointments([]);
      setLiveConversations([]);
      setLiveError(null);
      return;
    }
    setLoadingLive(true);
    try {
      const [resAppt, resConv] = await Promise.all([
        apiFetch(`${API_BASE_URL}/api/appointments?tenantId=${activeTenantId}`, { signal }),
        apiFetch(`${API_BASE_URL}/api/conversations?tenantId=${activeTenantId}`, { signal }),
      ]);
      if (!resAppt.ok || !resConv.ok) {
        throw new Error(`La API respondió ${resAppt.status}/${resConv.status}`);
      }
      setLiveAppointments(await resAppt.json());
      setLiveConversations(await resConv.json());
      setLiveError(null);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      const message = e instanceof Error ? e.message : 'Error desconocido';
      setLiveError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setLoadingLive(false);
    }
  }, [mode, activeTenantId]);

  // Sondeo resiliente: pausa con la pestaña oculta y aplica backoff si la API falla.
  const poll = useCallback((signal: AbortSignal) => fetchLiveData(signal), [fetchLiveData]);
  const { refresh: refreshLiveData } = usePolling(poll, {
    intervalMs: 4000,
    enabled: mode === 'live' && Boolean(activeTenantId),
  });

  // Manejar seed rápido
  const handleQuickSeed = async () => {
    if (!activeTenantId) return;
    setIsSeeding(true);
    await seedTenantData(activeTenantId);
    setIsSeeding(false);
    refreshLiveData();
  };

  // Métricas Demo (Showcase para Clientes)
  const demoMetrics = [
    {
      title: 'Citas Agendadas Hoy',
      value: '8 citas',
      change: '+3 vs ayer',
      subtext: '6 por WhatsApp, 2 por Voz',
      icon: CalendarCheck,
      color: 'text-teal-600 bg-teal-50 border-teal-200',
    },
    {
      title: 'Llamadas de Voz (+52)',
      value: '14 atendidas',
      change: '100% contestadas',
      subtext: '0 llamadas perdidas en espera',
      icon: PhoneCall,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    {
      title: 'Escudo Anti-Inasistencias',
      value: '96.2%',
      change: '+14% de asistencia',
      subtext: 'Recordatorios activos 24h y 2h',
      icon: ShieldCheck,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      title: 'Anticipos Recaudados (MXN)',
      value: '$3,800 MXN',
      change: 'Hoy en Mercado Pago',
      subtext: '4 apartados confirmados',
      icon: CreditCard,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
  ];

  // Métricas en Vivo calculadas desde la base de datos
  const totalLiveAppointments = liveAppointments.length;
  const confirmedLiveCount = liveAppointments.filter((a) => a.status === 'CONFIRMED').length;
  const totalDepositsMxn = liveAppointments.reduce(
    (acc, a) => acc + (a.depositAmountMxn || 0),
    0
  );

  const liveMetrics = [
    {
      title: 'Citas Activas Registradas',
      value: `${totalLiveAppointments} citas`,
      change: `${confirmedLiveCount} confirmadas`,
      subtext: `Base de datos viva: ${activeTenant?.name || 'Clínica'}`,
      icon: CalendarCheck,
      color: 'text-teal-600 bg-teal-50 border-teal-200',
    },
    {
      title: 'Conversaciones WhatsApp',
      value: `${liveConversations.length} activas`,
      change: '100% en tiempo real',
      subtext: 'Meta Cloud API oficial (+52)',
      icon: MessageSquare,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    {
      title: 'Tasa de Asistencia Confirmada',
      // Sin citas no hay tasa: mostrar '100%' aquí era un dato inventado.
      value:
        totalLiveAppointments > 0
          ? `${Math.round((confirmedLiveCount / totalLiveAppointments) * 100)}%`
          : '—',
      change: 'Confirmación instantánea',
      subtext:
        totalLiveAppointments > 0
          ? 'Recordatorios interactivos'
          : 'Sin citas registradas todavía',
      icon: ShieldCheck,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      title: 'Anticipos en Proceso (MXN)',
      value: `$${totalDepositsMxn.toLocaleString()} MXN`,
      change: 'Mercado Pago integrado',
      subtext: 'Garantía contra inasistencia',
      icon: CreditCard,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
  ];

  // Citas demo estáticas
  const demoAppointments = [
    {
      id: 'APT-101',
      patient: 'Mariana Hernández',
      phone: '+52 (55) 1234-9988',
      doctor: 'Dra. Sofía Silva',
      service: 'Limpieza Dental con Ultrasonido',
      time: 'Hoy, 4:00 PM',
      channel: 'WHATSAPP',
      status: 'CONFIRMED',
      deposit: '$200 MXN Pagado',
    },
    {
      id: 'APT-102',
      patient: 'Roberto Domínguez',
      phone: '+52 (55) 9988-7711',
      doctor: 'Dr. Alejandro Morales',
      service: 'Extracción Muela del Juicio',
      time: 'Hoy, 5:30 PM',
      channel: 'PHONE_CALL',
      status: 'CONFIRMED',
      deposit: '$300 MXN Pagado',
    },
    {
      id: 'APT-103',
      patient: 'Laura Patricia Vega',
      phone: '+52 (55) 4433-2211',
      doctor: 'Dra. Sofía Silva',
      service: 'Blanqueamiento Dental LED',
      time: 'Mañana, 11:00 AM',
      channel: 'WHATSAPP',
      status: 'CONFIRMED',
      deposit: '$500 MXN Pagado',
    },
    {
      id: 'APT-104',
      patient: 'Fernando Rivas (Urgencia)',
      phone: '+52 (55) 7766-5544',
      doctor: 'Dr. Alejandro Morales',
      service: 'Tratamiento de Conductos (Endodoncia)',
      time: 'Mañana, 1:00 PM',
      channel: 'PHONE_CALL',
      status: 'URGENT',
      deposit: 'En Recepción',
    },
  ];

  // Feed Demo
  const demoLiveFeed = [
    {
      time: 'Hace 4 min',
      event: 'Cita agendada por Voz',
      desc: 'Roberto Domínguez agendó extracción para hoy tras llamada de 1m 45s.',
      tag: 'Llamada Telefónica +52',
    },
    {
      time: 'Hace 18 min',
      event: 'Confirmación de WhatsApp',
      desc: 'Mariana Hernández confirmó asistencia por WhatsApp para su limpieza.',
      tag: 'WhatsApp Cloud API',
    },
    {
      time: 'Hace 35 min',
      event: '🚨 Urgencia detectada por IA',
      desc: 'Fernando Rivas reportó dolor agudo nivel 8. IA asignó espacio con Dr. Morales.',
      tag: 'Triaje Médico',
    },
    {
      time: 'Hace 1 hora',
      event: 'Recordatorio enviado',
      desc: 'WhatsApp interactivo enviado a pacientes para sus citas de mañana.',
      tag: 'No-Show Shield',
    },
  ];

  // Feed en vivo de WhatsApp desde la base de datos
  const liveFeedItems = liveConversations.slice(0, 4).map((c) => {
    const lastMsg = c.messages?.[0];
    return {
      time: 'Reciente',
      event: `Mensaje de ${c.patient?.fullName || 'Paciente'}`,
      desc: lastMsg?.content ? `"${lastMsg.content.slice(0, 80)}..."` : 'Conversación iniciada vía WhatsApp',
      tag: c.channel === 'WHATSAPP' ? 'WhatsApp (+52)' : 'Voz',
    };
  });

  const activeMetrics = mode === 'demo' ? demoMetrics : liveMetrics;

  return (
    <div className="p-8 space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Panel de Recepción Inteligente
            </h1>
            {mode === 'demo' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Modo Demo Showcase
              </span>
            ) : (
              <span
                aria-live="polite"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {loadingLive ? 'Sincronizando…' : 'Base de Datos Viva'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {activeTenant?.name || 'Sonrisas Polanco'} • Monitoreo de llamadas y mensajería en tiempo real
          </p>
        </div>

        <div className="flex items-center gap-3">
          {mode === 'live' && (
            <button
              onClick={handleQuickSeed}
              disabled={isSeeding}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-teal-700 text-xs font-semibold rounded-lg transition-colors shadow-xs"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              {isSeeding ? 'Generando...' : '+ Citas Demo'}
            </button>
          )}

          <Link
            href="/dashboard/inbox"
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <MessageSquare className="w-4 h-4" />
            Bandeja en Vivo
          </Link>
        </div>
      </div>

      {/* Aviso de error de sincronización (no se inventan datos si la API falla) */}
      {mode === 'live' && liveError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                No se pudo sincronizar con la API
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                {liveError}. Se reintentará automáticamente con backoff.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshLiveData}
            className="self-start sm:self-auto px-3.5 py-2 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Reintentar ahora
          </button>
        </div>
      )}

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {activeMetrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div
              key={i}
              className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {m.title}
                </span>
                <div className={`p-2 rounded-lg border ${m.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-900">{m.value}</span>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 font-medium">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{m.change}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{m.subtext}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contenido en Dos Columnas: Citas Próximas y Feed en Vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tabla de Citas Próximas */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {mode === 'demo' ? 'Agenda de Pacientes de Hoy (Demo)' : 'Citas en Vivo de la Clínica'}
              </h2>
              <p className="text-xs text-slate-500">Citas confirmadas y supervisadas por la IA</p>
            </div>
            <Link
              href="/dashboard/calendar"
              className="text-xs font-medium text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              Ver calendario completo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Paciente</th>
                  <th className="px-5 py-3">Tratamiento & Doctor</th>
                  <th className="px-5 py-3">Horario</th>
                  <th className="px-5 py-3">Canal</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {mode === 'demo' ? (
                  demoAppointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        <div>{appt.patient}</div>
                        <div className="text-xs text-slate-400 font-normal">{appt.phone}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">{appt.service}</div>
                        <div className="text-xs text-slate-500">{appt.doctor}</div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {appt.time}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          <MessageSquare className="w-3 h-3" /> {appt.channel}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-md">
                          <CheckCircle2 className="w-3 h-3" /> {appt.deposit}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : liveAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500 text-xs">
                      {activeTenantId
                        ? 'No hay citas registradas en esta clínica todavía.'
                        : 'Selecciona o crea una clínica en la barra superior para ver su agenda.'}
                      {activeTenantId && (
                        <div className="mt-2">
                          <button
                            onClick={handleQuickSeed}
                            disabled={isSeeding}
                            className="px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-60 transition-colors"
                          >
                            ⚡ Generar 4 Citas de Prueba
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  liveAppointments.slice(0, 5).map((appt) => {
                    const timeFormatted = new Date(appt.startTime).toLocaleTimeString('es-MX', {
                      timeZone: 'America/Mexico_City',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    });

                    return (
                      <tr key={appt.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-slate-900">
                          <div>{appt.patient?.fullName}</div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            {formatMexicanPhone(appt.patient?.phoneE164)}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-800">{appt.service?.name}</div>
                          <div className="text-xs text-teal-700 font-semibold">{appt.doctor?.name}</div>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {timeFormatted}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                            <MessageSquare className="w-3 h-3" /> {appt.channelOrigin}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {STATUS_LABELS[appt.status] || appt.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Feed de Actividad en Vivo */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {mode === 'demo' ? 'Actividad de la IA (Demo)' : 'Actividad en Tiempo Real'}
              </h2>
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"
              ></span>
            </div>

            <div className="space-y-4 mt-4">
              {(mode === 'demo' ? demoLiveFeed : liveFeedItems).map((item, idx) => (
                <div key={idx} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-xs">{item.event}</span>
                      <span className="text-[10px] text-slate-400">• {item.time}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                    <span className="inline-block text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {item.tag}
                    </span>
                  </div>
                </div>
              ))}

              {/* En modo Live nunca se muestra el feed demo como si fuera actividad real. */}
              {mode === 'live' && liveFeedItems.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
                  <Sparkles className="w-5 h-5 text-slate-400 mx-auto" />
                  <p className="mt-2 text-xs font-semibold text-slate-700">
                    Aún no hay actividad registrada
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                    Cuando un paciente escriba por WhatsApp o llame, la conversación aparecerá
                    aquí en tiempo real.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              href="/dashboard/inbox"
              className="text-xs font-medium text-teal-600 hover:text-teal-700 flex items-center justify-center gap-1"
            >
              Supervisar conversaciones en vivo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
