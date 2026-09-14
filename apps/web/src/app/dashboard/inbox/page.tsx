'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  PhoneCall,
  Instagram,
  Bot,
  User,
  Send,
  ShieldAlert,
  Play,
  Pause,
  Clock,
  Sparkles,
  Search,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Plus,
  ArrowRight,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useTenant } from '../../../context/TenantContext';
import { API_BASE_URL, apiFetch } from '../../../lib/api';
import { formatMexicanPhone, formatMexicoCityTime } from '../../../lib/format';
import { usePolling } from '../../../hooks/usePolling';

interface ConversationItem {
  id: string;
  patientName: string;
  phone: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'PHONE_CALL' | 'MESSENGER';
  lastMessage: string;
  lastTime: string;
  unreadCount: number;
  isUrgent?: boolean;
  isHandedOverToHuman: boolean;
  status: string;
  appointment?: {
    serviceName: string;
    doctorName: string;
    startTime: string;
    status: string;
    depositAmountMxn?: number | null;
    paymentStatus?: string;
    symptoms?: string | null;
  } | null;
}

interface MessageItem {
  id: string;
  sender: 'PATIENT' | 'AI_AGENT' | 'HUMAN_STAFF';
  senderName: string;
  content: string;
  time: string;
  audioDuration?: string;
}

const DEMO_CONVERSATIONS: ConversationItem[] = [
  {
    id: 'demo-conv-1',
    patientName: 'Mariana Hernández',
    phone: '+52 (55) 1234-9988',
    channel: 'WHATSAPP',
    lastMessage: 'Perfecto, acabo de pagar el anticipo de $200 por Mercado Pago. ¡Nos vemos hoy!',
    lastTime: '16:15',
    unreadCount: 0,
    isHandedOverToHuman: false,
    status: 'Cita Confirmada',
    appointment: {
      serviceName: 'Limpieza Dental con Ultrasonido',
      doctorName: 'Dra. Sofía Silva',
      startTime: 'Hoy • 4:00 PM (45 min)',
      status: 'CONFIRMED',
      depositAmountMxn: 200,
      paymentStatus: 'DEPOSIT_PAID',
      symptoms: 'Limpieza dental semestral de rutina',
    },
  },
  {
    id: 'demo-conv-2',
    patientName: 'Fernando Rivas',
    phone: '+52 (55) 7766-5544',
    channel: 'PHONE_CALL',
    lastMessage: 'Grabación de llamada (1m 32s): Dolor agudo en tercer molar inferior.',
    lastTime: '15:40',
    unreadCount: 1,
    isUrgent: true,
    isHandedOverToHuman: false,
    status: '🚨 Urgencia Prioritaria',
    appointment: {
      serviceName: 'Extracción Muela del Juicio (Urgencia)',
      doctorName: 'Dr. Roberto Mendoza',
      startTime: 'Hoy • 6:30 PM (60 min)',
      status: 'CONFIRMED',
      depositAmountMxn: 500,
      paymentStatus: 'DEPOSIT_PAID',
      symptoms: 'Dolor punzante e inflamación en tercer molar derecho',
    },
  },
  {
    id: 'demo-conv-3',
    patientName: 'Sofía Morales',
    phone: '+52 (81) 8299-1122',
    channel: 'INSTAGRAM',
    lastMessage: 'Hola, ¿qué costo tiene el diseño de sonrisa con carillas de porcelana?',
    lastTime: '14:20',
    unreadCount: 0,
    isHandedOverToHuman: false,
    status: 'Cotización Entregada',
    appointment: {
      serviceName: 'Valoración Estética y Carillas',
      doctorName: 'Dra. María Fernández',
      startTime: 'Mañana • 11:00 AM (45 min)',
      status: 'PENDING',
      depositAmountMxn: 300,
      paymentStatus: 'PENDING',
      symptoms: 'Interés en carillas cerámicas superiores',
    },
  },
];

