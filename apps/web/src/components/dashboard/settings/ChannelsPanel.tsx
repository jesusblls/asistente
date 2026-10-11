'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Lock,
  MessageSquare,
  PhoneCall,
  PlugZap,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { API_BASE_URL, apiFetch, getSessionTenant } from '@/lib/api';
import { formatMexicanPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Estado real de los canales de la clínica (`GET /api/channels`) y alta del
 * número propio de WhatsApp.
 *
 * Antes las tarjetas decían "Conectado" siempre, aunque no hubiera ninguna
 * credencial: la clínica creía que sus pacientes recibían mensajes que nunca
 * salían. Ahora cada tarjeta refleja lo que la API sabe de verdad, y el token
 * jamás regresa al navegador (solo sus últimos 4 caracteres).
 */

export interface WhatsAppStatus {
  configured: boolean;
  source: 'CLINIC' | 'PLATFORM' | 'NONE';
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  tokenLast4: string | null;
  connectedAt: string | null;
  readable: boolean;
}

export interface MercadoPagoStatus {
  configured: boolean;
  source: 'CLINIC' | 'NONE';
  userId: string | null;
  nickname: string | null;
  tokenLast4: string | null;
  connectedAt: string | null;
  readable: boolean;
  testMode: boolean;
}

interface ChannelsStatus {
  whatsapp: WhatsAppStatus;
  voice: { configured: boolean; scope: string; phoneE164: string | null };
  mercadoPago: MercadoPagoStatus;
}

type Notify = (tone: 'success' | 'error', text: string) => void;

type Badge = { tone: 'ok' | 'warn' | 'off' | 'demo'; label: string };

const BADGE_STYLES: Record<Badge['tone'], string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warn: 'text-amber-700 bg-amber-50 border-amber-200',
  off: 'text-slate-600 bg-slate-100 border-slate-200',
  demo: 'text-purple-700 bg-purple-50 border-purple-200',
};

function StatusBadge({ badge }: { badge: Badge }) {
  return (
    <span
      className={cn(
        'text-xs font-bold border px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-xs',
        BADGE_STYLES[badge.tone]
      )}
    >
      {badge.tone === 'ok' || badge.tone === 'demo' ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5" />
      )}
      {badge.label}
    </span>
  );
}

function ChannelCard({
  icon,
  iconClass,
  title,
  badge,
  headline,
  children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  badge: Badge;
  headline?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('p-2.5 rounded-xl border shadow-xs', iconClass)}>{icon}</span>
        <StatusBadge badge={badge} />
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
        {headline && (
          <p className="font-mono text-sm text-slate-800 mt-1.5 font-bold tabular-nums break-all">{headline}</p>
        )}
        <div className="text-xs text-slate-500 mt-2.5 leading-relaxed space-y-1.5">{children}</div>
      </div>
    </div>
  );
}

function whatsappBadge(status: WhatsAppStatus): Badge {
  if (status.source === 'CLINIC') return { tone: 'ok', label: 'Número propio' };
  if (!status.readable) return { tone: 'warn', label: 'Credenciales ilegibles' };
  if (status.source === 'PLATFORM') return { tone: 'warn', label: 'Número compartido' };
  return { tone: 'off', label: 'Sin configurar' };
}

const inputClass =
  'w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white transition-all shadow-2xs';

