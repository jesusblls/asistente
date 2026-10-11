'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquare,
  Stethoscope,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import {
  addDaysToDateKey,
  formatDateKeyShort,
  formatMexicanPhone,
  formatMexicoCityDate,
  formatMexicoCityTime,
  formatMxn,
  todayInMexicoCity,
} from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Portal público de citas de una clínica (`/agenda/<slug>`).
 *
 * El paciente elige tratamiento, especialista (o "el primero disponible"),
 * día y hora libre, deja nombre y celular, y recibe la confirmación por
 * WhatsApp, con el link de anticipo si el tratamiento lo pide. No hay cuenta
 * ni contraseña: la identidad es el celular, al que llega la confirmación.
 */

interface PublicService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMxn: number;
  requiredDepositMxn: number;
  category: string | null;
}

interface PublicClinic {
  clinic: { name: string; slug: string; address: string | null; phoneE164: string; timezone: string };
  services: PublicService[];
  doctors: { id: string; name: string; specialty: string }[];
  maxDaysAhead: number;
}

interface Slot {
  doctorId: string;
  doctorName: string;
  startTime: string;
  displayTime: string;
}

interface Booked {
  id: string;
  startTime: string;
  doctorName: string;
  serviceName: string;
  depositRequired: boolean;
  depositAmountMxn: number | null;
}

const DAYS_SHOWN = 14;

function weekdayShort(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day, 12))
  );
}

