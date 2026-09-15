'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MessageSquare, Plus, Send } from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';
import { API_BASE_URL, apiFetch } from '../../../lib/api';
import { formatMexicoCityTime } from '../../../lib/format';
import { usePolling } from '../../../hooks/usePolling';
import { ConversationList } from '../../../components/dashboard/inbox/ConversationList';
import { ChatHeader } from '../../../components/dashboard/inbox/ChatHeader';
import { CallRecordingPlayer } from '../../../components/dashboard/inbox/CallRecordingPlayer';
import { PatientSidebar } from '../../../components/dashboard/inbox/PatientSidebar';
import type { ConversationItem, MessageItem, ApiConversationResponse, ApiMessageResponse } from './types';
import { DEMO_CONVERSATIONS, DEMO_MESSAGES } from './demo';

export default function OmnichannelInboxPage() {
  const { mode, activeTenant, activeTenantId, seedTenantData } = useTenant();

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

          return {
            id: c.id,
            patientName: c.patient?.fullName || 'Paciente WhatsApp',
            phone: c.patient?.phoneE164 || c.externalChannelId || '',
            channel: c.channel || 'WHATSAPP',
            lastMessage: lastMsg,
            lastTime: timeStr,
            unreadCount: 0,
            isHandedOverToHuman: Boolean(c.isHandedOverToHuman),
            status: c.isHandedOverToHuman
              ? 'Modo Humano Activo'
              : latestAppt
              ? 'Cita Confirmada'
              : 'Atendido por IA',
            isUrgent:
              lastMsg.toLowerCase().includes('urgenc') ||
              lastMsg.toLowerCase().includes('dolor') ||
              lastMsg.toLowerCase().includes('muela'),
            appointment: apptData,
          };
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
          const timeStr = new Date(m.createdAt).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Mexico_City',
          });
          let senderName = 'Paciente';
          if (m.senderRole === 'AI_AGENT') senderName = 'Asistente IA (Gemini 2.5)';
          else if (m.senderRole === 'HUMAN_STAFF') senderName = 'Recepcionista (Recepción)';
          else senderName = patientName;

          return {
            id: m.id,
            sender: m.senderRole,
            senderName,
            content: m.content,
            time: timeStr,
          };
        });

        setLiveMessages((prev) => ({
          ...prev,
          [convId]: mappedMsgs,
        }));
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

  const toggleTakeover = async () => {
    if (!activeConv) return;
    const nextState = !activeConv.isHandedOverToHuman;

    if (mode === 'demo') {
      setDemoConversations((prev) =>
        prev.map((c) =>
          c.id === activeConv.id
            ? {
                ...c,
                isHandedOverToHuman: nextState,
                status: nextState
                  ? 'Modo Humano Activo'
                  : c.appointment
                  ? 'Cita Confirmada'
                  : 'Atendido por IA',
              }
            : c
        )
      );
      return;
    }

    setLiveConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId
          ? {
              ...c,
              isHandedOverToHuman: nextState,
              status: nextState
                ? 'Modo Humano Activo'
                : c.appointment
                ? 'Cita Confirmada'
                : 'Atendido por IA',
            }
          : c
      )
    );

    try {
      await apiFetch(`${API_BASE_URL}/api/conversations/${activeConvId}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHandedOver: nextState }),
      });
    } catch (err) {
      console.error('Error toggling takeover:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConv) return;

    const textToSend = inputText.trim();
    setInputText('');

    const newMsg: MessageItem = {
      id: Date.now().toString(),
      sender: 'HUMAN_STAFF',
      senderName: 'Recepción',
      content: textToSend,
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    };

    if (mode === 'demo') {
      setDemoMessages((prev) => ({
        ...prev,
        [activeConv.id]: [...(prev[activeConv.id] || []), newMsg],
      }));
      return;
    }

    setLiveMessages((prev) => ({
      ...prev,
      [activeConvId]: [...(prev[activeConvId] || []), newMsg],
    }));

    try {
      await apiFetch(`${API_BASE_URL}/api/conversations/${activeConvId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend, staffName: 'Recepción' }),
      });
    } catch (err) {
      console.error('Error sending reply via API:', err);
    }
  };

  const currentMessages = useMemo(() => {
    if (!activeConv) return [];
    if (mode === 'demo') {
      return demoMessages[activeConv.id] || [];
    }
    return liveMessages[activeConv.id] || [];
  }, [mode, activeConv, liveMessages, demoMessages]);

  const handleSeedFromInbox = async () => {
    if (!activeTenantId) return;
    setIsSeeding(true);
    try {
      await seedTenantData(activeTenantId);
      await refreshConversations();
    } catch (e) {
      console.error('Error seeding data:', e);
    } finally {
      setIsSeeding(false);
    }
  };

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
        onSeed={handleSeedFromInbox}
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
                        : isAI
                        ? 'bg-teal-600 text-white rounded-tr-sm'
                        : 'bg-amber-600 text-white rounded-tr-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
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
            {activeTenantId && (
              <button
                onClick={handleSeedFromInbox}
                disabled={isSeeding}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {isSeeding ? 'Generando datos...' : 'Sembrar Pacientes & Chats Demo'}
              </button>
            )}
          </div>
        </div>
      )}

      {activeConv && <PatientSidebar activeConv={activeConv} />}
    </div>
  );
}