const DEMO_MESSAGES: Record<string, MessageItem[]> = {
  'demo-conv-1': [
    {
      id: 'm1-1',
      sender: 'PATIENT',
      senderName: 'Mariana Hernández',
      content: 'Hola buenas tardes, ¿cuánto cuesta la limpieza dental y en qué horarios tienen libre hoy?',
      time: '16:05',
    },
    {
      id: 'm1-2',
      sender: 'AI_AGENT',
      senderName: 'Asistente IA (Gemini 2.5)',
      content:
        '¡Hola Mariana! Con mucho gusto. La Limpieza Dental con Ultrasonido cuesta $850 MXN (45 minutos). Para hoy contamos con disponibilidad a las 4:00 PM y a las 5:30 PM con la Dra. Sofía Silva. ¿Cuál te acomoda mejor?',
      time: '16:05',
    },
    {
      id: 'm1-3',
      sender: 'PATIENT',
      senderName: 'Mariana Hernández',
      content: 'A las 4:00 PM me queda excelente. ¿Cómo aparto mi lugar?',
      time: '16:08',
    },
    {
      id: 'm1-4',
      sender: 'AI_AGENT',
      senderName: 'Asistente IA (Gemini 2.5)',
      content:
        '¡Perfecto Mariana! Tu cita quedó agendada para hoy a las 4:00 PM. Para congelar el horario y evitar inasistencias requerimos un anticipo deducible de $200 MXN. Puedes pagar aquí de forma segura con Mercado Pago: https://mpago.li/dental-sonrisas',
      time: '16:09',
    },
    {
      id: 'm1-5',
      sender: 'PATIENT',
      senderName: 'Mariana Hernández',
      content: 'Perfecto, acabo de pagar el anticipo de $200 por Mercado Pago. ¡Nos vemos hoy!',
      time: '16:15',
    },
  ],
  'demo-conv-2': [
    {
      id: 'm2-1',
      sender: 'AI_AGENT',
      senderName: 'Llamada Entrante Twilio (+52)',
      content: 'Llamada contestada en 540ms. Audio procesado con reconocimiento de voz en tiempo real.',
      time: '15:38',
    },
    {
      id: 'm2-2',
      sender: 'PATIENT',
      senderName: 'Fernando Rivas (Voz)',
      content:
        'Buenas tardes, disculpen la molestia pero tengo un dolor fuertísimo en la muela de abajo que no me deja ni masticar desde ayer en la noche. ¿Tienen algún espacio de urgencia?',
      time: '15:39',
    },
    {
      id: 'm2-3',
      sender: 'AI_AGENT',
      senderName: 'Asistente de Voz IA (Gemini 2.5)',
      content:
        'Lamento mucho el dolor, Don Fernando. Lo canalizo de inmediato como Urgencia Prioritaria. El Dr. Roberto Mendoza tiene un espacio a las 6:30 PM de hoy para valorarlo y aliviar el dolor. ¿Le registro su lugar en nuestra sucursal?',
      time: '15:39',
    },
    {
      id: 'm2-4',
      sender: 'PATIENT',
      senderName: 'Fernando Rivas (Voz)',
      content: 'Sí por favor, cuenten conmigo ahí a las 6:30 PM. Muchas gracias.',
      time: '15:40',
    },
  ],
  'demo-conv-3': [
    {
      id: 'm3-1',
      sender: 'PATIENT',
      senderName: 'Sofía Morales',
      content: 'Hola, ¿qué costo tiene el diseño de sonrisa con carillas de porcelana?',
      time: '14:20',
    },
    {
      id: 'm3-2',
      sender: 'AI_AGENT',
      senderName: 'Asistente IA (Instagram)',
      content:
        '¡Hola Sofía! Con gusto. Las carillas de porcelana de alta estética tienen un costo desde $4,500 MXN por pieza. Incluyen escaneo 3D digital y prueba de mock-up. Te recomendamos agendar una valoración inicial para evaluar tu caso. ¿Te gustaría apartar mañana?',
      time: '14:21',
    },
  ],
};

