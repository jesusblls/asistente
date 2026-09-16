'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  Contact,
  Loader2,
  MessageCircle,
  Phone,
  PhoneCall,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';
import { API_BASE_URL, apiFetch } from '../../../lib/api';
import { formatMexicanPhone, formatMexicoCityDate, formatMexicoCityTime, formatMxn } from '../../../lib/format';
import { cn } from '../../../lib/utils';

interface PatientListItem {
  id: string;
  fullName: string;
  phoneE164: string;
  isVip: boolean;
  createdAt: string;
  appointmentsCount: number;
  conversationsCount: number;
  callsCount: number;
  lastAppointment: {
    startTime: string;
    status: string;
    doctor: { name: string } | null;
    service: { name: string } | null;
  } | null;
}

interface PatientAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  depositAmountMxn: number | null;
  symptoms: string | null;
  channelOrigin: string;
  doctor: { name: string; specialty: string };
  service: { name: string; priceMxn: number };
}

interface PatientConversation {
  id: string;
  channel: string;
  externalChannelId: string;
  lastMessageAt: string | null;
  createdAt: string;
  isHandedOverToHuman: boolean;
  messages: Array<{ id: string; content: string; createdAt: string; senderRole: string; direction: string }>;
}

interface PatientDetail extends PatientListItem {
  appointments: PatientAppointment[];
  conversations: PatientConversation[];
}

const DEMO_PATIENTS: PatientListItem[] = [
  {
    id: 'demo-1',
    fullName: 'María Fernanda López',
    phoneE164: '+525512345678',
    isVip: true,
    createdAt: '2026-06-02T10:00:00.000Z',
    appointmentsCount: 5,
    conversationsCount: 8,
    callsCount: 2,
    lastAppointment: {
      startTime: '2026-09-18T16:00:00.000Z',
      status: 'CONFIRMED',
      doctor: { name: 'Dra. Sofía Silva' },
      service: { name: 'Limpieza Dental' },
    },
  },
  {
    id: 'demo-2',
    fullName: 'Roberto Jiménez Cruz',
    phoneE164: '+528112223344',
    isVip: false,
    createdAt: '2026-07-14T10:00:00.000Z',
    appointmentsCount: 1,
    conversationsCount: 1,
    callsCount: 1,
    lastAppointment: {
      startTime: '2026-07-14T18:00:00.000Z',
      status: 'COMPLETED',
      doctor: { name: 'Dr. Alejandro Morales' },
      service: { name: 'Extracción de Muela del Juicio' },
    },
  },
];

const DEMO_DETAIL: Record<string, PatientDetail> = {
  'demo-1': {
    ...DEMO_PATIENTS[0],
    appointments: [
      {
        id: 'demo-appt-1',
        startTime: '2026-09-18T16:00:00.000Z',
        endTime: '2026-09-18T16:45:00.000Z',
        status: 'CONFIRMED',
        paymentStatus: 'DEPOSIT_PAID',
        depositAmountMxn: 200,
        symptoms: null,
        channelOrigin: 'WHATSAPP',
        doctor: { name: 'Dra. Sofía Silva', specialty: 'Odontología General' },
        service: { name: 'Limpieza Dental', priceMxn: 850 },
      },
    ],
    conversations: [
      {
        id: 'demo-conv-1',
        channel: 'WHATSAPP',
        externalChannelId: 'demo',
        lastMessageAt: '2026-09-17T12:00:00.000Z',
        createdAt: '2026-09-17T11:50:00.000Z',
        isHandedOverToHuman: false,
        messages: [
          {
            id: 'demo-msg-1',
            content: '¡Con mucho gusto! Su cita quedó confirmada para el jueves a las 4 pm.',
            createdAt: '2026-09-17T12:00:00.000Z',
            senderRole: 'AI_AGENT',
            direction: 'OUTBOUND',
          },
        ],
      },
    ],
  },
  'demo-2': {
    ...DEMO_PATIENTS[1],
    appointments: [
      {
        id: 'demo-appt-2',
        startTime: '2026-07-14T18:00:00.000Z',
        endTime: '2026-07-14T19:00:00.000Z',
        status: 'COMPLETED',
        paymentStatus: 'FULLY_PAID',
        depositAmountMxn: 300,
        symptoms: 'Dolor en muela del juicio',
        channelOrigin: 'PHONE_CALL',
        doctor: { name: 'Dr. Alejandro Morales', specialty: 'Cirugía Maxilofacial' },
        service: { name: 'Extracción de Muela del Juicio', priceMxn: 1950 },
      },
    ],
    conversations: [
      {
        id: 'demo-conv-2',
        channel: 'PHONE_CALL',
        externalChannelId: 'demo-call',
        lastMessageAt: '2026-07-14T17:40:00.000Z',
        createdAt: '2026-07-14T17:35:00.000Z',
        isHandedOverToHuman: false,
        messages: [
          {
            id: 'demo-msg-2',
            content: 'Gracias por llamar. Hasta luego.',
            createdAt: '2026-07-14T17:40:00.000Z',
            senderRole: 'AI_AGENT',
            direction: 'OUTBOUND',
          },
        ],
      },
    ],
  },
};

