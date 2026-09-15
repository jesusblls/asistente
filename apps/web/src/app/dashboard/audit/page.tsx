'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronDown,
  Cpu,
  CreditCard,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserX,
  X,
} from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';
import { API_BASE_URL, apiFetch, getUser } from '../../../lib/api';
import { formatMexicanPhone, formatMexicoCityTime, toMexicoCityDateKey } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import {
  CATEGORY_ACTIONS,
  CATEGORY_OPTIONS,
  PERIOD_OPTIONS,
  PERIOD_PHRASE,
  actorInfo,
  auditEventsToCsv,
  changeRows,
  describeEvent,
  groupByDay,
  parseCategory,
  parsePeriod,
  periodStartIso,
  sensitivityOf,
  traceItems,
  type ActorInfo,
  type AuditEvent,
  type AuditPatientRef,
  type AuditPeriod,
  type AuditScheduleContext,
} from '../../../lib/audit';
import { buildDemoAuditEvents, filterDemoEvents } from './demo';

const PAGE_SIZE = 100;
/** Al enfocar un expediente o una persona se trae más, para que el resumen sea completo. */
const PIVOT_PAGE_SIZE = 500;

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';
type Notice = { tone: 'success' | 'error'; text: string };

/** Resultado en vivo, etiquetado con los filtros y el refresco que lo originaron. */
interface LiveResult {
  key: string;
  token: number;
  events: AuditEvent[];
  hasMore: boolean;
  error: string | null;
  forbidden: boolean;
}

/**
 * Personas y pacientes vistos en la sesión. Se conserva entre filtros para que
 * el selector de persona no se reduzca a una opción al aplicarlo y el pivote
 * conserve el nombre aunque el periodo elegido no tenga eventos.
 */
interface Directory {
  scope: string;
  actors: Map<string, ActorInfo>;
  patients: Map<string, AuditPatientRef>;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

function emptyDirectory(scope: string): Directory {
  return { scope, actors: new Map(), patients: new Map() };
}

function mergeDirectory(
  base: Directory,
  batch: AuditEvent[],
  extraPatient?: AuditPatientRef | null
): Directory {
  let actors = base.actors;
  let patients = base.patients;

  const addPatient = (patient: AuditPatientRef) => {
    if (patients.has(patient.id)) return;
    if (patients === base.patients) patients = new Map(patients);
    patients.set(patient.id, patient);
  };

  for (const event of batch) {
    const actor = actorInfo(event);
    if (actor.pivotId && !actors.has(actor.pivotId)) {
      if (actors === base.actors) actors = new Map(actors);
      actors.set(actor.pivotId, actor);
    }
    if (event.patient) addPatient(event.patient);
  }
  if (extraPatient) addPatient(extraPatient);

  return actors === base.actors && patients === base.patients
    ? base
    : { scope: base.scope, actors, patients };
}

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-8">
          <div className="max-w-5xl">
            <FeedSkeleton />
          </div>
        </div>
      }
    >
      <AuditScreen />
    </Suspense>
  );
}