const WAVEFORM_BARS = [
  30, 45, 70, 35, 80, 95, 60, 40, 55, 85, 100, 75, 50, 65, 90, 85, 45, 35, 75, 90,
  65, 40, 80, 95, 55, 30, 70, 85, 95, 65, 45, 60, 80, 45, 35, 60, 85, 55, 40, 25,
];

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
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Record<string, MessageItem[]>>({});
  const [isSeeding, setIsSeeding] = useState(false);

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

  const formatAudioTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determinar conversaciones activas según el modo seleccionado
  const conversations = useMemo(() => {
    if (mode === 'demo') {
      return DEMO_CONVERSATIONS;
    }
    return liveConversations;
  }, [mode, liveConversations]);

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
        const mappedConvs: ConversationItem[] = data.map((c: any) => {
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
            channel: (c.channel as any) || 'WHATSAPP',
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
        const mappedMsgs: MessageItem[] = data.map((m: any) => {
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
  useEffect(() => {
    if (mode === 'demo') {
      setActiveConvId('demo-conv-1');
    }
  }, [mode]);

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
      activeConv.isHandedOverToHuman = nextState;
      activeConv.status = nextState ? 'Modo Humano Activo' : 'Atendido por IA';
      setActiveConvId((id) => id); // trigger re-render
      return;
    }

    setLiveConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId ? { ...c, isHandedOverToHuman: nextState } : c
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
      DEMO_MESSAGES[activeConv.id] = [...(DEMO_MESSAGES[activeConv.id] || []), newMsg];
      setActiveConvId((id) => id);
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
      return DEMO_MESSAGES[activeConv.id] || [];
    }
    return liveMessages[activeConv.id] || [];
  }, [mode, activeConv, liveMessages]);

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
      {/* Columna Izquierda: Lista de Conversaciones */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Bandeja Omnicanal</h1>
              {mode === 'demo' ? (
                <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">
                  🟣 Showcase
                </span>
              ) : isLiveConnected ? (
                <span
                  aria-live="polite"
                  className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold"
                >
                  <span aria-hidden="true" className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  En vivo
                </span>
              ) : null}
            </div>
            <span className="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-semibold">
              {filteredConversations.length} {filteredConversations.length === 1 ? 'chat' : 'chats'}
            </span>
          </div>

          {mode === 'live' && conversationsError && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-amber-900">
                  Sin conexión con la API
                </p>
                <p className="text-[10px] text-amber-800 leading-relaxed">
                  Reintentando con backoff.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshConversations}
                className="text-[10px] font-semibold text-amber-900 underline"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar paciente o teléfono..."
              aria-label="Buscar conversación por paciente o teléfono"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
        </div>

        {/* Lista de Conversaciones */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <MessageSquare className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-700">Sin conversaciones registradas</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {mode === 'demo'
                  ? 'No hay resultados que coincidan con la búsqueda.'
                  : 'Esta clínica aún no tiene chats activos en la base de datos.'}
              </p>
              {mode === 'live' && activeTenantId && (
                <button
                  onClick={handleSeedFromInbox}
                  disabled={isSeeding}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isSeeding ? 'Generando...' : 'Generar Citas & Chats Demo'}
                </button>
              )}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 rounded-lg ${
                    isSelected ? 'bg-teal-50/90 ring-1 ring-teal-600/20' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                        conv.isUrgent
                          ? 'bg-red-100 text-red-700 ring-2 ring-red-400 ring-offset-1'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {conv.patientName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-white shadow">
                      {conv.channel === 'WHATSAPP' && (
                        <span className="w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                          <MessageSquare className="w-2.5 h-2.5" />
                        </span>
                      )}
                      {conv.channel === 'PHONE_CALL' && (
                        <span className="w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center text-white">
                          <PhoneCall className="w-2.5 h-2.5" />
                        </span>
                      )}
                      {conv.channel === 'INSTAGRAM' && (
                        <span className="w-3.5 h-3.5 bg-pink-500 rounded-full flex items-center justify-center text-white">
                          <Instagram className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {conv.patientName}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{conv.lastTime}</span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{conv.lastMessage}</p>

                    <div className="flex items-center gap-1.5 mt-1.5">
                      {conv.isUrgent && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded animate-pulse">
                          <AlertTriangle className="w-2.5 h-2.5" /> Urgente
                        </span>
                      )}
                      {conv.isHandedOverToHuman ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          👤 Humano
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                          🤖 Asistente IA
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Columna Central: Conversación Activa */}
      {activeConv ? (
        <div className="flex-1 flex flex-col bg-slate-50 border-r border-slate-200 min-w-0">
          {/* Header de Conversación */}
          <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm">
                {activeConv.patientName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">{activeConv.patientName}</h2>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">{formatMexicanPhone(activeConv.phone)}</span>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  Canal: <strong className="text-slate-700 font-medium">{activeConv.channel}</strong>
                  <span>•</span>
                  <span>Estado: {activeConv.status}</span>
                </p>
              </div>
            </div>

            {/* Botón de Control / Takeover */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <span className="text-xs font-semibold text-slate-700 block">
                  {activeConv.isHandedOverToHuman ? '👤 Humano en Control' : '🤖 Asistente IA Activo'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {activeConv.isHandedOverToHuman
                    ? 'La IA está pausada para este chat'
                    : 'La IA responde automáticamente 24/7'}
                </span>
              </div>
              <button
                onClick={toggleTakeover}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                  activeConv.isHandedOverToHuman
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-900 text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                {activeConv.isHandedOverToHuman ? 'Devolver a la IA' : 'Tomar Control (Pausar IA)'}
              </button>
            </div>
          </div>

          {/* Banner de Urgencia Crítica / Triaje Nivel 2 */}
          {activeConv.isUrgent && (
            <div className="bg-red-50 border-b border-red-200/80 px-4 py-2.5 flex items-center justify-between text-xs text-red-900 shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 animate-pulse" />
                <span>
                  <strong className="font-semibold">⚠️ Triaje Nivel 2 — Urgencia Médica/Dental:</strong>{' '}
                  {activeConv.appointment?.symptoms || 'Dolor agudo reportado. Requiere valoración prioritaria para hoy.'}
                </span>
              </div>
              <span className="text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded-full shrink-0">
                Mismo Día
              </span>
            </div>
          )}

          {/* Banner Informativo de Modo Copiloto / Takeover Humano */}
          {activeConv.isHandedOverToHuman && (
            <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 shrink-0">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong className="font-semibold">Modo Copiloto Humano Activo:</strong>{' '}
                  La IA está en pausa en este chat. Estás respondiendo manualmente a {activeConv.patientName}.
                </span>
              </div>
              <button
                onClick={toggleTakeover}
                className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline underline-offset-2 ml-2 shrink-0"
              >
                Reactivar IA 24/7
              </button>
            </div>
          )}

          {/* Reproductor de Audio Twilio con Waveform Dinámico */}
          {activeConv.channel === 'PHONE_CALL' && (
            <div className="bg-slate-900 text-slate-200 border-b border-slate-800 p-3.5 px-6 flex flex-col gap-2.5 shrink-0 select-none shadow-inner">
              {/* Header de la llamada */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-teal-400" />
                    Grabación Twilio Voice (+52) • Dr. Roberto Mendoza
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="tabular-nums text-slate-300">
                    Latencia: <strong className="text-teal-400 font-semibold tabular-nums">540ms</strong>
                  </span>
                  <span className="text-slate-700">•</span>
                  <span className="text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
                    Twilio Media Stream
                  </span>
                </div>
              </div>

              {/* Controles y Onda de Audio (Waveform) */}
              <div className="flex items-center gap-3">
                {/* Play / Pause */}
                <button
                  onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                  className="w-9 h-9 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center transition-all shadow-md shadow-teal-600/30 shrink-0 active:scale-95"
                  title={isPlayingAudio ? 'Pausar llamada' : 'Reproducir llamada'}
                >
                  {isPlayingAudio ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>

                {/* Saltar 10s atrás */}
                <button
                  onClick={() => setAudioProgress((p) => Math.max(0, p - 10))}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0 text-xs"
                  title="Retroceder 10 segundos"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                {/* Waveform Interactivo con barras de audio */}
                <div
                  className="flex-1 flex items-center gap-1 h-9 px-2.5 bg-slate-950/80 rounded-xl border border-slate-800 cursor-pointer overflow-hidden group select-none"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                    setAudioProgress(Math.round(percentage * audioDuration));
                  }}
                  title="Haz clic en cualquier barra para saltar en la llamada"
                >
                  {WAVEFORM_BARS.map((height, i) => {
                    const progressRatio = audioProgress / audioDuration;
                    const barRatio = (i + 1) / WAVEFORM_BARS.length;
                    const isPlayed = barRatio <= progressRatio;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all ${
                          isPlayed
                            ? 'bg-teal-400 group-hover:bg-teal-300'
                            : 'bg-slate-700 group-hover:bg-slate-600'
                        }`}
                        style={{
                          height: `${height}%`,
                          opacity: isPlayed ? 1 : 0.4,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Saltar 10s adelante */}
                <button
                  onClick={() => setAudioProgress((p) => Math.min(audioDuration, p + 10))}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0 text-xs font-mono"
                  title="Adelantar 10 segundos"
                >
                  <span className="text-[10px] font-bold font-mono">+10s</span>
                </button>

                {/* Tiempo Transcurrido */}
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-medium text-slate-200 tabular-nums">
                    {formatAudioTime(audioProgress)} / {formatAudioTime(audioDuration)}
                  </span>
                </div>

                {/* Velocidad de reproducción (1x, 1.25x, 1.5x, 2x) */}
                <button
                  onClick={() => {
                    const speeds = [1.0, 1.25, 1.5, 2.0];
                    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                    setPlaybackSpeed(speeds[nextIndex]);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 border border-slate-700 text-xs font-mono font-bold shrink-0 transition-colors"
                  title="Cambiar velocidad de reproducción"
                >
                  {playbackSpeed}x
                </button>
              </div>
            </div>
          )}

          {/* Mensajes del Thread */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {currentMessages.map((msg) => {
              const isPatient = msg.sender === 'PATIENT';
              const isAI = msg.sender === 'AI_AGENT';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isPatient ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-slate-500">
                      {msg.senderName}
                    </span>
                    <span className="text-[10px] text-slate-400">{msg.time}</span>
                  </div>

                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      isPatient
                        ? 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-sm'
                        : isAI
                        ? 'bg-teal-600 text-white rounded-tr-sm'
                        : 'bg-amber-600 text-white rounded-tr-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra Inferior de Entrada */}
          <div className="p-4 bg-white border-t border-slate-200">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                aria-label={`Respuesta manual para ${activeConv.patientName}`}
                placeholder={`Escribe una respuesta como recepcionista para ${activeConv.patientName}...`}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 transition-colors"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                Enviar
              </button>
            </form>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-slate-400">Atajos rápidos:</span>
              <button
                type="button"
                onClick={() =>
                  setInputText(
                    `Estamos en ${activeTenant?.address || 'Av. Horacio 1520, Polanco'} con estacionamiento disponible.`
                  )
                }
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded transition-colors"
              >
                📍 Enviar Ubicación
              </button>
              <button
                type="button"
                onClick={() =>
                  setInputText('Te comparto el enlace seguro para apartar tu cita: https://mpago.li/demo')
                }
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded transition-colors"
              >
                💳 Enlace Mercado Pago
              </button>
              <button
                type="button"
                onClick={() =>
                  setInputText('¿Deseas que confirmemos tu asistencia ahora mismo para apartar el consultorio?')
                }
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded transition-colors"
              >
                ✅ Confirmar Asistencia
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
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

      {/* Columna Derecha: Expediente y Cita del Paciente */}
      {activeConv && (
        <div className="w-72 bg-white p-5 overflow-y-auto hidden xl:block shrink-0 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Ficha del Paciente
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-slate-400 block">Nombre Completo</span>
                <p className="font-semibold text-slate-900">{activeConv.patientName}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Teléfono (México)</span>
                <p className="font-mono text-slate-800 font-semibold tabular-nums">{formatMexicanPhone(activeConv.phone) || 'No registrado'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Canal Principal</span>
                <span className="inline-block mt-0.5 text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                  {activeConv.channel}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Cita Activa
            </h3>
            {activeConv.appointment ? (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 truncate">
                    {activeConv.appointment.serviceName}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      activeConv.appointment.status === 'CONFIRMED'
                        ? 'text-emerald-700 bg-emerald-100'
                        : 'text-amber-700 bg-amber-100'
                    }`}
                  >
                    {activeConv.appointment.status === 'CONFIRMED' ? 'CONFIRMADA' : 'PENDIENTE'}
                  </span>
                </div>
                <p className="text-slate-600">{activeConv.appointment.doctorName}</p>
                <div className="flex items-center gap-1 text-slate-500 font-medium">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{activeConv.appointment.startTime}</span>
                </div>
                {activeConv.appointment.depositAmountMxn ? (
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Anticipo:</span>
                    <span className="font-bold text-emerald-700">
                      ${activeConv.appointment.depositAmountMxn.toLocaleString('es-MX')} MXN{' '}
                      {activeConv.appointment.paymentStatus === 'DEPOSIT_PAID' ? 'Pagado' : 'Pendiente'}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <p className="text-xs text-slate-500">Sin cita programada actualmente</p>
                <span className="text-[10px] text-slate-400">Atendido por Asistente IA</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Notas de Triaje
            </h3>
            <p className="text-xs text-amber-950 font-medium leading-relaxed bg-amber-50 border border-amber-200/80 p-2.5 rounded-lg">
              {activeConv.appointment?.symptoms ||
                'Paciente atendido mediante canal digital. Diagnóstico y requerimientos canalizados.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