function WhatsAppForm({
  status,
  onSaved,
  notify,
}: {
  status: WhatsAppStatus;
  onSaved: (status: WhatsAppStatus) => void;
  notify: Notify;
}) {
  // Una fila ilegible también es "propia": hay que poder quitarla o reemplazarla.
  const hasOwn = Boolean(status.phoneNumberId) || !status.readable;
  const [phoneNumberId, setPhoneNumberId] = useState(status.phoneNumberId ?? '');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState(status.displayPhoneNumber ?? '');
  const [wabaId, setWabaId] = useState(status.wabaId ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setError(null);
    setTestResult(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/channels/whatsapp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: phoneNumberId.trim(),
          displayPhoneNumber: displayPhoneNumber.trim(),
          ...(wabaId.trim() ? { wabaId: wabaId.trim() } : {}),
          ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar el número de WhatsApp');
        return;
      }
      setAccessToken('');
      onSaved(data.whatsapp);
      if (data.verification?.ok) {
        notify('success', 'Número de WhatsApp guardado y verificado con Meta');
      } else {
        // Solo pasa fuera de producción: allí la API rechaza lo que Meta no confirma.
        notify('error', `Guardado sin verificar: ${data.verification?.message || 'Meta no confirmó el número'}`);
      }
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/channels/whatsapp/test`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult({ ok: false, text: data.error || 'No se pudo probar la conexión' });
      } else if (data.ok) {
        const who = [data.verifiedName, data.displayPhoneNumber].filter(Boolean).join(' · ');
        setTestResult({ ok: true, text: `Meta reconoce el número${who ? `: ${who}` : ''}` });
      } else {
        setTestResult({ ok: false, text: data.message || 'Meta no aceptó las credenciales' });
      }
    } catch {
      setTestResult({ ok: false, text: 'No se pudo conectar con el servidor' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/channels/whatsapp`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'No se pudo quitar el número');
        return;
      }
      setPhoneNumberId('');
      setDisplayPhoneNumber('');
      setWabaId('');
      setTestResult(null);
      onSaved(data.whatsapp);
      notify('success', 'Número de WhatsApp desvinculado de la clínica');
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            Número de WhatsApp de la clínica
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Datos de tu número en WhatsApp Business Cloud API (Meta Business → WhatsApp → Configuración de la
            API). Los mensajes del asistente y de recepción saldrán desde este número.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full shrink-0">
          <Lock className="w-3.5 h-3.5" />
          Solo administradores · token cifrado
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
        <label className="space-y-2 block">
          <span className="font-semibold text-slate-800 text-xs">Número visible (E.164)</span>
          <input
            className={cn(inputClass, 'font-mono tabular-nums')}
            value={displayPhoneNumber}
            onChange={(e) => setDisplayPhoneNumber(e.target.value)}
            placeholder="+525512345678"
            required
          />
        </label>
        <label className="space-y-2 block">
          <span className="font-semibold text-slate-800 text-xs">Phone Number ID</span>
          <input
            className={cn(inputClass, 'font-mono tabular-nums')}
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Ej. 109876543210987"
            inputMode="numeric"
            required
          />
        </label>
        <label className="space-y-2 block">
          <span className="font-semibold text-slate-800 text-xs">
            WhatsApp Business Account ID <span className="font-normal text-slate-400">(opcional)</span>
          </span>
          <input
            className={cn(inputClass, 'font-mono tabular-nums')}
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="Ej. 102938475610293"
            inputMode="numeric"
          />
        </label>
        <label className="space-y-2 block">
          <span className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-teal-600" />
            Token de acceso permanente
          </span>
          <input
            type="password"
            autoComplete="off"
            className={cn(inputClass, 'font-mono')}
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={status.tokenLast4 ? `•••• ${status.tokenLast4}` : 'EAAG…'}
            required={!status.tokenLast4}
          />
          {status.tokenLast4 && (
            <span className="block text-xs text-slate-400">Déjalo vacío para conservar el token guardado.</span>
          )}
        </label>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3.5 py-2 rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </p>
      )}
      {testResult && (
        <p
          role="status"
          className={cn(
            'flex items-center gap-2 text-sm px-3.5 py-2 rounded-xl border',
            testResult.ok
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-amber-800 bg-amber-50 border-amber-200'
          )}
        >
          {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {testResult.text}
        </p>
      )}

      <div className="pt-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {hasOwn &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-xs text-slate-600">
                ¿Desvincular este número?
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60"
                >
                  {busy === 'delete' ? 'Quitando…' : 'Sí, quitar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Quitar número
              </button>
            ))}
        </div>
        <div className="flex items-center gap-3 justify-end">
          {hasOwn && (
            <button
              type="button"
              onClick={test}
              disabled={busy !== null}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
            >
              {busy === 'test' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
              Probar conexión
            </button>
          )}
          <button
            type="submit"
            disabled={busy !== null}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy === 'save' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {busy === 'save' ? 'Guardando…' : 'Guardar número'}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Cuenta de Mercado Pago de la clínica: a ella llegan los anticipos de sus
 * pacientes. Sin cuenta conectada, en producción no se generan links (nunca
 * se cobra con la cuenta de la plataforma).
 */
function MercadoPagoForm({
  status,
  onSaved,
  notify,
}: {
  status: MercadoPagoStatus;
  onSaved: (status: MercadoPagoStatus) => void;
  notify: Notify;
}) {
  const hasOwn = status.source === 'CLINIC' || !status.readable;
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setError(null);
    setTestResult(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/channels/mercadopago`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: accessToken.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'No se pudo conectar la cuenta de Mercado Pago');
        return;
      }
      setAccessToken('');
      onSaved(data.mercadoPago);
      if (data.verification?.ok) {
        notify('success', `Mercado Pago conectado${data.verification.nickname ? `: ${data.verification.nickname}` : ''}`);
      } else {
        notify('error', `Guardado sin verificar: ${data.verification?.message || 'Mercado Pago no confirmó la cuenta'}`);
      }
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/channels/mercadopago/test`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setTestResult({ ok: false, text: data.error || 'No se pudo probar la conexión' });
      else if (data.ok) setTestResult({ ok: true, text: `Mercado Pago reconoce la cuenta${data.nickname ? `: ${data.nickname}` : ''}` });
      else setTestResult({ ok: false, text: data.message || 'Mercado Pago no aceptó el token' });
    } catch {
      setTestResult({ ok: false, text: 'No se pudo conectar con el servidor' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/channels/mercadopago`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'No se pudo desconectar la cuenta');
        return;
      }
      setTestResult(null);
      onSaved(data.mercadoPago);
      notify('success', 'Cuenta de Mercado Pago desconectada');
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-sky-600" />
            Cuenta de Mercado Pago de la clínica
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Los anticipos de tus pacientes se depositan directo en esta cuenta. Copia el <strong>Access Token de
            producción</strong> desde Mercado Pago → Tus integraciones → Credenciales de producción (empieza con
            APP_USR-).
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full shrink-0">
          <Lock className="w-3.5 h-3.5" />
          Solo administradores · token cifrado
        </span>
      </div>

      <label className="space-y-2 block text-sm">
        <span className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5 text-teal-600" />
          Access Token
        </span>
        <input
          type="password"
          autoComplete="off"
          className={cn(inputClass, 'font-mono')}
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={status.tokenLast4 ? `•••• ${status.tokenLast4} (escribe uno nuevo para reemplazarlo)` : 'APP_USR-…'}
          required
        />
      </label>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3.5 py-2 rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </p>
      )}
      {testResult && (
        <p
          role="status"
          className={cn(
            'flex items-center gap-2 text-sm px-3.5 py-2 rounded-xl border',
            testResult.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-800 bg-amber-50 border-amber-200'
          )}
        >
          {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {testResult.text}
        </p>
      )}

      <div className="pt-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {hasOwn &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-xs text-slate-600">
                ¿Desconectar? Ya no se generarán links de anticipo.
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-60"
                >
                  {busy === 'delete' ? 'Quitando…' : 'Sí, desconectar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Desconectar cuenta
              </button>
            ))}
        </div>
        <div className="flex items-center gap-3 justify-end">
          {hasOwn && (
            <button
              type="button"
              onClick={test}
              disabled={busy !== null}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
            >
              {busy === 'test' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
              Probar conexión
            </button>
          )}
          <button
            type="submit"
            disabled={busy !== null}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy === 'save' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {busy === 'save' ? 'Conectando…' : hasOwn ? 'Reemplazar token' : 'Conectar cuenta'}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Tarjetas de muestra para el modo Demo: se rotulan como tales, sin métricas inventadas. */
function DemoCards({ displayPhone }: { displayPhone: string }) {
  const demo: Badge = { tone: 'demo', label: 'Demo' };
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
      <ChannelCard
        icon={<PhoneCall className="w-5 h-5" />}
        iconClass="bg-blue-50 text-blue-600 border-blue-100"
        title="Llamadas telefónicas"
        badge={demo}
        headline={displayPhone}
      >
        <p>La recepcionista IA contesta llamadas, agenda y transfiere a recepción cuando hace falta.</p>
      </ChannelCard>
      <ChannelCard
        icon={<MessageSquare className="w-5 h-5" />}
        iconClass="bg-emerald-50 text-emerald-600 border-emerald-100"
        title="WhatsApp Business"
        badge={demo}
        headline={displayPhone}
      >
        <p>Cada clínica atiende desde su propio número, con botones de confirmación y reagendado.</p>
      </ChannelCard>
      <ChannelCard
        icon={<CreditCard className="w-5 h-5" />}
        iconClass="bg-sky-50 text-sky-600 border-sky-100"
        title="Mercado Pago"
        badge={demo}
        headline="Anticipos en MXN"
      >
        <p>Links de anticipo para el escudo anti-inasistencias.</p>
      </ChannelCard>
    </div>
  );
}

export function ChannelsPanel({
  isDemo,
  demoPhone,
  tenantId,
  notify,
}: {
  isDemo: boolean;
  demoPhone: string;
  tenantId?: string;
  notify: Notify;
}) {
  const [status, setStatus] = useState<ChannelsStatus | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [sessionTenantId, setSessionTenantId] = useState<string | null>(null);
  // Solo la última petición puede escribir el estado (cambio rápido de clínica).
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoadState('loading');
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/channels`);
      if (seq !== requestSeq.current) return;
      if (res.status === 403) {
        setLoadState('forbidden');
        return;
      }
      if (!res.ok) {
        setLoadState('error');
        return;
      }
      const data = (await res.json()) as ChannelsStatus;
      if (seq !== requestSeq.current) return;
      setStatus(data);
      setLoadState('ready');
    } catch {
      if (seq === requestSeq.current) setLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (isDemo) return;
    queueMicrotask(() => {
      setSessionTenantId(getSessionTenant()?.id ?? null);
      void load();
    });
  }, [isDemo, tenantId, load]);

  if (isDemo) return <DemoCards displayPhone={demoPhone} />;

  // La API siempre responde por la clínica de la sesión: si el selector apunta a
  // otra, mostrar sus canales aquí confundiría de quién es el número.
  if (sessionTenantId && tenantId && sessionTenantId !== tenantId) {
    return (
      <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex items-start gap-3 text-sm text-amber-800">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          Los canales solo se pueden consultar y configurar para la clínica con la que iniciaste sesión. Inicia sesión
          con un administrador de esta clínica para ver su número de WhatsApp.
        </p>
      </div>
    );
  }

  if (loadState === 'loading') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 flex items-center gap-3 text-sm text-slate-500">
        <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
        Consultando el estado de los canales…
      </div>
    );
  }

  if (loadState === 'forbidden') {
    return (
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex items-start gap-3 text-sm text-slate-600">
        <Lock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
        <p>
          Solo el administrador de la clínica puede ver y configurar los canales (WhatsApp, llamadas y pagos). Pídele
          que revise esta sección si los pacientes no reciben mensajes.
        </p>
      </div>
    );
  }

  if (loadState === 'error' || !status) {
    return (
      <div className="bg-red-50 rounded-2xl border border-red-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-red-700">
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          No se pudo consultar el estado de los canales.
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-lg bg-white border border-red-200 font-semibold hover:bg-red-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { whatsapp, voice, mercadoPago } = status;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        <ChannelCard
          icon={<PhoneCall className="w-5 h-5" />}
          iconClass="bg-blue-50 text-blue-600 border-blue-100"
          title="Llamadas telefónicas"
          badge={voice.configured ? { tone: 'ok', label: 'Disponible' } : { tone: 'off', label: 'No disponible aún' }}
          headline={voice.phoneE164 ? formatMexicanPhone(voice.phoneE164) : undefined}
        >
          {voice.configured ? (
            <p>
              Las llamadas entran por la cuenta de telefonía de la plataforma. Para que este número las reciba, debe
              estar dado de alta en esa cuenta; escríbenos para activarlo.
            </p>
          ) : (
            <p>La plataforma todavía no tiene telefonía configurada en este servidor.</p>
          )}
        </ChannelCard>

        <ChannelCard
          icon={<MessageSquare className="w-5 h-5" />}
          iconClass="bg-emerald-50 text-emerald-600 border-emerald-100"
          title="WhatsApp Business"
          badge={whatsappBadge(whatsapp)}
          headline={
            whatsapp.source === 'CLINIC' && whatsapp.displayPhoneNumber
              ? formatMexicanPhone(whatsapp.displayPhoneNumber)
              : undefined
          }
        >
          {whatsapp.source === 'CLINIC' && (
            <p>
              Phone Number ID <span className="font-mono text-slate-700">{whatsapp.phoneNumberId}</span> · token
              terminado en <span className="font-mono text-slate-700">{whatsapp.tokenLast4 ?? '—'}</span>
            </p>
          )}
          {!whatsapp.readable && (
            <p className="text-amber-700">
              Hay credenciales guardadas pero el servidor no puede leerlas. Vuelve a capturar el token.
            </p>
          )}
          {whatsapp.source === 'PLATFORM' && whatsapp.readable && (
            <p className="text-amber-700">
              Tus pacientes reciben mensajes desde el número compartido de la plataforma, no el de tu clínica.
              Configura tu número abajo.
            </p>
          )}
          {whatsapp.source === 'NONE' && whatsapp.readable && (
            <p className="text-amber-700">
              Sin número configurado: los mensajes de WhatsApp no se están enviando a los pacientes.
            </p>
          )}
        </ChannelCard>

        <ChannelCard
          icon={<CreditCard className="w-5 h-5" />}
          iconClass="bg-sky-50 text-sky-600 border-sky-100"
          title="Mercado Pago"
          badge={
            mercadoPago.source === 'CLINIC'
              ? mercadoPago.testMode
                ? { tone: 'warn', label: 'Modo prueba' }
                : { tone: 'ok', label: 'Cuenta propia' }
              : !mercadoPago.readable
                ? { tone: 'warn', label: 'Credenciales ilegibles' }
                : { tone: 'off', label: 'Sin conectar' }
          }
          headline={mercadoPago.source === 'CLINIC' ? mercadoPago.nickname ?? undefined : undefined}
        >
          {mercadoPago.source === 'CLINIC' ? (
            <p>
              Los anticipos se depositan en tu cuenta · token terminado en{' '}
              <span className="font-mono text-slate-700">{mercadoPago.tokenLast4 ?? '—'}</span>
              {mercadoPago.testMode && ' · token de prueba: no cobra dinero real'}
            </p>
          ) : (
            <p className="text-amber-700">
              Sin cuenta conectada no se generan links de anticipo: recepción tendrá que cobrarlos por su cuenta.
              Conéctala abajo.
            </p>
          )}
        </ChannelCard>
      </div>

      {/* La API solo responde el estado al ADMIN, así que si llegamos aquí puede editar. */}
      <WhatsAppForm
        key={`${tenantId ?? ''}:${whatsapp.phoneNumberId ?? 'nuevo'}`}
        status={whatsapp}
        notify={notify}
        onSaved={(next) => setStatus((prev) => (prev ? { ...prev, whatsapp: next } : prev))}
      />

      <MercadoPagoForm
        key={`${tenantId ?? ''}:mp:${mercadoPago.userId ?? 'nuevo'}`}
        status={mercadoPago}
        notify={notify}
        onSaved={(next) => setStatus((prev) => (prev ? { ...prev, mercadoPago: next } : prev))}
      />
    </div>
  );
}
