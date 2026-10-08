'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertCircle, CheckCircle2, MessageSquare, Plus, Send, Sparkles, X } from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';
import { API_BASE_URL, apiFetch, getUser } from '../../../lib/api';
import { formatMexicoCityTime } from '../../../lib/format';
import { usePolling } from '../../../hooks/usePolling';
import { ConversationList } from '../../../components/dashboard/inbox/ConversationList';
import { ChatHeader } from '../../../components/dashboard/inbox/ChatHeader';
import { CallRecordingPlayer } from '../../../components/dashboard/inbox/CallRecordingPlayer';
import { PatientSidebar } from '../../../components/dashboard/inbox/PatientSidebar';
import type { ConversationItem, MessageItem, ApiConversationResponse, ApiMessageResponse } from './types';
import { DEMO_CONVERSATIONS, DEMO_MESSAGES } from './demo';

type InboxToast = { message: string; tone: 'success' | 'error' };

// No codicioso: admite nombres con corchetes ("Ana [Recepción]") y corta en el
// primer "]: " que cierra la firma.
const STAFF_PREFIX = /^\[([^\n]{1,200}?)\]: /;

/**
 * La API guarda la respuesta del personal como "[Nombre]: texto" (al paciente
 * le llega solo el texto). Aquí se separa para mostrar quién respondió. Solo
 * se aplica a mensajes HUMAN_STAFF: un paciente puede escribir "[Urgente]: …".
 */
function splitStaffSignature(content: string): { name: string | null; text: string } {
  const match = content.match(STAFF_PREFIX);
  if (!match) return { name: null, text: content };
  return { name: match[1], text: content.slice(match[0].length) };
}

function mexicoCityClock(date: Date): string {
  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });
}

function withTakeoverState(c: ConversationItem, isHandedOverToHuman: boolean): ConversationItem {
  return {
    ...c,
    isHandedOverToHuman,
    status: isHandedOverToHuman ? 'Modo Humano Activo' : c.appointment ? 'Cita Confirmada' : 'Atendido por IA',
  };
}