const APPOINTMENT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: 'Confirmada', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PENDING: { label: 'Pendiente', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-50 text-red-700 ring-red-200' },
  RESCHEDULED: { label: 'Reagendada', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  COMPLETED: { label: 'Completada', className: 'bg-teal-50 text-teal-700 ring-teal-200' },
  NO_SHOW: { label: 'No se presentó', className: 'bg-red-50 text-red-700 ring-red-200' },
};

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  PHONE_CALL: 'Llamada',
  WEBCHAT: 'Webchat',
};

function StatusBadge({ status }: { status: string }) {
  const info = APPOINTMENT_STATUS_LABEL[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        info.className
      )}
    >
      {info.label}
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || '?';
}

export default function PatientsPage() {
  const { mode, activeTenantId } = useTenant();
  const isDemo = mode === 'demo';

  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  // Un paciente seleccionado en Modo En Vivo no existe en el set fijo de Modo
  // Demo (ni viceversa): sin este reset, cambiar de modo deja el panel de
  // detalle mostrando un error falso en vez de volver a "selecciona un paciente".
  useEffect(() => {
    setSelectedId(null);
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      const term = search.trim().toLowerCase();
      setPatients(
        term
          ? DEMO_PATIENTS.filter(
              (p) => p.fullName.toLowerCase().includes(term) || p.phoneE164.includes(term)
            )
          : DEMO_PATIENTS
      );
      setStatus('ready');
      return;
    }
    if (!activeTenantId) {
      setPatients([]);
      setStatus('ready');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    const params = new URLSearchParams({ tenantId: activeTenantId });
    if (search.trim()) params.set('search', search.trim());

    apiFetch(`${API_BASE_URL}/api/patients?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`La API respondió ${response.status}`);
        setPatients((await response.json()) as PatientListItem[]);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setStatus('error');
      });

    return () => controller.abort();
  }, [isDemo, activeTenantId, search]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailStatus('idle');
      return;
    }
    if (isDemo) {
      setDetail(DEMO_DETAIL[selectedId] ?? null);
      setDetailStatus('ready');
      return;
    }

    const controller = new AbortController();
    setDetailStatus('loading');
    apiFetch(`${API_BASE_URL}/api/patients/${selectedId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`La API respondió ${response.status}`);
        setDetail((await response.json()) as PatientDetail);
        setDetailStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setDetailStatus('error');
      });

    return () => controller.abort();
  }, [selectedId, isDemo]);

  const hasTenant = isDemo || Boolean(activeTenantId);

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pacientes</h1>
              {isDemo && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
                  <Sparkles className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" />
                  Modo Demo Showcase
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Un expediente por número de teléfono (la llave real es única por clínica): cuántas citas ha
              tenido, cuántas veces ha llamado y su historial completo.
            </p>
          </div>
        </div>

        {!hasTenant ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-semibold text-slate-800">Selecciona una clínica</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Elige la clínica activa en la barra lateral para ver su directorio de pacientes.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            {/* Lista */}
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-3">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nombre o teléfono..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
              </div>

              <div className="max-h-[65vh] overflow-y-auto">
                {status === 'loading' && patients.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Cargando pacientes…
                  </div>
                ) : status === 'error' ? (
                  <div className="p-6 text-center text-sm text-amber-800">
                    No se pudo cargar el directorio. Intenta de nuevo en un momento.
                  </div>
                ) : patients.length === 0 ? (
                  <div className="p-6 text-center">
                    <Contact className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {search ? 'Ningún paciente coincide con esa búsqueda' : 'Aún no hay pacientes registrados'}
                    </p>
                    {!search && (
                      <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
                        En cuanto alguien agende por WhatsApp o llame por teléfono, va a aparecer aquí.
                      </p>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {patients.map((patient) => (
                      <li key={patient.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(patient.id)}
                          aria-pressed={selectedId === patient.id}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-50',
                            selectedId === patient.id && 'bg-teal-50 hover:bg-teal-50'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                              patient.isVip
                                ? 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200'
                                : 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200'
                            )}
                            aria-hidden="true"
                          >
                            {initialsOf(patient.fullName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {patient.fullName}
                              </span>
                              {patient.isVip && (
                                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
                              )}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-slate-500">
                              <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                              {formatMexicanPhone(patient.phoneE164)}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" aria-hidden="true" />
                                {patient.appointmentsCount} {patient.appointmentsCount === 1 ? 'cita' : 'citas'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <PhoneCall className="h-3 w-3" aria-hidden="true" />
                                {patient.callsCount} {patient.callsCount === 1 ? 'llamada' : 'llamadas'}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Detalle */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              {!selectedId ? (
                <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 p-8 text-center">
                  <Contact className="h-6 w-6 text-slate-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-700">Selecciona un paciente</p>
                  <p className="max-w-xs text-xs text-slate-500">
                    Elige alguien de la lista para ver su historial completo de citas y conversaciones.
                  </p>
                </div>
              ) : detailStatus === 'loading' && !detail ? (
                <div className="flex h-full min-h-[20rem] items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Cargando expediente…
                </div>
              ) : detailStatus === 'error' || !detail ? (
                <div className="flex h-full min-h-[20rem] items-center justify-center p-8 text-center text-sm text-amber-800">
                  No se pudo cargar el expediente de este paciente.
                </div>
              ) : (
                <div className="p-5">
                  <div className="flex items-start gap-3.5 border-b border-slate-100 pb-4">
                    <span
                      className={cn(
                        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                        detail.isVip
                          ? 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200'
                          : 'bg-teal-600 text-white'
                      )}
                      aria-hidden="true"
                    >
                      {initialsOf(detail.fullName)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="truncate text-lg font-bold text-slate-900">{detail.fullName}</h2>
                        {detail.isVip && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            <Star className="h-3 w-3 fill-amber-600 text-amber-600" aria-hidden="true" />
                            VIP
                          </span>
                        )}
                      </div>
                      <p className="text-sm tabular-nums text-slate-500">{formatMexicanPhone(detail.phoneE164)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Paciente desde {formatMexicoCityDate(detail.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Citas ({detail.appointments.length})
                    </h3>
                    {detail.appointments.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">Sin citas registradas todavía.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                        {detail.appointments.map((appt) => (
                          <li key={appt.id} className="p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">{appt.service.name}</p>
                              <StatusBadge status={appt.status} />
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatMexicoCityDate(appt.startTime)} · {formatMexicoCityTime(appt.startTime)} ·{' '}
                              {appt.doctor.name}
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                              <span>{formatMxn(appt.service.priceMxn)}</span>
                              {appt.depositAmountMxn ? (
                                <span>Anticipo {formatMxn(appt.depositAmountMxn)} · {appt.paymentStatus}</span>
                              ) : null}
                              <span>Canal: {CHANNEL_LABEL[appt.channelOrigin] ?? appt.channelOrigin}</span>
                            </p>
                            {appt.symptoms && (
                              <p className="mt-1 text-xs italic text-slate-500">“{appt.symptoms}”</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Conversaciones ({detail.conversations.length})
                    </h3>
                    {detail.conversations.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">Sin conversaciones registradas todavía.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                        {detail.conversations.map((conv) => {
                          const lastMessage = conv.messages[0];
                          return (
                            <li key={conv.id} className="flex items-start gap-2.5 p-3">
                              {conv.channel === 'PHONE_CALL' ? (
                                <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                              ) : (
                                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-700">
                                    {CHANNEL_LABEL[conv.channel] ?? conv.channel}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {conv.lastMessageAt ? formatMexicoCityDate(conv.lastMessageAt) : '—'}
                                  </span>
                                </div>
                                {lastMessage && (
                                  <p className="mt-0.5 truncate text-xs text-slate-500">{lastMessage.content}</p>
                                )}
                                {conv.isHandedOverToHuman && (
                                  <span className="mt-1 inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                                    En atención humana
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {!isDemo && (
                      <Link
                        href="/dashboard/inbox"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                      >
                        Ver conversaciones completas en la bandeja <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