/** "lunes, 12 de octubre": solo la primera letra en mayúscula (`capitalize` las pone en todas). */
function sentenceCase(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
      <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center">{n}</span>
      {children}
    </h2>
  );
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [data, setData] = useState<PublicClinic | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  const days = useMemo(() => {
    const today = todayInMexicoCity();
    return Array.from({ length: DAYS_SHOWN }, (_, index) => addDaysToDateKey(today, index));
  }, []);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/public/clinics/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) return setLoadState('notfound');
        if (!res.ok) return setLoadState('error');
        setData((await res.json()) as PublicClinic);
        setLoadState('ready');
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setLoadState('error');
      });
    return () => controller.abort();
  }, [slug]);

  const loadSlots = useCallback(
    async (nextDate: string, nextService: string, nextDoctor: string, signal?: AbortSignal) => {
      setSlots(null);
      setSlotsError(null);
      setSlot(null);
      const query = new URLSearchParams({ date: nextDate, serviceId: nextService, ...(nextDoctor ? { doctorId: nextDoctor } : {}) });
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/clinics/${encodeURIComponent(slug)}/slots?${query}`, { signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSlotsError(body.error || 'No se pudieron consultar los horarios');
          setSlots([]);
          return;
        }
        setSlots(body.slots as Slot[]);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        setSlotsError('No se pudieron consultar los horarios. Revisa tu conexión.');
        setSlots([]);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (!serviceId || !date) return;
    const controller = new AbortController();
    queueMicrotask(() => void loadSlots(date, serviceId, doctorId, controller.signal));
    return () => controller.abort();
  }, [serviceId, doctorId, date, loadSlots]);

  const service = data?.services.find((candidate) => candidate.id === serviceId) ?? null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slot || !serviceId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/clinics/${encodeURIComponent(slug)}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          doctorId: slot.doctorId,
          startTime: slot.startTime,
          fullName: fullName.trim(),
          phone: phone.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          acceptPrivacy,
          website,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body.error || 'No se pudo agendar la cita');
        // El horario pudo ocuparse mientras llenaba el formulario.
        if (res.status === 409 && date && serviceId) void loadSlots(date, serviceId, doctorId);
        return;
      }
      setBooked(body.appointment as Booked);
    } catch {
      setSubmitError('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadState === 'loading') {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> Cargando agenda…
      </main>
    );
  }
  if (loadState !== 'ready' || !data) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-bold text-slate-900">
            {loadState === 'notfound' ? 'Agenda no disponible' : 'No se pudo cargar la agenda'}
          </h1>
          <p className="text-sm text-slate-500">
            {loadState === 'notfound'
              ? 'Esta clínica no tiene agenda en línea activa. Comunícate con ella directamente para agendar.'
              : 'Inténtalo de nuevo en unos minutos.'}
          </p>
        </div>
      </main>
    );
  }

  const { clinic } = data;

  if (booked) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 space-y-5 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">¡Tu cita quedó agendada!</h1>
            <p className="text-sm text-slate-500 mt-1">{clinic.name}</p>
          </div>
          <div className="text-left text-sm bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-1.5">
            <p><strong>{booked.serviceName}</strong> con {booked.doctorName}</p>
            <p>{sentenceCase(formatMexicoCityDate(booked.startTime))} · {formatMexicoCityTime(booked.startTime)}</p>
            {clinic.address && <p className="text-slate-500">{clinic.address}</p>}
          </div>
          <p className="text-sm text-slate-600 flex items-start gap-2 text-left">
            <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            Te enviamos la confirmación por WhatsApp
            {booked.depositRequired && booked.depositAmountMxn
              ? `, con el link para pagar tu anticipo de ${formatMxn(booked.depositAmountMxn)} y apartar tu horario`
              : ''}
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4" /> Agenda en línea
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">{clinic.name}</h1>
          <div className="mt-2 text-sm text-slate-500 space-y-1">
            {clinic.address && (
              <p className="flex items-start gap-1.5">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" /> {clinic.address}
              </p>
            )}
            <p>{formatMexicanPhone(clinic.phoneE164)}</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <StepTitle n={1}>¿Qué tratamiento necesitas?</StepTitle>
          {data.services.length === 0 ? (
            <p className="text-sm text-slate-500">La clínica aún no publica tratamientos para agendar en línea.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.services.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={serviceId === candidate.id}
                  onClick={() => {
                    setServiceId(candidate.id);
                    setDate((current) => current || days[0]);
                  }}
                  className={cn(
                    'text-left rounded-xl border p-4 transition-colors',
                    serviceId === candidate.id
                      ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-600/20'
                      : 'border-slate-200 hover:border-teal-300'
                  )}
                >
                  <span className="block font-semibold text-slate-900 text-sm">{candidate.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {candidate.durationMinutes} min</span>
                    {candidate.priceMxn > 0 && <span>{formatMxn(candidate.priceMxn)}</span>}
                    {candidate.requiredDepositMxn > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <CreditCard className="w-3.5 h-3.5" /> Anticipo {formatMxn(candidate.requiredDepositMxn)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {service && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <StepTitle n={2}>¿Cuándo te acomoda?</StepTitle>

            {data.doctors.length > 1 && (
              <label className="block text-sm">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
                  <Stethoscope className="w-3.5 h-3.5" /> Especialista
                </span>
                <select
                  value={doctorId}
                  onChange={(event) => setDoctorId(event.target.value)}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">El primero disponible</option>
                  {data.doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name} · {doctor.specialty}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="listbox" aria-label="Día">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  role="option"
                  aria-selected={date === day}
                  onClick={() => setDate(day)}
                  className={cn(
                    'shrink-0 w-16 rounded-xl border py-2 text-center transition-colors',
                    date === day ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'
                  )}
                >
                  <span className="block text-[11px] uppercase">{weekdayShort(day)}</span>
                  <span className="block text-sm font-semibold">{formatDateKeyShort(day)}</span>
                </button>
              ))}
            </div>

            {slots === null ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> Buscando horarios libres…
              </p>
            ) : slotsError ? (
              <p role="alert" className="text-sm text-red-700">{slotsError}</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-slate-500">No hay horarios libres ese día. Prueba con otro.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {slots.map((candidate) => {
                  const selected = slot?.startTime === candidate.startTime && slot.doctorId === candidate.doctorId;
                  return (
                    <button
                      key={`${candidate.doctorId}-${candidate.startTime}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSlot(candidate)}
                      aria-label={`${formatMexicoCityTime(candidate.startTime)} con ${candidate.doctorName}`}
                      className={cn(
                        'rounded-lg border py-2 text-sm font-medium transition-colors',
                        selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 hover:border-teal-400 text-slate-700'
                      )}
                    >
                      {formatMexicoCityTime(candidate.startTime)}
                      {!doctorId && data.doctors.length > 1 && (
                        <span className={cn('block text-[10px] truncate px-1', selected ? 'text-teal-50' : 'text-slate-400')}>
                          {candidate.doctorName}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {service && slot && (
          <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <StepTitle n={3}>Tus datos</StepTitle>
            <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
              <strong>{service.name}</strong> con {slot.doctorName} ·{' '}
              {formatMexicoCityDate(slot.startTime)} a las {formatMexicoCityTime(slot.startTime)}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="block text-xs font-semibold text-slate-600 mb-1">Nombre completo</span>
                <input
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-semibold text-slate-600 mb-1">Celular (WhatsApp)</span>
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="55 1234 5678"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="block text-xs font-semibold text-slate-600 mb-1">
                ¿Algo que debamos saber? <span className="font-normal text-slate-400">(opcional)</span>
              </span>
              <textarea
                rows={2}
                maxLength={300}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            {/* Campo trampa para bots: oculto a personas y a lectores de pantalla. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              className="absolute -left-[9999px] w-px h-px opacity-0"
            />
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                required
                checked={acceptPrivacy}
                onChange={(event) => setAcceptPrivacy(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>
                Acepto que {clinic.name} trate mis datos para agendar y darle seguimiento a mi cita, y que me contacte por
                WhatsApp, conforme al{' '}
                <Link href="/privacidad" target="_blank" className="underline font-semibold text-teal-700">
                  aviso de privacidad
                </Link>
                .
              </span>
            </label>
            {service.requiredDepositMxn > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <CreditCard className="w-4 h-4 shrink-0" />
                Este tratamiento pide un anticipo de {formatMxn(service.requiredDepositMxn)} para apartar tu horario. Te
                llegará el link de pago por WhatsApp.
              </p>
            )}
            {submitError && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {submitError}
              </p>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
              <button
                type="button"
                onClick={() => setSlot(null)}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" /> Cambiar horario
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
                {submitting ? 'Agendando…' : 'Confirmar cita'}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-slate-400 pb-6">
          Agenda en línea con <Link href="/" className="hover:text-teal-700">AsistentePro</Link>
        </p>
      </div>
    </main>
  );
}