export default function OmnichannelInboxPage() {
  const { mode, setMode, activeTenant, activeTenantId, seedTenantData, isPlatformAdmin, dataVersion } =
    useTenant();
  const [toast, setToast] = useState<InboxToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, tone: InboxToast['tone'] = 'success') => {
    setToast({ message, tone });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), tone === 'error' ? 7000 : 3500);
  }, []);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );
  // Conversaciones con un cambio de takeover en vuelo: el sondeo no debe
  // pisar el estado local con una respuesta que salió antes del cambio.
  const pendingTakeoverRef = useRef<Map<string, boolean>>(new Map());
  const [takeoverBusyId, setTakeoverBusyId] = useState<string | null>(null);
  // Respuestas aún sin guardar en la API (enviando) o rechazadas por ella.
  // Viven aparte porque el sondeo reemplaza la lista de mensajes del servidor.
  const [localOutbox, setLocalOutbox] = useState<Record<string, MessageItem[]>>({});

  const [liveConversations, setLiveConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('demo-conv-1');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(42); // 42s actuales
  const [audioDuration] = useState(92); // 1m 32s = 92s
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Record<string, MessageItem[]>>({});
  // La demo vive en estado de React, no en las constantes del módulo: así los
  // cambios se reflejan al instante y no se filtran entre navegaciones.
  const [demoConversations, setDemoConversations] = useState<ConversationItem[]>(() =>
    DEMO_CONVERSATIONS.map((c) => ({ ...c }))
  );
  const [demoMessages, setDemoMessages] = useState<Record<string, MessageItem[]>>(() =>
    Object.fromEntries(Object.entries(DEMO_MESSAGES).map(([id, msgs]) => [id, [...msgs]]))
  );
  const [isSeeding, setIsSeeding] = useState(false);

  // Bajo 768 px la bandeja muestra la lista o el chat, nunca ambos a la vez.
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const chatHeadingRef = useRef<HTMLHeadingElement>(null);

  const openConversation = (id: string) => {
    setActiveConvId(id);
    setMobileView('chat');
    // En móvil el foco pasa al encabezado del chat para anunciar el cambio de vista.
    if (window.matchMedia('(max-width: 767px)').matches) {
      requestAnimationFrame(() => chatHeadingRef.current?.focus());
    }
  };

  const backToList = () => {
    setMobileView('list');
    requestAnimationFrame(() => document.getElementById(`conv-${activeConvId}`)?.focus());
  };

  // Simulación de avance de la grabación de llamada
  useEffect(() => {
    if (!isPlayingAudio) return;
    const interval = setInterval(() => {
      setAudioProgress((prev) => {
        if (prev >= audioDuration) {
          setIsPlayingAudio(false);
          return 0;
        }
        return prev + 1;
      });
    }, 1000 / playbackSpeed);
    return () => clearInterval(interval);
  }, [isPlayingAudio, playbackSpeed, audioDuration]);

  // Determinar conversaciones activas según el modo seleccionado
  const conversations = useMemo(() => {
    if (mode === 'demo') {
      return demoConversations;
    }
    return liveConversations;
  }, [mode, liveConversations, demoConversations]);

  // Filtrar por búsqueda
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.patientName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  // Carga y sondeo periódico de conversaciones en vivo desde el backend Fastify
  const fetchLiveConversations = useCallback(async (signal?: AbortSignal) => {
    if (mode === 'demo') return;
    // Sin clínica activa no se consulta: la API rechaza peticiones sin tenant.
    if (!activeTenantId) {
      setLiveConversations([]);
      setIsLiveConnected(false);
      return;
    }
    try {
      const res = await apiFetch(
        `${API_BASE_URL}/api/conversations?tenantId=${activeTenantId}`,
        { signal }
      );
      if (!res.ok) {
        setIsLiveConnected(false);
        throw new Error(`La API respondió ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setIsLiveConnected(true);
        const mappedConvs: ConversationItem[] = (data as ApiConversationResponse[]).map((c) => {
          const lastMsg = c.messages?.[0]?.content || 'Sin mensajes';
          const lastDate = c.lastMessageAt ? new Date(c.lastMessageAt) : new Date(c.createdAt);
          const timeStr = formatMexicoCityTime(lastDate);

          const latestAppt = c.patient?.appointments?.[0];
          let apptData = null;
          if (latestAppt) {
            const startD = new Date(latestAppt.startTime);
            const apptTimeStr = startD.toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Mexico_City',
            });

            apptData = {
              serviceName: latestAppt.service?.name || 'Consulta General',
              doctorName: latestAppt.doctor?.name || 'Especialista',
              startTime: apptTimeStr,
              status: latestAppt.status,
              depositAmountMxn: latestAppt.depositAmountMxn,
              paymentStatus: latestAppt.paymentStatus,
              symptoms: latestAppt.symptoms,
            };
          }

          const pending = pendingTakeoverRef.current.get(c.id);
          const handedOver = pending ?? Boolean(c.isHandedOverToHuman);

          return withTakeoverState(
            {
              id: c.id,
              patientName: c.patient?.fullName || 'Paciente WhatsApp',
              phone: c.patient?.phoneE164 || c.externalChannelId || '',
              channel: c.channel || 'WHATSAPP',
              lastMessage:
                c.messages?.[0]?.senderRole === 'HUMAN_STAFF' ? splitStaffSignature(lastMsg).text : lastMsg,
              lastTime: timeStr,
              unreadCount: 0,
              isHandedOverToHuman: handedOver,
              status: '',
              isUrgent:
                lastMsg.toLowerCase().includes('urgenc') ||
                lastMsg.toLowerCase().includes('dolor') ||
                lastMsg.toLowerCase().includes('muela'),
              appointment: apptData,
            },
            handedOver
          );
        });

        setLiveConversations(mappedConvs);
        setActiveConvId((current) => {
          if (mappedConvs.length === 0) return '';
          const exists = mappedConvs.some((c) => c.id === current);
          return exists ? current : mappedConvs[0].id;
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setIsLiveConnected(false);
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[inbox] no se pudieron cargar las conversaciones:', error);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }, [mode, activeTenantId]);

  const fetchLiveMessages = useCallback(async (convId: string, patientName: string, signal?: AbortSignal) => {
    if (!convId || convId.startsWith('demo-')) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/conversations/${convId}/messages`, { signal });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const mappedMsgs: MessageItem[] = (data as ApiMessageResponse[]).map((m) => {
          let senderName = patientName;
          let content = m.content;
          if (m.senderRole === 'AI_AGENT') {
            senderName = 'Asistente IA (DeepSeek)';
          } else if (m.senderRole === 'HUMAN_STAFF') {
            const signed = splitStaffSignature(m.content);
            senderName = signed.name || 'Recepción';
            content = signed.text;
          }

          return {
            id: m.id,
            sender: m.senderRole,
            senderName,
            content,
            time: mexicoCityClock(new Date(m.createdAt)),
            deliveryStatus: m.deliveryStatus ?? null,
            createdAtMs: new Date(m.createdAt).getTime(),
          };
        });

        setLiveMessages((prev) => ({
          ...prev,
          [convId]: mappedMsgs,
        }));
        // Las copias locales que el servidor ya devolvió dejan de hacer falta.
        const serverIds = new Set(mappedMsgs.map((m) => m.id));
        setLocalOutbox((prev) => {
          const local = prev[convId];
          if (!local || !local.some((m) => serverIds.has(m.id))) return prev;
          return { ...prev, [convId]: local.filter((m) => !serverIds.has(m.id)) };
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      // Si el mensaje persiste, usePolling aplicará backoff con el error propagado.
      throw error instanceof Error ? error : new Error(String(error));
    }
  }, []);

  // Sincronizar selección de conversación activa al cambiar modo
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === 'demo') {
      setActiveConvId('demo-conv-1');
    }
  }

  // Sondeo resiliente de conversaciones: pausa con la pestaña oculta y aplica backoff.
  const pollConversations = useCallback(
    (signal: AbortSignal) => fetchLiveConversations(signal),
    [fetchLiveConversations]
  );
  const { lastError: conversationsError, refresh: refreshConversations } = usePolling(
    pollConversations,
    { intervalMs: 3000, enabled: mode === 'live' && Boolean(activeTenantId) }
  );

  const activeConv = useMemo(() => {
    if (conversations.length === 0) return null;
    return conversations.find((c) => c.id === activeConvId) || conversations[0];
  }, [conversations, activeConvId]);

  // Sin conversación activa no hay chat que mostrar: la vista móvil vuelve a la lista.
  const showChat = mobileView === 'chat' && Boolean(activeConv);

  // Sondeo resiliente de mensajes para la conversación activa.
  const activeConvIdForPoll = activeConv?.id ?? '';
  const activeConvNameForPoll = activeConv?.patientName ?? '';
  const pollMessages = useCallback(
    (signal: AbortSignal) =>
      fetchLiveMessages(activeConvIdForPoll, activeConvNameForPoll, signal),
    [activeConvIdForPoll, activeConvNameForPoll, fetchLiveMessages]
  );
  usePolling(pollMessages, {
    intervalMs: 2000,
    enabled: mode === 'live' && Boolean(activeConvIdForPoll) && !activeConvIdForPoll.startsWith('demo-'),
  });

  // Tras sembrar o limpiar desde la barra superior, la bandeja se recarga sin
  // esperar al siguiente ciclo de sondeo (y sin recargar la página).
  const [seenDataVersion, setSeenDataVersion] = useState(dataVersion);
  if (dataVersion !== seenDataVersion) {
    setSeenDataVersion(dataVersion);
    setLiveMessages({});
    setLocalOutbox({});
  }
  // El ref evita refrescar de más cuando solo cambia la identidad de
  // `refreshConversations` (cambio de modo o de clínica).
  const handledDataVersionRef = useRef(dataVersion);
  useEffect(() => {
    if (dataVersion === handledDataVersionRef.current) return;
    handledDataVersionRef.current = dataVersion;
    refreshConversations();
  }, [dataVersion, refreshConversations]);

  const toggleTakeover = async () => {
    if (!activeConv) return;
    const convId = activeConv.id;
    const nextState = !activeConv.isHandedOverToHuman;

    if (mode === 'demo') {
      setDemoConversations((prev) =>
        prev.map((c) => (c.id === convId ? withTakeoverState(c, nextState) : c))
      );
      return;
    }

    if (takeoverBusyId) return;
    setTakeoverBusyId(convId);
    pendingTakeoverRef.current.set(convId, nextState);
    // Optimista: botón, banner y "Estado:" cambian al instante.
    setLiveConversations((prev) =>
      prev.map((c) => (c.id === convId ? withTakeoverState(c, nextState) : c))
    );

    let ok = false;
    let errorMessage = '';
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/conversations/${convId}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHandedOver: nextState }),
      });
      ok = res.ok;
      if (!ok) {
        const body = await res.json().catch(() => ({}));
        errorMessage = body?.error || `La API respondió ${res.status}`;
      }
    } catch {
      errorMessage = 'Sin conexión con la API';
    }

    pendingTakeoverRef.current.delete(convId);
    setTakeoverBusyId(null);

    if (ok) {
      showToast(
        nextState
          ? 'Tomaste el control: la IA no responderá en este chat'
          : 'La IA vuelve a responder este chat automáticamente'
      );
      return;
    }

    // Revertir: la IA sigue en el estado anterior en el servidor.
    setLiveConversations((prev) =>
      prev.map((c) => (c.id === convId ? withTakeoverState(c, !nextState) : c))
    );
    showToast(
      `${nextState ? 'No se pudo tomar el control' : 'No se pudo devolver el chat a la IA'}: ${errorMessage}`,
      'error'
    );
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConv) return;

    const convId = activeConv.id;
    const textToSend = inputText.trim();
    const staffName = getUser()?.name?.trim() || 'Recepción';
    setInputText('');

    const newMsg: MessageItem = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'HUMAN_STAFF',
      senderName: staffName,
      content: textToSend,
      time: mexicoCityClock(new Date()),
      deliveryStatus: mode === 'demo' ? null : 'SENDING',
      createdAtMs: Date.now(),
    };

    if (mode === 'demo') {
      setDemoMessages((prev) => ({
        ...prev,
        [convId]: [...(prev[convId] || []), newMsg],
      }));
      return;
    }

    const updateLocal = (patch: Partial<MessageItem>) =>
      setLocalOutbox((prev) => ({
        ...prev,
        [convId]: (prev[convId] || []).map((m) => (m.id === newMsg.id ? { ...m, ...patch } : m)),
      }));
    setLocalOutbox((prev) => ({ ...prev, [convId]: [...(prev[convId] || []), newMsg] }));

    let res: Response | null = null;
    try {
      res = await apiFetch(`${API_BASE_URL}/api/conversations/${convId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend, staffName }),
      });
    } catch {
      res = null;
    }

    if (res && res.ok) {
      const saved: ApiMessageResponse | null = await res.json().catch(() => null);
      if (saved?.id) {
        // La copia local toma el id del servidor y se queda hasta que el
        // sondeo la traiga: así no desaparece si un sondeo que salió antes de
        // guardarla llega después, ni se duplica cuando llega.
        updateLocal({
          id: saved.id,
          time: mexicoCityClock(new Date(saved.createdAt)),
          createdAtMs: new Date(saved.createdAt).getTime(),
          deliveryStatus: saved.deliveryStatus ?? null,
        });
      } else {
        updateLocal({ deliveryStatus: null });
      }
      if (saved?.deliveryStatus === 'FAILED') {
        showToast('El mensaje se guardó, pero WhatsApp no lo entregó al paciente', 'error');
      } else {
        showToast('Respuesta enviada');
      }
      return;
    }

    if (res && res.status < 500) {
      // 4xx: la API la rechazó antes de guardarla; el paciente no la recibió.
      const body = await res.json().catch(() => ({}));
      updateLocal({ deliveryStatus: 'NOT_SAVED' });
      // Si no escribió otra cosa, se le devuelve el texto para reintentar.
      setInputText((current) => (current ? current : textToSend));
      showToast(`No se envió la respuesta: ${body?.error || `la API respondió ${res.status}`}`, 'error');
      return;
    }

    // Error de red o 5xx: el servidor pudo haberla guardado y enviado. No se
    // devuelve el texto para no provocar un doble envío; si llegó, el sondeo
    // la mostrará y esta copia desaparece.
    updateLocal({ deliveryStatus: 'UNCONFIRMED' });
    showToast(
      'No se pudo confirmar el envío. Espera unos segundos: si la respuesta no aparece, vuelve a enviarla.',
      'error'
    );
  };

  const currentMessages = useMemo(() => {
    if (!activeConv) return [];
    if (mode === 'demo') {
      return demoMessages[activeConv.id] || [];
    }
    const server = liveMessages[activeConv.id] || [];
    const serverIds = new Set(server.map((m) => m.id));
    const local = (localOutbox[activeConv.id] || []).filter((m) => {
      if (serverIds.has(m.id)) return false;
      if (m.deliveryStatus !== 'SENDING' && m.deliveryStatus !== 'UNCONFIRMED') return true;
      // Aún sin id del servidor: si el sondeo ya trajo una respuesta del
      // personal con el mismo texto, enviada después, es esta misma.
      const sentAt = (m.createdAtMs ?? 0) - 10_000;
      return !server.some(
        (s) => s.sender === 'HUMAN_STAFF' && s.content === m.content && (s.createdAtMs ?? 0) >= sentAt
      );
    });
    return [...server, ...local];
  }, [mode, activeConv, liveMessages, demoMessages, localOutbox]);

  const handleSeedFromInbox = async () => {
    if (!activeTenantId || isSeeding) return;
    setIsSeeding(true);
    try {
      // Si sale bien, `dataVersion` sube y la bandeja se recarga sola.
      const result = await seedTenantData(activeTenantId);
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const showDemo = () => setMode('demo');

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-slate-100">
      <ConversationList
        mode={mode}
        isLiveConnected={isLiveConnected}
        conversationsError={conversationsError}
        onRetryConnection={refreshConversations}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        conversations={filteredConversations}
        activeConvId={activeConvId}
        onOpenConversation={openConversation}
        activeTenantId={activeTenantId}
        isSeeding={isSeeding}
        canSeed={isPlatformAdmin}
        onSeed={handleSeedFromInbox}
        onShowDemo={showDemo}
        hidden={showChat}
      />

      {/* Columna Central: Conversación Activa (en móvil, solo al abrir un chat) */}
      {activeConv ? (
        // Contenedor de consultas: el ancho del chat depende de la barra lateral,
        // la lista y la ficha, no del viewport. Su encabezado se adapta a él.
        <div
          className={`${
            showChat ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col bg-slate-50 border-r border-slate-200 min-w-0 [container-type:inline-size]`}
        >
          <ChatHeader
            activeConv={activeConv}
            chatHeadingRef={chatHeadingRef}
            onBack={backToList}
            onToggleTakeover={toggleTakeover}
            isTogglingTakeover={takeoverBusyId === activeConv.id}
          />

          {/* Reproductor de Audio Twilio con Waveform Dinámico */}
          {activeConv.channel === 'PHONE_CALL' && (
            <CallRecordingPlayer
              isPlaying={isPlayingAudio}
              setIsPlaying={setIsPlayingAudio}
              progress={audioProgress}
              setProgress={setAudioProgress}
              duration={audioDuration}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
            />
          )}

          {/* Mensajes del Thread */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
            {currentMessages.map((msg) => {
              const isPatient = msg.sender === 'PATIENT';
              const isAI = msg.sender === 'AI_AGENT';
              const isUndelivered =
                msg.deliveryStatus === 'FAILED' || msg.deliveryStatus === 'NOT_SAVED';

              return (
                <div key={msg.id} className={`flex flex-col ${isPatient ? 'items-start' : 'items-end'}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-slate-500">{msg.senderName}</span>
                    <span className="text-[10px] text-slate-400">{msg.time}</span>
                  </div>

                  <div
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      isPatient
                        ? 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-sm'
                        : isUndelivered
                        ? 'bg-white text-slate-800 border-2 border-red-300 rounded-tr-sm'
                        : isAI
                        ? 'bg-teal-600 text-white rounded-tr-sm'
                        : 'bg-amber-600 text-white rounded-tr-sm'
                    } ${msg.deliveryStatus === 'SENDING' ? 'opacity-70' : ''}`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                  {isUndelivered && (
                    <span className="mt-1 px-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                        {msg.deliveryStatus === 'NOT_SAVED'
                          ? 'No se envió: la API rechazó el mensaje'
                          : 'No se entregó por WhatsApp'}
                      </span>
                    </span>
                  )}
                  {msg.deliveryStatus === 'SENDING' && (
                    <span className="mt-1 px-1 text-[10px] text-slate-400">Enviando…</span>
                  )}
                  {msg.deliveryStatus === 'UNCONFIRMED' && (
                    <span className="mt-1 px-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        Envío sin confirmar: revisa antes de reenviar
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Barra Inferior de Entrada */}
          <div className="p-3 sm:p-4 bg-white border-t border-slate-200">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              {/* 16 px en móvil: con menos, iOS hace zoom al enfocar el campo. */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                aria-label={`Respuesta manual para ${activeConv.patientName}`}
                placeholder={`Responder a ${activeConv.patientName}...`}
                className="flex-1 min-w-0 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:outline-none focus:border-teal-500 transition-colors"
              />
              <button
                type="submit"
                aria-label="Enviar respuesta"
                className="min-h-[44px] px-4 sm:px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center gap-1.5 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </form>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[10px] text-slate-400">Atajos rápidos:</span>
              <button
                type="button"
                onClick={() =>
                  setInputText(
                    `Estamos en ${activeTenant?.address || 'Av. Horacio 1520, Polanco'} con estacionamiento disponible.`
                  )
                }
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 sm:py-0.5 rounded transition-colors"
              >
                📍 Enviar Ubicación
              </button>
              <button
                type="button"
                onClick={() =>
                  setInputText('Te comparto el enlace seguro para apartar tu cita: https://mpago.li/demo')
                }
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 sm:py-0.5 rounded transition-colors"
              >
                💳 Enlace Mercado Pago
              </button>
              <button
                type="button"
                onClick={() =>
                  setInputText('¿Deseas que confirmemos tu asistencia ahora mismo para apartar el consultorio?')
                }
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 sm:py-0.5 rounded transition-colors"
              >
                ✅ Confirmar Asistencia
              </button>
            </div>
          </div>
        </div>
      ) : (
        // En móvil la lista ya muestra su propio estado vacío con la acción de sembrar datos.
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-slate-50 p-8 text-center">
          <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mb-4 ring-8 ring-teal-50/50">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1">
            Bandeja vacía en {activeTenant?.name || 'la clínica'}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
            Aún no hay mensajes entrantes para este cliente. Cada vez que un paciente envíe un
            WhatsApp o llame al número oficial, la IA lo atenderá en tiempo real y el historial se reflejará aquí.
          </p>
          <div className="flex items-center gap-3">
            {activeTenantId && isPlatformAdmin ? (
              <button
                onClick={handleSeedFromInbox}
                disabled={isSeeding}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-2 disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                {isSeeding ? 'Generando datos...' : 'Sembrar Pacientes & Chats Demo'}
              </button>
            ) : (
              <button
                onClick={showDemo}
                className="px-4 py-2 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Ver un ejemplo en Modo Demo
              </button>
            )}
          </div>
        </div>
      )}

      {activeConv && <PatientSidebar activeConv={activeConv} />}

      {toast && (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm z-50 flex items-start gap-2 rounded-xl px-4 py-3 text-xs font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 ${
            toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-900'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Cerrar aviso"
            className="text-white/70 hover:text-white shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
