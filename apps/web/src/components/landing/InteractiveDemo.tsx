'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  PhoneCall, 
  MessageSquare, 
  Send, 
  Sparkles, 
  Calendar, 
  Clock, 
  MapPin, 
  CreditCard, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCheck, 
  User, 
  Bot, 
  RefreshCw, 
  Volume2, 
  Mic, 
  PhoneOff, 
  VolumeX,
  Stethoscope,
  Smile,
  CheckCircle2,
  CalendarCheck
} from 'lucide-react';

type ChannelMode = 'PHONE' | 'WHATSAPP';
type ClinicCategory = 'DENTAL' | 'DERMA' | 'MEDICINA';

interface ChatMessage {
  id: string;
  sender: 'PATIENT' | 'AI';
  text: string;
  timestamp: string;
  triage?: {
    level: 'URGENCY' | 'APPOINTMENT' | 'INFO' | 'PAYMENT';
    title: string;
    color: string;
  };
  appointmentCard?: {
    doctor: string;
    specialty: string;
    time: string;
    location: string;
    deposit: string;
    code: string;
  };
  isAudioPlaying?: boolean;
}

export function InteractiveDemo() {
  const [channel, setChannel] = useState<ChannelMode>('WHATSAPP');
  const [category, setCategory] = useState<ClinicCategory>('DENTAL');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(18);
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial greeting based on channel
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'AI',
      text: '¡Hola! Bienvenido a Clínica Dental Sonrisas Polanco en CDMX. Soy Sofía, tu asistente médica inteligente. ¿En qué te puedo ayudar hoy? ¿Te gustaría agendar una cita o tienes alguna molestia urgente?',
      timestamp: '11:42 AM',
      triage: {
        level: 'INFO',
        title: 'AsistentePro Activo (+52)',
        color: 'bg-teal-50 text-teal-700 border-teal-200',
      },
    },
  ]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Call timer simulation
  useEffect(() => {
    if (channel !== 'PHONE') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [channel]);

  // Quick preset prompts
  const samplePrompts = [
    {
      label: '¿Cuánto cuesta la limpieza dental?',
      text: '¿Cuánto cuesta la limpieza dental con ultrasonido y qué incluye?',
    },
    {
      label: '🚨 Dolor fuerte de muela (Urgencia)',
      text: 'Tengo un dolor muy fuerte y punzante en una muela desde anoche, ¡apenas puedo hablar!',
    },
    {
      label: 'Quiero agendar para mañana a las 4pm',
      text: 'Quiero agendar una cita para mañana a las 4:00 PM con la Dra. Sofía, por favor.',
    },
    {
      label: '¿Aceptan tarjetas y meses sin intereses?',
      text: '¿Aceptan pagos con tarjeta de crédito y tienen meses sin intereses?',
    },
  ];

  const formatCallTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = textToSend || inputText.trim();
    if (!query) return;

    const userMessageId = `user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMessageId,
        sender: 'PATIENT',
        text: query,
        timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      },
    ];

    setMessages(newMessages);
    setInputText('');
    setIsTyping(true);

    // Realistic AI Latency simulation (<600ms)
    setTimeout(() => {
      const lower = query.toLowerCase();
      let aiResponse: string = '';
      let triageData: ChatMessage['triage'] = undefined;
      let apptData: ChatMessage['appointmentCard'] = undefined;

      if (lower.includes('dolor') || lower.includes('fuerte') || lower.includes('urgencia') || lower.includes('sangr') || lower.includes('muela')) {
        triageData = {
          level: 'URGENCY',
          title: 'Triaje: Urgencia Dental - Prioridad 1',
          color: 'bg-rose-50 text-rose-700 border-rose-300',
        };
        aiResponse = '¡Lamento mucho el dolor! Por los síntomas punzantes que describes, clasificamos esto como una atención prioritaria de urgencia. Te hemos reservado un espacio de sobrecupo hoy mismo a las 5:30 PM con el Dr. David Alarcón en Polanco. Por favor evita masticar de ese lado ni aplicar calor directo. ¿Te confirmo este espacio de inmediato?';
      } else if (lower.includes('agendar') || lower.includes('mañana') || lower.includes('4pm') || lower.includes('4:00') || lower.includes('cita')) {
        triageData = {
          level: 'APPOINTMENT',
          title: 'Triaje: Agendamiento Confirmado',
          color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        };
        aiResponse = '¡Excelente! He verificado la agenda de la Dra. Sofía Morales y el espacio de mañana a las 4:00 PM está disponible. Para blindar tu cita y evitar inasistencias generamos tu confirmación con el Escudo Mercado Pago. Te comparto la tarjeta de tu cita:';
        apptData = {
          doctor: 'Dra. Sofía Morales G.',
          specialty: 'Odontología Restauradora (Céd. 8492019)',
          time: 'Mañana, 4:00 PM (Hora CDMX)',
          location: 'Av. Pdte. Masaryk 101, Polanco V Secc, CDMX',
          deposit: '$300 MXN (Acreditado vía Mercado Pago)',
          code: `POL-${Math.floor(1000 + Math.random() * 9000)}`,
        };
      } else if (lower.includes('costo') || lower.includes('precio') || lower.includes('limpieza') || lower.includes('cuánto')) {
        triageData = {
          level: 'INFO',
          title: 'Triaje: Cotización y Protocolo',
          color: 'bg-blue-50 text-blue-700 border-blue-200',
        };
        aiResponse = 'Nuestra Limpieza Dental Profunda con Ultrasonido y Profilaxis tiene un costo preferencial de $850 MXN (precio regular $1,200 MXN). Incluye remoción de sarro supragingival, pulido dental con pasta diamantada, fluorización tópica y revisión con cámara intraoral sin costo adicional. ¿Te gustaría apartar un horario esta semana?';
      } else if (lower.includes('tarjeta') || lower.includes('meses') || lower.includes('msi') || lower.includes('pago')) {
        triageData = {
          level: 'PAYMENT',
          title: 'Triaje: Medios de Pago & Facturación',
          color: 'bg-amber-50 text-amber-800 border-amber-300',
        };
        aiResponse = 'Aceptamos todas las tarjetas de crédito y débito (Visa, Mastercard, AMEX), transferencias SPEI y cobros digitales con Mercado Pago. En tratamientos mayores a $3,000 MXN ofrecemos 3 y 6 Meses Sin Intereses con bancos participantes. Además, emitimos factura fiscal CFDI 4.0 deducible de impuestos de inmediato.';
      } else {
        triageData = {
          level: 'INFO',
          title: 'Triaje: Atención General',
          color: 'bg-teal-50 text-teal-700 border-teal-200',
        };
        aiResponse = `Con gusto te asisto. En Clínica Sonrisas Polanco atendemos de lunes a sábado de 9:00 AM a 8:00 PM. Puedo ayudarte a agendar una valoración, darte costos de tratamientos o conectarte con nuestra recepcionista en turno. ¿Prefieres una cita matutina o vespertina?`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'AI',
          text: aiResponse,
          timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
          triage: triageData,
          appointmentCard: apptData,
        },
      ]);
      setIsTyping(false);
    }, 550);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'msg-reset',
        sender: 'AI',
        text: '¡Hola de nuevo! Soy Sofía, asistente inteligente de Clínica Dental Sonrisas Polanco. Escribe o selecciona una de las preguntas de ejemplo para ver cómo respondo a tus pacientes en tiempo real.',
        timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        triage: {
          level: 'INFO',
          title: 'Simulador Reiniciado (+52)',
          color: 'bg-teal-50 text-teal-700 border-teal-200',
        },
      },
    ]);
  };

  return (
    <section id="demo" className="py-20 md:py-28 bg-slate-900 text-white relative overflow-hidden">
      {/* Glow Orbs */}
      <div className="absolute top-0 right-1/3 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Pruébalo tú mismo en vivo: <br />
            <span className="text-teal-400">
              Teléfono (+52) o WhatsApp
            </span>
          </h2>
          
          <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed">
            Interactúa con la IA como lo haría uno de tus pacientes. Observa cómo identifica urgencias médicas, responde con modismos de México y confirma citas al instante.
          </p>
        </div>

        {/* Channel & Specialty Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-5xl mx-auto mb-6 bg-slate-800/80 p-3 rounded-2xl border border-slate-700/80 backdrop-blur-sm">
          {/* Channel selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setChannel('WHATSAPP')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                channel === 'WHATSAPP'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>💬 WhatsApp Oficial</span>
            </button>

            <button
              onClick={() => setChannel('PHONE')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                channel === 'PHONE'
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>📞 Llamada Telefónica (+52)</span>
            </button>
          </div>

          {/* Specialty Selector & Reset */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/60 px-3 py-2 rounded-xl border border-slate-700">
              <Smile className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-slate-200 font-medium">Clínica Dental Polanco</span>
            </div>

            <button
              onClick={handleResetChat}
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors"
              title="Reiniciar conversación"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reiniciar</span>
            </button>
          </div>
        </div>

        {/* The Main Simulator Container */}
        <div className="max-w-5xl mx-auto bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Left / Main Simulation Window (8 cols) */}
          <div className="lg:col-span-8 flex flex-col h-[620px] bg-slate-900/90 relative">
            
            {/* Top Bar of the Phone or WhatsApp Interface */}
            {channel === 'WHATSAPP' ? (
              <div className="bg-emerald-950/90 border-b border-emerald-800/60 px-5 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold shadow">
                      <Bot className="w-5 h-5" />
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-slate-950 rounded-full"></span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-white leading-tight">
                        Sonrisas Polanco (Verificado Meta)
                      </h4>
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-bold border border-emerald-500/30">
                        OFICIAL
                      </span>
                    </div>
                    <p className="text-xs text-emerald-300/80 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      En línea • AsistentePro IA 24/7
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums">+52 55 9225 4321</span>
                  <div className="text-[10px] text-emerald-400 font-medium tabular-nums">Latencia: 540ms</div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 border-b border-slate-800 px-5 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-600/30 border border-teal-500/50 flex items-center justify-center text-teal-300">
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-white leading-tight">
                      Llamada Telefónica Voz Twilio México
                    </h4>
                    <p className="text-xs text-teal-400 flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Conectado con Polanco (+52 55)</span>
                      <span className="text-slate-500">•</span>
                      <span className="font-mono text-slate-300 tabular-nums">{formatCallTime(callDuration)}</span>
                    </p>
                  </div>
                </div>

                {/* Call controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsCallMuted(!isCallMuted)}
                    aria-label={isCallMuted ? 'Activar micrófono de la llamada demo' : 'Silenciar micrófono de la llamada demo'}
                    aria-pressed={isCallMuted}
                    className={`p-2 rounded-full border transition-colors ${
                      isCallMuted 
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' 
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={isCallMuted ? 'Desmutear' : 'Silenciar'}
                  >
                    {isCallMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleResetChat}
                    className="p-2 rounded-full bg-rose-600/30 text-rose-300 border border-rose-500/50 hover:bg-rose-600 transition-colors"
                    title="Colgar y reiniciar"
                  >
                    <PhoneOff className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Audio Waveform Banner when in Phone Mode */}
            {channel === 'PHONE' && (
              <div className="bg-teal-950/40 border-b border-teal-900/50 px-5 py-2.5 flex items-center justify-between text-xs text-teal-300">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Voz de Sofía (IA en vivo):</span>
                  <div className="flex items-center gap-1 h-5">
                    <span className="w-1 h-2.5 bg-teal-400 rounded-full animate-pulse"></span>
                    <span className="w-1 h-5 bg-teal-400 rounded-full animate-pulse [animation-delay:150ms]"></span>
                    <span className="w-1 h-3.5 bg-teal-400 rounded-full animate-pulse [animation-delay:300ms]"></span>
                    <span className="w-1 h-5 bg-teal-400 rounded-full animate-pulse [animation-delay:450ms]"></span>
                    <span className="w-1 h-3 bg-teal-400 rounded-full animate-pulse [animation-delay:200ms]"></span>
                  </div>
                </div>
                <span className="text-[11px] text-teal-400/80 bg-teal-900/60 px-2 py-0.5 rounded">
                  Modismos: Español Neutro Mexicano
                </span>
              </div>
            )}

            {/* Message Feed Area */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 font-sans text-sm bg-radial from-slate-900 to-slate-950">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'PATIENT' ? 'items-end' : 'items-start'}`}
                >
                  {/* Triage Badge if AI */}
                  {msg.triage && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-xs ${msg.triage.color}`}>
                        {msg.triage.title}
                      </span>
                    </div>
                  )}

                  <div className="flex items-end gap-2 max-w-[88%] sm:max-w-[78%]">
                    {msg.sender === 'AI' && (
                      <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mb-1">
                        S
                      </div>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 shadow-md ${
                        msg.sender === 'PATIENT'
                          ? 'bg-teal-600 text-white rounded-br-xs'
                          : channel === 'WHATSAPP'
                          ? 'bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700/80'
                          : 'bg-slate-800/90 text-slate-100 rounded-bl-xs border border-teal-900/50'
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-line">{msg.text}</p>

                      {/* Confirmed Appointment Card inside chat bubble */}
                      {msg.appointmentCard && (
                        <div className="mt-3.5 bg-slate-900/95 border border-emerald-500/40 rounded-xl p-3.5 text-left text-slate-200">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                              <CalendarCheck className="w-4 h-4" />
                              <span>CITA CONFIRMADA EN AGENDA</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{msg.appointmentCard.code}</span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Especialista:</span>
                              <span className="font-semibold text-white">{msg.appointmentCard.doctor}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Fecha & Hora:</span>
                              <span className="font-semibold text-emerald-300">{msg.appointmentCard.time}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Ubicación:</span>
                              <span className="text-slate-300 truncate max-w-[190px] text-right">{msg.appointmentCard.location}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                              <span className="text-slate-400 flex items-center gap-1">
                                <CreditCard className="w-3 h-3 text-amber-400" />
                                <span>Escudo No-Show:</span>
                              </span>
                              <span className="text-amber-300 font-semibold">{msg.appointmentCard.deposit}</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Sincronizado con Google Cal</span>
                            </span>
                            <span className="text-slate-400">Recordatorio 24h & 2h activado</span>
                          </div>
                        </div>
                      )}

                      {/* Timestamp & checkmarks */}
                      <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-slate-400">
                        <span>{msg.timestamp}</span>
                        {msg.sender === 'PATIENT' && (
                          <CheckCheck className="w-3.5 h-3.5 text-teal-300 inline" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <div className="w-7 h-7 rounded-full bg-teal-600/60 flex items-center justify-center text-white text-xs font-bold">
                    S
                  </div>
                  <div className="bg-slate-800 border border-slate-700/80 px-3.5 py-2 rounded-2xl rounded-bl-xs flex items-center gap-1.5">
                    <span className="text-[11px] text-teal-300">
                      {channel === 'PHONE' ? 'Sofía procesando voz en <500ms...' : 'Sofía está escribiendo...'}
                    </span>
                    <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse"></span>
                    <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse [animation-delay:200ms]"></span>
                    <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse [animation-delay:400ms]"></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Form Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  channel === 'PHONE'
                    ? 'Habla o escribe tu pregunta como paciente...'
                    : 'Escribe un mensaje de WhatsApp a la clínica...'
                }
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              
              <button
                type="submit"
                disabled={!inputText.trim() || isTyping}
                className="px-4 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm flex items-center gap-1.5 shadow-md shadow-teal-600/30 transition-all shrink-0"
              >
                <span>Enviar</span>
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Right Sidebar: Preset prompts & Live Assistant Telemetry (4 cols) */}
          <div className="lg:col-span-4 p-5 sm:p-6 bg-slate-950/70 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <h4 className="font-bold text-sm text-white uppercase tracking-wider">
                  Preguntas Típicas de Pacientes
                </h4>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Haz clic en cualquiera de estos ejemplos para simular la respuesta inmediata de la IA con triaje clínico:
              </p>

              {/* Sample Prompt Chips */}
              <div className="space-y-2.5">
                {samplePrompts.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(item.text)}
                    disabled={isTyping}
                    className="w-full text-left p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/50 text-xs text-slate-200 transition-all group disabled:opacity-50"
                  >
                    <div className="font-semibold text-teal-300 group-hover:text-teal-200 flex items-center justify-between mb-1">
                      <span>{item.label}</span>
                      <Send className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-teal-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">
                      «{item.text}»
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Telemetry / Features explanation box */}
            <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Qué está sucediendo por detrás:
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Triaje Semántico:</strong> Detecta si el paciente requiere consulta electiva o espacio de urgencia inmediata.
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Escudo Mercado Pago:</strong> Emite link de anticipo ($200 - $500 MXN) reduciendo el absentismo al &lt;5%.
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Modo Copiloto Activo:</strong> Tu recepcionista humana puede tomar la conversación en cualquier instante en el dashboard.
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Footnote reassurance */}
        <div className="mt-6 text-center text-xs text-slate-400">
          💡 La IA aprende las políticas, precios, doctores y horarios específicos de tu clínica en cuestión de minutos.
        </div>

      </div>
    </section>
  );
}