function AuditScreen() {
  const { mode, setMode, activeTenant, activeTenantId } = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // El estado de los filtros vive en la URL: el enlace a "quién vio el
  // expediente de X" se puede compartir y el botón atrás deshace un pivote.
  const patientId = searchParams.get('patientId');
  const actorId = searchParams.get('actorId');
  const period = parsePeriod(searchParams.get('period'));
  const category = parseCategory(searchParams.get('type'));
  const onlySensitive = searchParams.get('sensitive') === '1';

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // AuthGuard solo monta el panel en el cliente, así que la sesión ya se puede leer al iniciar.
  const [role] = useState(() => getUser()?.role ?? null);

  const [live, setLive] = useState<LiveResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedState, setExpandedState] = useState<{ key: string; ids: Set<string> }>(() => ({
    key: '',
    ids: new Set(),
  }));
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [liveDirectory, setLiveDirectory] = useState<Directory>(() => emptyDirectory(''));

  const isDemo = mode === 'demo';
  const pageSize = patientId || actorId ? PIVOT_PAGE_SIZE : PAGE_SIZE;
  const canQueryLive = !isDemo && role === 'ADMIN' && Boolean(activeTenantId);
  const directoryScope = activeTenantId;

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      const from = periodStartIso(period);
      if (from) params.set('from', from);
      if (category !== 'all') params.set('action', CATEGORY_ACTIONS[category].join(','));
      if (patientId) params.set('patientId', patientId);
      if (actorId) params.set('actorId', actorId);
      for (const [key, value] of Object.entries(extra)) params.set(key, value);
      return params;
    },
    [period, category, patientId, actorId]
  );

  const requestKey = [activeTenantId, period, category, patientId ?? '', actorId ?? '', pageSize].join('|');
  const viewKey = `${isDemo}|${requestKey}`;

  const rememberDirectory = useCallback(
    (batch: AuditEvent[], extraPatient?: AuditPatientRef | null) => {
      setLiveDirectory((previous) =>
        mergeDirectory(
          previous.scope === directoryScope ? previous : emptyDirectory(directoryScope),
          batch,
          extraPatient
        )
      );
    },
    [directoryScope]
  );

  useEffect(() => {
    if (!canQueryLive) return;
    const controller = new AbortController();
    const token = reloadToken;

    apiFetch(`${API_BASE_URL}/api/audit?${buildQuery({ limit: String(pageSize) })}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403) {
          setLive({ key: requestKey, token, events: [], hasMore: false, error: null, forbidden: true });
          return;
        }
        if (!response.ok) throw new Error(`La API respondió ${response.status}`);
        const batch = (await response.json()) as AuditEvent[];
        setLive({
          key: requestKey,
          token,
          events: batch,
          hasMore: batch.length === pageSize,
          error: null,
          forbidden: false,
        });
        rememberDirectory(batch);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Error desconocido';
        // Un refresco fallido conserva la lista que ya se veía.
        setLive((previous) =>
          previous && previous.key === requestKey
            ? { ...previous, token, error: message }
            : { key: requestKey, token, events: [], hasMore: false, error: message, forbidden: false }
        );
      });

    return () => controller.abort();
  }, [canQueryLive, requestKey, reloadToken, buildQuery, pageSize, rememberDirectory]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  // --- Estado derivado --------------------------------------------------
  const demoEvents = useMemo(() => (isDemo ? buildDemoAuditEvents() : []), [isDemo]);
  const demoDirectory = useMemo(() => mergeDirectory(emptyDirectory('demo'), demoEvents), [demoEvents]);
  const directory = isDemo
    ? demoDirectory
    : liveDirectory.scope === directoryScope
      ? liveDirectory
      : emptyDirectory(directoryScope);

  // Cambiar un filtro cambia `requestKey`: la lista anterior deja de mostrarse
  // al instante. Un refresco conserva la clave y la lista mientras llega la nueva.
  const liveCurrent = live && live.key === requestKey ? live : null;

  const events = useMemo(() => {
    if (isDemo) return filterDemoEvents(demoEvents, { period, category, patientId, actorId });
    if (!canQueryLive) return [];
    return liveCurrent?.events ?? [];
  }, [isDemo, demoEvents, period, category, patientId, actorId, canQueryLive, liveCurrent]);

  const forbidden = !isDemo && (role !== 'ADMIN' || Boolean(liveCurrent?.forbidden));
  const settled = isDemo || !canQueryLive || (liveCurrent !== null && liveCurrent.token === reloadToken);
  const errorMessage = canQueryLive ? liveCurrent?.error ?? null : null;
  const status: LoadState = forbidden ? 'forbidden' : !settled ? 'loading' : errorMessage ? 'error' : 'ready';
  const hasMore = canQueryLive ? liveCurrent?.hasMore ?? false : false;
  const expanded = expandedState.key === viewKey ? expandedState.ids : EMPTY_IDS;

  const actorOptions = useMemo(() => {
    const order: Record<ActorInfo['kind'], number> = { person: 0, ai: 1, payment: 2, system: 3, unknown: 4 };
    return [...directory.actors.values()].sort(
      (a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'es')
    );
  }, [directory.actors]);

  const scheduleContext = useMemo<AuditScheduleContext>(
    () => ({ doctors: activeTenant?.doctors }),
    [activeTenant?.doctors]
  );

  const visibleEvents = useMemo(
    () => (onlySensitive ? events.filter((event) => sensitivityOf(event, scheduleContext)) : events),
    [events, onlySensitive, scheduleContext]
  );
  const sensitiveCount = useMemo(
    () => events.filter((event) => sensitivityOf(event, scheduleContext)).length,
    [events, scheduleContext]
  );
  const groups = useMemo(() => groupByDay(visibleEvents), [visibleEvents]);

  // --- Acciones ---------------------------------------------------------
  const scrollToTop = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('main')?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const pivotToPatient = (id: string, patient: AuditPatientRef | null) => {
    if (patient && !isDemo) rememberDirectory([], patient);
    // El resumen del expediente cuenta todos los accesos: con un filtro de
    // tipo activo diría "nadie accedió" a un expediente que sí se consultó.
    updateParams({ patientId: id, actorId: null, type: null, sensitive: null });
    scrollToTop();
  };

  const pivotToActor = (id: string) => {
    updateParams({ actorId: id });
    scrollToTop();
  };

  const toggleExpanded = (id: string) => {
    setExpandedState((previous) => {
      const ids = new Set(previous.key === viewKey ? previous.ids : []);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { key: viewKey, ids };
    });
  };

  const loadMore = async () => {
    const oldest = events[events.length - 1];
    if (!oldest) return;
    const key = requestKey;
    setLoadingMore(true);
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/audit?${buildQuery({ limit: String(pageSize), to: oldest.createdAt })}`
      );
      if (!response.ok) throw new Error(`La API respondió ${response.status}`);
      const batch = (await response.json()) as AuditEvent[];
      setLive((previous) => {
        if (!previous || previous.key !== key) return previous;
        const seen = new Set(previous.events.map((event) => event.id));
        const fresh = batch.filter((event) => !seen.has(event.id));
        return {
          ...previous,
          events: [...previous.events, ...fresh],
          hasMore: batch.length === pageSize && fresh.length > 0,
        };
      });
      rememberDirectory(batch);
    } catch {
      setNotice({ tone: 'error', text: 'No se pudieron cargar eventos anteriores. Intenta de nuevo.' });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setNotice(null);
    try {
      let blob: Blob;
      if (isDemo) {
        blob = new Blob([auditEventsToCsv(events)], { type: 'text/csv;charset=utf-8' });
      } else {
        const response = await apiFetch(`${API_BASE_URL}/api/audit/export?${buildQuery()}`);
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? 'Tu rol no puede exportar la bitácora.'
              : `No se pudo exportar (la API respondió ${response.status}).`
          );
        }
        blob = await response.blob();
      }

      downloadBlob(
        blob,
        `bitacora-${activeTenant?.slug ?? 'sonrisas-polanco'}-${toMexicoCityDateKey(new Date())}.csv`
      );

      if (isDemo) {
        setNotice({ tone: 'success', text: 'CSV de demostración descargado.' });
      } else {
        setNotice({
          tone: 'success',
          text: 'CSV descargado. La exportación quedó registrada y ya aparece en la bitácora.',
        });
        setReloadToken((token) => token + 1);
      }
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo exportar la bitácora.',
      });
    } finally {
      setExporting(false);
    }
  };

  const clinicName = isDemo ? 'Clínica Dental Sonrisas Polanco' : activeTenant?.name ?? 'la clínica';
  const refreshing = status === 'loading' && events.length > 0;
  const filtersActive =
    period !== '7d' || category !== 'all' || onlySensitive || Boolean(patientId) || Boolean(actorId);

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-5xl space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bitácora de Auditoría</h1>
              {isDemo ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
                  <Sparkles className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" />
                  Modo Demo Showcase
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Registro inalterable
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Quién vio o modificó cada expediente de {clinicName}. Ningún registro se puede editar ni
              borrar, y se conserva 5 años.
            </p>
          </div>

          {status !== 'forbidden' && (
            <div className="flex shrink-0 items-center gap-2">
              {!isDemo && (
                <button
                  type="button"
                  onClick={() => setReloadToken((token) => token + 1)}
                  disabled={status === 'loading'}
                  aria-label="Actualizar bitácora"
                  title="Actualizar"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={cn('h-4 w-4', status === 'loading' && 'animate-spin')} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || status !== 'ready' || events.length === 0}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden="true" />
                )}
                {exporting ? 'Exportando…' : 'Exportar CSV'}
              </button>
            </div>
          )}
        </div>

        <div aria-live="polite">
          {notice && (
            <p
              role="status"
              className={cn(
                'flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs font-medium',
                notice.tone === 'success'
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              )}
            >
              <span>{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Cerrar aviso"
                className="shrink-0 rounded opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </p>
          )}
        </div>

        {status === 'forbidden' ? (
          <ForbiddenPanel onShowDemo={() => setMode('demo')} />
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:flex-wrap lg:items-center lg:gap-4">
              <Segmented
                ariaLabel="Periodo"
                value={period}
                options={PERIOD_OPTIONS}
                onChange={(value) => updateParams({ period: value === '7d' ? null : value })}
              />
              <Segmented
                ariaLabel="Tipo de evento"
                value={category}
                options={CATEGORY_OPTIONS}
                onChange={(value) => updateParams({ type: value === 'all' ? null : value })}
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Persona
                <select
                  value={actorId ?? ''}
                  onChange={(event) => updateParams({ actorId: event.target.value || null })}
                  className="min-w-0 max-w-[14rem] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                >
                  <option value="">Todo el personal</option>
                  {actorOptions.map((actor) => (
                    <option key={actor.pivotId} value={actor.pivotId ?? ''}>
                      {actor.detail && actor.kind === 'person' ? `${actor.name} · ${actor.detail}` : actor.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={onlySensitive}
                onClick={() => updateParams({ sensitive: onlySensitive ? null : '1' })}
                className="inline-flex w-fit items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-slate-700 lg:ml-auto"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150',
                    onlySensitive ? 'bg-teal-600' : 'bg-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150',
                      onlySensitive ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
                    )}
                  />
                </span>
                Solo sensibles
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
                    sensitiveCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {sensitiveCount}
                </span>
              </button>
            </div>

            {(patientId || actorId) && (
              <PivotHeader
                patientId={patientId}
                patient={patientId ? directory.patients.get(patientId) ?? null : null}
                actor={actorId ? directory.actors.get(actorId) ?? null : null}
                events={events}
                period={period}
                category={category}
                hasMore={hasMore}
                loading={status === 'loading'}
                activeActorId={actorId}
                onPivotActor={pivotToActor}
                onClearActor={() => updateParams({ actorId: null })}
                onClearAll={() => updateParams({ patientId: null, actorId: null })}
              />
            )}

            {status === 'error' && (
              <div
                role="alert"
                className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">No se pudo cargar la bitácora</p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      {errorMessage}. Los registros siguen a salvo en el servidor.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReloadToken((token) => token + 1)}
                  className="self-start rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-900 transition-colors duration-150 hover:bg-amber-100 sm:self-auto"
                >
                  Reintentar
                </button>
              </div>
            )}

            {status === 'loading' && events.length === 0 ? (
              <FeedSkeleton />
            ) : visibleEvents.length === 0 ? (
              status !== 'error' && (
                <EmptyState
                  onlySensitive={onlySensitive && events.length > 0}
                  filtersActive={filtersActive}
                  hasTenant={isDemo || Boolean(activeTenantId)}
                  periodPhrase={PERIOD_PHRASE[period]}
                  onClearFilters={() =>
                    updateParams({ period: null, type: null, sensitive: null, patientId: null, actorId: null })
                  }
                  onShowAll={() => updateParams({ sensitive: null })}
                />
              )
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-slate-500">
                  <p>
                    <span className="font-semibold tabular-nums text-slate-800">
                      {visibleEvents.length.toLocaleString('es-MX')}
                      {hasMore ? '+' : ''}
                    </span>{' '}
                    {visibleEvents.length === 1 ? 'evento' : 'eventos'}
                    {onlySensitive ? ' sensibles' : ''} {PERIOD_PHRASE[period]}
                    {!onlySensitive && sensitiveCount > 0 && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => updateParams({ sensitive: '1' })}
                          className="font-semibold text-amber-800 underline decoration-amber-300 underline-offset-2 hover:decoration-amber-600"
                        >
                          {sensitiveCount} {sensitiveCount === 1 ? 'requiere' : 'requieren'} atención
                        </button>
                      </>
                    )}
                  </p>
                  {refreshing ? (
                    <p className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Actualizando…
                    </p>
                  ) : (
                    onlySensitive && <p>La exportación incluye todo el filtro, no solo los sensibles.</p>
                  )}
                </div>

                {groups.map((group) => (
                  <section key={group.key} aria-labelledby={`dia-${group.key}`}>
                    <h2
                      id={`dia-${group.key}`}
                      className="sticky top-0 z-10 -mx-1 bg-slate-100 px-1 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600"
                    >
                      {group.label}
                      <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-500">
                        · {group.events.length}
                      </span>
                    </h2>
                    <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      {group.events.map((event) => (
                        <EventRow
                          key={event.id}
                          event={event}
                          scheduleContext={scheduleContext}
                          expanded={expanded.has(event.id)}
                          onToggle={() => toggleExpanded(event.id)}
                          focusedPatientId={patientId}
                          focusedActorId={actorId}
                          onPivotPatient={pivotToPatient}
                          onPivotActor={pivotToActor}
                        />
                      ))}
                    </ol>
                  </section>
                ))}

                {hasMore && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      {loadingMore ? 'Cargando…' : 'Cargar eventos anteriores'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pivote: expediente de un paciente y/o actividad de una persona
// ---------------------------------------------------------------------------

function joinSpanish(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

interface PersonAccess {
  actor: ActorInfo;
  count: number;
}

function peopleWhoAccessed(events: AuditEvent[]): PersonAccess[] {
  const byActor = new Map<string, PersonAccess>();
  for (const event of events) {
    const actor = actorInfo(event);
    const key = actor.pivotId ?? `anon:${actor.name}`;
    const entry = byActor.get(key);
    if (entry) entry.count += 1;
    else byActor.set(key, { actor, count: 1 });
  }
  return [...byActor.values()].sort((a, b) => b.count - a.count);
}

function patientAnswer(people: PersonAccess[], period: AuditPeriod, hasMore: boolean): string {
  const humans = people.filter((person) => person.actor.kind === 'person' || person.actor.kind === 'unknown');
  const parts: string[] = [];
  if (humans.length > 0) parts.push(`${humans.length} ${humans.length === 1 ? 'persona' : 'personas'}`);
  if (people.some((person) => person.actor.kind === 'ai')) parts.push('el Asistente IA');
  if (people.some((person) => person.actor.kind === 'payment')) parts.push('Mercado Pago');

  if (parts.length === 0) return `Nadie ha accedido a este expediente ${PERIOD_PHRASE[period]}.`;

  const verb = parts.length > 1 || humans.length > 1 ? 'accedieron' : 'accedió';
  const sentenceText = `${hasMore ? 'al menos ' : ''}${joinSpanish(parts)} ${verb} a este expediente ${PERIOD_PHRASE[period]}.`;
  return sentenceText.charAt(0).toUpperCase() + sentenceText.slice(1);
}

function PivotHeader({
  patientId,
  patient,
  actor,
  events,
  period,
  category,
  hasMore,
  loading,
  activeActorId,
  onPivotActor,
  onClearActor,
  onClearAll,
}: {
  patientId: string | null;
  patient: AuditPatientRef | null;
  actor: ActorInfo | null;
  events: AuditEvent[];
  period: AuditPeriod;
  category: ReturnType<typeof parseCategory>;
  hasMore: boolean;
  loading: boolean;
  activeActorId: string | null;
  onPivotActor: (id: string) => void;
  onClearActor: () => void;
  onClearAll: () => void;
}) {
  const count = `${events.length.toLocaleString('es-MX')}${hasMore ? '+' : ''}`;
  const eventsWord = events.length === 1 ? 'evento' : 'eventos';
  const people = peopleWhoAccessed(events);
  // Con un filtro de tipo los eventos ya no son todos los accesos: la frase lo
  // dice, en vez de afirmar algo sobre el expediente completo.
  const filterLabel =
    category === 'all' ? null : CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? null;

  let title: string;
  let subtitle: string | null;
  let answer: string;

  if (patientId) {
    title = patient?.fullName ?? 'Paciente sin nombre registrado';
    subtitle = patient?.phoneE164 ? formatMexicanPhone(patient.phoneE164) : null;
    answer = actor
      ? `${count} ${eventsWord} de ${actor.name} en este expediente ${PERIOD_PHRASE[period]}.`
      : filterLabel
        ? `${count} ${eventsWord} en este expediente ${PERIOD_PHRASE[period]}.`
        : patientAnswer(people, period, hasMore);
  } else {
    const distinctPatients = new Set(events.map((event) => event.patientId).filter(Boolean)).size;
    title = actor?.name ?? 'Persona seleccionada';
    subtitle = actor?.detail ?? null;
    answer =
      events.length === 0
        ? `Sin actividad registrada ${PERIOD_PHRASE[period]}.`
        : `${count} ${eventsWord} sobre ${distinctPatients} ${
            distinctPatients === 1 ? 'expediente' : 'expedientes'
          } ${PERIOD_PHRASE[period]}.`;
  }

  if (filterLabel) {
    answer = `Con el filtro «${filterLabel}»: ${answer.charAt(0).toLowerCase()}${answer.slice(1)}`;
  }

  const initials = patientId
    ? (patient?.fullName ?? '?')
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('')
    : actor?.initials ?? '?';

  return (
    <section aria-label="Enfoque" className="rounded-xl border border-teal-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {patientId || actor?.kind === 'person' || !actor ? (
            <span
              aria-hidden="true"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white"
            >
              {initials}
            </span>
          ) : (
            <ActorAvatar actor={actor} size="lg" />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs tabular-nums text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Ver toda la clínica
        </button>
      </div>

      <p className="mt-4 text-lg font-semibold leading-snug text-slate-800" aria-live="polite">
        {loading && events.length === 0 ? 'Revisando el registro…' : answer}
      </p>

      {patientId && actor && (
        <button
          type="button"
          onClick={onClearActor}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 transition-colors duration-150 hover:bg-teal-100"
        >
          Solo {actor.name}
          <X className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Quitar filtro de persona</span>
        </button>
      )}

      {patientId && !actor && people.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Quiénes accedieron">
          {people.map(({ actor: person, count: accesses }) => {
            const content = (
              <>
                <ActorAvatar actor={person} size="sm" />
                <span className="font-semibold text-slate-800">{person.name}</span>
                {person.detail && <span className="text-slate-500">{person.detail}</span>}
                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold tabular-nums text-slate-600">
                  {accesses}
                </span>
              </>
            );
            return (
              <li key={person.pivotId ?? person.name}>
                {person.pivotId ? (
                  <button
                    type="button"
                    onClick={() => onPivotActor(person.pivotId!)}
                    aria-pressed={activeActorId === person.pivotId}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs transition-colors duration-150 hover:border-teal-300 hover:bg-teal-50"
                  >
                    {content}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs">
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fila del feed
// ---------------------------------------------------------------------------

function EventRow({
  event,
  scheduleContext,
  expanded,
  onToggle,
  focusedPatientId,
  focusedActorId,
  onPivotPatient,
  onPivotActor,
}: {
  event: AuditEvent;
  scheduleContext?: AuditScheduleContext;
  expanded: boolean;
  onToggle: () => void;
  focusedPatientId: string | null;
  focusedActorId: string | null;
  onPivotPatient: (id: string, patient: AuditPatientRef | null) => void;
  onPivotActor: (id: string) => void;
}) {
  const actor = actorInfo(event);
  const sentenceParts = describeEvent(event);
  const sensitivity = sensitivityOf(event, scheduleContext);
  const changes = changeRows(event);
  const trace = traceItems(event);
  const hasDetail = changes.length > 0 || trace.length > 0;
  const detailId = `detalle-${event.id}`;

  const actorCanPivot = Boolean(actor.pivotId) && actor.pivotId !== focusedActorId;
  const patientCanPivot = Boolean(event.patientId) && event.patientId !== focusedPatientId;
  const patientName = event.patient?.fullName ?? 'un paciente dado de baja';
  const critical = sensitivity?.level === 'critical';
  // En filas críticas el texto secundario toma el tono de la fila, no gris.
  const mutedText = critical ? 'text-red-900/70' : 'text-slate-500';
  const time = formatMexicoCityTime(event.createdAt);

  return (
    <li
      className={cn(
        // En pantallas angostas la hora pasa a la línea de detalle: una
        // columna fija de 4.5rem le quitaría a la frase casi la mitad del ancho.
        'grid grid-cols-[2rem_minmax(0,1fr)_2rem] gap-x-3 px-4 py-3 sm:grid-cols-[4.5rem_2rem_minmax(0,1fr)_2rem] sm:px-5',
        critical && 'bg-red-50/50'
      )}
    >
      <time
        dateTime={event.createdAt}
        className={cn('hidden pt-1.5 text-xs font-medium tabular-nums sm:block', mutedText)}
      >
        {time}
      </time>

      <ActorAvatar actor={actor} />

      <div className="min-w-0">
        <p className="text-sm leading-6 text-slate-700">
          {actorCanPivot ? (
            <button
              type="button"
              onClick={() => onPivotActor(actor.pivotId!)}
              className="rounded font-semibold text-slate-900 underline-offset-2 hover:text-teal-700 hover:underline"
            >
              {actor.name}
            </button>
          ) : (
            <span className="font-semibold text-slate-900">{actor.name}</span>
          )}{' '}
          {sentenceParts.lead}
          {sentenceParts.showPatient && (
            <>
              {' '}
              {patientCanPivot ? (
                <button
                  type="button"
                  onClick={() => onPivotPatient(event.patientId!, event.patient)}
                  className="rounded font-semibold text-teal-700 underline decoration-teal-300 underline-offset-2 transition-colors duration-150 hover:text-teal-800 hover:decoration-teal-600"
                >
                  {patientName}
                </button>
              ) : (
                <span className="font-semibold text-slate-900">{patientName}</span>
              )}
            </>
          )}
          {sentenceParts.trail && <span className="text-slate-500"> · {sentenceParts.trail}</span>}
        </p>

        <div className={cn('mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', mutedText)}>
          <span className="tabular-nums sm:hidden">{time}</span>
          {actor.detail && <span>{actor.detail}</span>}
          {sensitivity && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                sensitivity.level === 'critical'
                  ? 'bg-red-50 text-red-700 ring-red-200'
                  : 'bg-amber-50 text-amber-800 ring-amber-200'
              )}
            >
              {sensitivity.level === 'critical' ? (
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              )}
              {sensitivity.label}
            </span>
          )}
        </div>

        {/* Siempre en el DOM (oculto al estar plegado) para que aria-controls apunte a algo real. */}
        {hasDetail && (
          <div
            id={detailId}
            hidden={!expanded}
            className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
          >
            {changes.length > 0 && (
              <dl className="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2">
                {changes.map((change) => (
                  <React.Fragment key={change.field}>
                    <dt className="font-medium text-slate-500">{change.label}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-slate-900">
                      <span
                        className={cn(
                          'break-words',
                          change.before === '—' ? 'text-slate-400' : 'text-slate-500 line-through decoration-slate-300'
                        )}
                      >
                        {change.before}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" aria-label="cambió a" />
                      <span className="break-words font-semibold">{change.after}</span>
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
            {trace.length > 0 && (
              <dl
                className={cn(
                  'grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5',
                  changes.length > 0 && 'mt-3 border-t border-slate-200 pt-3'
                )}
              >
                {trace.map((item) => (
                  <React.Fragment key={item.label}>
                    <dt className="text-slate-500">{item.label}</dt>
                    <dd className={cn('break-all text-slate-700', item.mono && 'font-mono text-[11px]')}>
                      {item.value}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>

      {hasDetail ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700"
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-150', expanded && 'rotate-180')}
            aria-hidden="true"
          />
          <span className="sr-only">{expanded ? 'Ocultar detalle' : 'Ver detalle'}</span>
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </li>
  );
}

function ActorAvatar({ actor, size = 'md' }: { actor: ActorInfo; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = {
    sm: 'h-5 w-5 text-[9px]',
    md: 'h-8 w-8 text-[11px]',
    lg: 'h-11 w-11 text-sm',
  }[size];
  const iconSize = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-5 w-5' }[size];
  const base = cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', dimensions);

  switch (actor.kind) {
    case 'ai':
      return (
        <span className={cn(base, 'bg-slate-900 text-teal-300')} aria-hidden="true">
          <Bot className={iconSize} />
        </span>
      );
    case 'payment':
      return (
        <span className={cn(base, 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200')} aria-hidden="true">
          <CreditCard className={iconSize} />
        </span>
      );
    case 'system':
      return (
        <span className={cn(base, 'bg-slate-100 text-slate-600')} aria-hidden="true">
          <Cpu className={iconSize} />
        </span>
      );
    case 'unknown':
      return (
        <span className={cn(base, 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200')} aria-hidden="true">
          <UserX className={iconSize} />
        </span>
      );
    default:
      return (
        <span className={cn(base, 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200')} aria-hidden="true">
          {actor.initials}
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Controles y estados
// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex w-fit rounded-lg bg-slate-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150',
            option.value === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div role="status" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <span className="sr-only">Cargando la bitácora…</span>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} aria-hidden="true" className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 last:border-0">
          <div className="mt-1.5 h-3 w-14 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${70 - index * 6}%` }} />
            <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  onlySensitive,
  filtersActive,
  hasTenant,
  periodPhrase,
  onClearFilters,
  onShowAll,
}: {
  onlySensitive: boolean;
  filtersActive: boolean;
  hasTenant: boolean;
  periodPhrase: string;
  onClearFilters: () => void;
  onShowAll: () => void;
}) {
  const shell = 'rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center';

  if (!hasTenant) {
    return (
      <div className={shell}>
        <p className="text-sm font-semibold text-slate-800">Selecciona una clínica</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Elige la clínica activa en la barra lateral para ver su bitácora.
        </p>
      </div>
    );
  }

  if (onlySensitive) {
    return (
      <div className={shell}>
        <ShieldCheck className="mx-auto h-6 w-6 text-emerald-600" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-slate-800">Nada que requiera atención {periodPhrase}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Ningún inicio de sesión fallido, borrado, pago marcado a mano, exportación ni acceso fuera de
          horario.
        </p>
        <button
          type="button"
          onClick={onShowAll}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50"
        >
          Ver todos los eventos
        </button>
      </div>
    );
  }

  if (filtersActive) {
    return (
      <div className={shell}>
        <p className="text-sm font-semibold text-slate-800">Ningún evento coincide con estos filtros</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Amplía el periodo o quita algún filtro para ver más actividad.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50"
        >
          Quitar filtros
        </button>
      </div>
    );
  }

  return (
    <div className={shell}>
      <ShieldCheck className="mx-auto h-6 w-6 text-teal-600" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-800">La bitácora se llena sola</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Cada vez que alguien del personal o el Asistente IA abre un chat, agenda, confirma o cancela una
        cita, queda registrado aquí con su hora y su IP.
      </p>
      <Link
        href="/dashboard/inbox"
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
      >
        Ir a la bandeja <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ForbiddenPanel({ onShowDemo }: { onShowDemo: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">
        Solo la dirección de la clínica puede consultar la bitácora
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Registra quién vio el expediente de cada paciente, por eso su acceso está limitado a
        administradores y cada consulta también queda registrada. Si necesitas revisar un acceso,
        pídeselo a la dirección.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50"
        >
          Volver al resumen
        </Link>
        <button
          type="button"
          onClick={onShowDemo}
          className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-semibold text-purple-800 transition-colors duration-150 hover:bg-purple-100"
        >
          Ver un ejemplo en Modo Demo
        </button>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
