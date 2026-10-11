'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CreditCard, Headset, RefreshCw, Sparkles, Sun } from 'lucide-react';
import { API_BASE_URL, apiFetch, getUser } from '@/lib/api';
import { formatMexicoCityTime, formatMxn } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "Tu día en una tarjeta": lo primero que recepción revisa cada mañana, sin
 * recorrer la agenda y la bandeja. Cada frase sale de `GET /api/summary/today`
 * (datos, no IA): si una cifra está, es porque la consulta la encontró.
 */

interface SummaryResponse {
  clinicName: string | null;
  today: {
    total: number;
    completed: number;
    remaining: number;
    firstVisits: { patientName: string; startTime: string }[];
    next: { startTime: string; patientName: string; serviceName: string; doctorName: string } | null;
  };
  tomorrow: { total: number };
  deposits: { pendingCount: number; pendingAmountMxn: number };
  inbox: { waitingForStaff: number; failedLast24h: number };
  week: { bookedByAssistant: number };
}

const DEMO_SUMMARY: SummaryResponse = {
  clinicName: 'Clínica Dental Sonrisas Polanco',
  today: {
    total: 8,
    completed: 3,
    remaining: 5,
    firstVisits: [{ patientName: 'Laura Patricia Vega', startTime: new Date().toISOString() }],
    next: { startTime: new Date().toISOString(), patientName: 'Mariana Hernández', serviceName: 'Limpieza con ultrasonido', doctorName: 'Dra. Sofía Silva' },
  },
  tomorrow: { total: 6 },
  deposits: { pendingCount: 2, pendingAmountMxn: 700 },
  inbox: { waitingForStaff: 1, failedLast24h: 0 },
  week: { bookedByAssistant: 23 },
};

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(new Date())
  );
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function Item({
  icon,
  tone,
  children,
  href,
}: {
  icon: React.ReactNode;
  tone: 'neutral' | 'attention' | 'alert';
  children: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm h-full',
        tone === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-700',
        tone === 'attention' && 'border-amber-200 bg-amber-50 text-amber-900',
        tone === 'alert' && 'border-red-200 bg-red-50 text-red-800',
        href && 'hover:shadow-sm transition-shadow'
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function TodaySummary({ isDemo, tenantId, refreshKey }: { isDemo: boolean; tenantId: string | null; refreshKey?: number }) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [name, setName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setState((previous) => (previous === 'ready' ? previous : 'loading'));
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/summary/today?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) throw new Error(String(res.status));
      setSummary((await res.json()) as SummaryResponse);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [tenantId]);

  useEffect(() => {
    // Nombre completo: la primera palabra suele ser un título ("Dra.", "Dr.").
    queueMicrotask(() => setName(getUser()?.name?.trim().replace(/\.+$/, '') || null));
  }, []);

  useEffect(() => {
    if (isDemo) return;
    queueMicrotask(() => void load());
    // Se refresca cada minuto: es un resumen, no una vista en tiempo real.
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [isDemo, load, refreshKey]);

  const data = isDemo ? DEMO_SUMMARY : summary;

  if (!isDemo && state === 'loading' && !summary) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-3 text-sm text-slate-500">
        <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
        Preparando el resumen de tu día…
      </div>
    );
  }
  if (!isDemo && state === 'error' && !summary) {
    return (
      <div role="alert" className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex items-center justify-between gap-3 text-sm text-amber-900">
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> No se pudo preparar el resumen del día.
        </span>
        <button type="button" onClick={() => void load()} className="font-semibold underline">
          Reintentar
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { today, tomorrow, deposits, inbox, week } = data;
  const headline =
    today.total === 0
      ? 'Hoy no hay citas en la agenda.'
      : `Hoy tienes ${plural(today.total, 'cita', 'citas')}${
          today.remaining < today.total ? `; quedan ${today.remaining}` : ''
        }.`;

  return (
    <section
      aria-label="Resumen del día"
      className={cn(
        'rounded-2xl border p-5 sm:p-6 space-y-4',
        isDemo ? 'bg-purple-50/50 border-purple-200' : 'bg-white border-slate-200'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5" /> Tu día
            {isDemo && <span className="text-purple-700 normal-case tracking-normal font-medium">· ejemplo de demostración</span>}
          </p>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            {greeting()}
            {!isDemo && name ? `, ${name}` : ''}. {headline}
          </h2>
        </div>
        {!isDemo && (
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Actualizar resumen"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Item icon={<CalendarClock className="w-4 h-4 text-teal-600" />} tone="neutral" href="/dashboard/calendar">
          {today.next ? (
            <>
              Próxima: <strong>{formatMexicoCityTime(today.next.startTime)}</strong> con {today.next.patientName} (
              {today.next.serviceName}).
            </>
          ) : (
            'No quedan citas por atender hoy.'
          )}{' '}
          Mañana: {plural(tomorrow.total, 'cita', 'citas')}.
        </Item>

        <Item icon={<Sparkles className="w-4 h-4 text-teal-600" />} tone="neutral" href="/dashboard/patients">
          {today.firstVisits.length === 0 ? (
            'Hoy no hay primeras visitas.'
          ) : (
            <>
              {plural(today.firstVisits.length, 'primera visita', 'primeras visitas')}:{' '}
              {today.firstVisits
                .slice(0, 2)
                .map((visit) => visit.patientName)
                .join(', ')}
              {today.firstVisits.length > 2 ? '…' : '.'}
            </>
          )}
        </Item>

        <Item
          icon={<CreditCard className="w-4 h-4 text-amber-600" />}
          tone={deposits.pendingCount > 0 ? 'attention' : 'neutral'}
          href="/dashboard/calendar"
        >
          {deposits.pendingCount === 0
            ? 'Sin anticipos pendientes.'
            : `${plural(deposits.pendingCount, 'anticipo pendiente', 'anticipos pendientes')} (${formatMxn(deposits.pendingAmountMxn)}).`}
        </Item>

        <Item
          icon={<Headset className={cn('w-4 h-4', inbox.waitingForStaff > 0 ? 'text-red-600' : 'text-teal-600')} />}
          tone={inbox.waitingForStaff > 0 || inbox.failedLast24h > 0 ? 'alert' : 'neutral'}
          href="/dashboard/inbox"
        >
          {inbox.waitingForStaff > 0
            ? `${plural(inbox.waitingForStaff, 'chat espera', 'chats esperan')} a recepción.`
            : 'Ningún chat espera a recepción.'}
          {inbox.failedLast24h > 0 && ` ${plural(inbox.failedLast24h, 'mensaje no se entregó', 'mensajes no se entregaron')}.`}
        </Item>
      </div>

      {week.bookedByAssistant > 0 && (
        <p className="text-xs text-slate-500">
          En los últimos 7 días el asistente agendó {plural(week.bookedByAssistant, 'cita', 'citas')} por WhatsApp,
          teléfono o el portal.
        </p>
      )}
    </section>
  );
}
