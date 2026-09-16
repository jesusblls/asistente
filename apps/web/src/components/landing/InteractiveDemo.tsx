'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  PhoneCall, 
  MessageSquare, 
  Send, 
  Sparkles, 
  CreditCard, 
  CheckCheck, 
  Bot, 
  RefreshCw, 
  Volume2, 
  VolumeX,
  PhoneOff, 
  Smile, 
  CheckCircle2, 
  CalendarCheck,
  Stethoscope,
  Sparkle
} from 'lucide-react';

type ChannelMode = 'WHATSAPP' | 'PHONE';
type SpecialtyKey = 'DENTAL' | 'MEDICINA' | 'DERMA';

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
}

const CLINIC_PRESETS = {
  DENTAL: {
    name: 'Sonrisas Polanco (CDMX)',
    doctor: 'Dra. Sofía Morales G. • Céd. 8492019',
    assistant: 'Sofía (Asistente Dental IA)',
    phone: '+52 (55) 4912-8830',
    greeting: '¡Hola! Bienvenido a Clínica Dental Sonrisas Polanco. Soy Sofía, tu asistente inteligente. ¿Te gustaría agendar una cita de limpieza, valoración o presentas alguna molestia que te duela mucho?',
    prompts: [
      { label: '🚨 Dolor fuerte de muela (Urgencia)', text: 'Tengo un dolor muy fuerte y punzante en una muela desde anoche, ¡apenas puedo masticar!' },
      { label: '📅 Agendar limpieza mañana 4:00 PM', text: 'Quiero agendar una cita para mañana a las 4:00 PM con la Dra. Sofía para limpieza.' },
      { label: '💵 Costo de limpieza dental', text: '¿Cuánto cuesta la limpieza con ultrasonido y qué incluye el procedimiento?' },
      { label: '💳 ¿Aceptan tarjetas y meses sin intereses?', text: '¿Aceptan tarjetas de crédito y tienen meses sin intereses con BBVA o Banamex?' },
    ]
  },
  MEDICINA: {
    name: 'Centro Médico Providencia (Guadalajara)',
    doctor: 'Dr. Roberto Villaseñor • Céd. 6310294',
    assistant: 'Mariana (Asistente Médica IA)',
    phone: '+52 (33) 3810-5400',
    greeting: 'Buenas tardes, te comunicas a Centro Médico Providencia. Soy Mariana. ¿Deseas agendar con alguno de nuestros especialistas o requieres atención prioritaria el día de hoy?',
    prompts: [
      { label: '🚨 Fiebre alta y dificultad al respirar', text: 'Mi familiar tiene fiebre de 39°C y le cuesta un poco respirar desde la madrugada.' },
      { label: '📅 Consulta de Medicina Interna', text: 'Necesito una consulta de seguimiento para control de presión arterial con Medicina Interna.' },
      { label: '💵 Costo de consulta general', text: '¿Cuál es el costo de la consulta de medicina general y expiden receta médica?' },
      { label: '🛡️ ¿Tienen convenio con aseguradoras?', text: '¿Aceptan seguros de gastos médicos mayores como GNP, MetLife o AXA?' },
    ]
  },
  DERMA: {
    name: 'DermoSkin Instituto (San Pedro MTY)',
    doctor: 'Dra. Marcela Garza T. • Céd. 9104821',
    assistant: 'Elena (Asistente Dermo IA)',
    phone: '+52 (81) 8356-9020',
    greeting: '¡Hola! Bienvenida a DermoSkin San Pedro. Soy Elena, asistente de la Dra. Garza. ¿Te gustaría agendar una valoración de piel o consultar información sobre tratamientos láser?',
    prompts: [
      { label: '🚨 Reacción alérgica aguda en piel', text: 'Me salió un sarpullido rojo muy repentino con ardor intenso tras aplicar una crema.' },
      { label: '📅 Valoración de acné o manchas', text: 'Quiero agendar una valoración para tratamiento de acné este viernes por la tarde.' },
      { label: '💵 Precio de consulta dermatológica', text: '¿Cuánto cuesta la consulta de primera vez con la Dra. Marcela Garza?' },
      { label: '📍 Ubicación y estacionamiento', text: '¿Dónde se encuentran ubicados en San Pedro y cuentan con valet parking?' },
    ]
  }
};

export function InteractiveDemo() {
  const [channel, setChannel] = useState<ChannelMode>('WHATSAPP');
  const [specialty, setSpecialty] = useState<SpecialtyKey>('DENTAL');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(24);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const clinic = CLINIC_PRESETS[specialty];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'AI',
      text: clinic.greeting,
      timestamp: '11:42 AM',
      triage: {
        level: 'INFO',
        title: 'AsistentePro Activo (+52)',
        color: 'bg-teal-50 text-teal-800 border-teal-200',
      },
    },
  ]);

  const handleSelectSpecialty = (key: SpecialtyKey) => {
    if (key === specialty) return;
    setSpecialty(key);
    setMessages([
      {
        id: `msg-spec-${Date.now()}`,
        sender: 'AI',
        text: CLINIC_PRESETS[key].greeting,
        timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        triage: {
          level: 'INFO',
          title: 'AsistentePro Activo (+52)',
          color: 'bg-teal-50 text-teal-800 border-teal-200',
        },
      }
    ]);
  };

  // Scroll to bottom ONLY inside the inner chat container, NEVER scrolling the whole page
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isTyping]);

  // Call duration counter
  useEffect(() => {
    if (channel !== 'PHONE') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [channel]);

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    // Clean text for speech
    const clean = text.replace(/[*_~`]/g, '').slice(0, 240);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'es-MX';
    utterance.rate = 1.02;
    
    const voices = window.speechSynthesis.getVoices();
    const mxVoice = voices.find(v => v.lang === 'es-MX' || v.lang.startsWith('es-MX')) ||
                    voices.find(v => v.lang.startsWith('es'));
    if (mxVoice) utterance.voice = mxVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = textToSend || inputText.trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'PATIENT',
      text: query,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // Realistic response delay (<550ms)
    setTimeout(() => {
      const lower = query.toLowerCase();
      let aiResponse = '';
      let triageData: ChatMessage['triage'];
      let apptData: ChatMessage['appointmentCard'];

      if (lower.includes('respirar') || lower.includes('fiebre') || lower.includes('pecho') || lower.includes('sangr')) {
        triageData = {
          level: 'URGENCY',
          title: '🚨 Triaje Nivel 1: Urgencia Hospitalaria / Alerta Médica',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
        };
        aiResponse = 'Por los síntomas de compromiso respiratorio o fiebre aguda que mencionas, es fundamental una valoración médica presencial prioritaria inmediata. Hemos canalizado el aviso de urgencia a la guardia médica y reservado un espacio de sobrecupo inmediato. Si la falta de aire empeora, por favor acude a urgencias hospitalarias o llama al 911.';
      } else if (lower.includes('dolor') || lower.includes('muela') || lower.includes('sarpullido') || lower.includes('urgencia')) {
        triageData = {
          level: 'URGENCY',
          title: '⚠️ Triaje Nivel 2: Urgencia con Atención Prioritaria Hoy',
          color: 'bg-amber-50 text-amber-800 border-amber-200',
        };
        aiResponse = `¡Lamento mucho el dolor! Lo clasificamos como atención prioritaria del mismo día. Tenemos un espacio de sobrecupo hoy a las 5:30 PM en ${clinic.name} con ${clinic.doctor}. Por favor no apliques calor directo ni te automediques. ¿Te aseguro este horario de inmediato?`;
      } else if (lower.includes('agendar') || lower.includes('cita') || lower.includes('mañana') || lower.includes('4:00') || lower.includes('4pm') || lower.includes('viernes')) {
        triageData = {
          level: 'APPOINTMENT',
          title: '📅 Triaje: Agendamiento & Escudo Anti-Inasistencia',
          color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
        aiResponse = `¡Con mucho gusto! El espacio está libre en la agenda oficial. Para blindar tu cita y evitar inasistencias generamos tu confirmación con el Escudo Mercado Pago. Te comparto los detalles de tu cita:`;
        apptData = {
          doctor: clinic.doctor,
          specialty: clinic.name,
          time: 'Mañana, 4:00 PM (Tiempo de CDMX)',
          location: 'Consultorio Central • Estacionamiento y Valet disponible',
          deposit: '$300 MXN (Acreditado vía Mercado Pago)',
          code: `CLIN-${Math.floor(1000 + Math.random() * 9000)}`,
        };
      } else if (lower.includes('costo') || lower.includes('precio') || lower.includes('cuánto') || lower.includes('limpieza')) {
        triageData = {
          level: 'INFO',
          title: '💵 Triaje: Información de Servicios y Precios Oficiales',
          color: 'bg-sky-50 text-sky-800 border-sky-200',
        };
        aiResponse = `La consulta o procedimiento en ${clinic.name} tiene un costo preferencial de $850 MXN (precio regular $1,200 MXN). Incluye diagnóstico completo, revisión con instrumental especializado y plan de tratamiento personalizado. ¿Te gustaría agendar un espacio esta misma semana?`;
      } else if (lower.includes('tarjeta') || lower.includes('meses') || lower.includes('msi') || lower.includes('seguro') || lower.includes('pago')) {
        triageData = {
          level: 'PAYMENT',
          title: '💳 Triaje: Formas de Pago, Seguros y Facturación CFDI 4.0',
          color: 'bg-amber-50 text-amber-800 border-amber-200',
        };
        aiResponse = `Aceptamos todas las tarjetas de crédito/débito, transferencias SPEI y Mercado Pago. Contamos con 3 y 6 Meses Sin Intereses en tratamientos calificados y emitimos factura fiscal CFDI 4.0 deducible de impuestos. También entregamos informes para reembolso de aseguradoras (GNP, AXA, MetLife).`;
      } else {
        triageData = {
          level: 'INFO',
          title: '💬 Triaje: Atención Personalizada en Consulta',
          color: 'bg-teal-50 text-teal-800 border-teal-200',
        };
        aiResponse = `Para servirte con mucho gusto en ${clinic.name}. Atendemos de lunes a sábado de 9:00 AM a 8:00 PM. Puedo consultar horarios de médicos, darte costos o comunicarte directamente con recepción humana. ¿Prefieres una cita matutina o vespertina?`;
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

      if (channel === 'PHONE') {
        speakText(aiResponse);
      }
    }, 520);
  };

  const handleReset = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setMessages([
      {
        id: `msg-reset-${Date.now()}`,
        sender: 'AI',
        text: clinic.greeting,
        timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        triage: {
          level: 'INFO',
          title: 'Simulador Reiniciado (+52)',
          color: 'bg-teal-50 text-teal-800 border-teal-200',
        },
      },
    ]);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <section id="demo" className="py-20 md:py-28 bg-slate-900 text-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Prueba cómo atiende a tus pacientes en vivo: <br />
            <span className="text-teal-400">Teléfono (+52) o WhatsApp</span>
          </h2>
          
          <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed">
            Interactúa como si fueras un paciente. Observa cómo identifica urgencias en segundos, habla con acento y calidez de México, y confirma citas protegiendo el espacio con anticipo.
          </p>
        </div>

        {/* Top Control Bar: Channels & Clinic Specialty */}
        <div className="max-w-5xl mx-auto mb-6 bg-slate-800/90 rounded-2xl p-3 border border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Dual Channel Switcher */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setChannel('WHATSAPP')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                channel === 'WHATSAPP'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>WhatsApp Oficial</span>
            </button>

            <button
              type="button"
              onClick={() => setChannel('PHONE')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                channel === 'PHONE'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>Llamada Telefónica (+52)</span>
            </button>
          </div>

          {/* Specialty Selector & Reset */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-xl border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => handleSelectSpecialty('DENTAL')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  specialty === 'DENTAL' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Dental
              </button>
              <button
                type="button"
                onClick={() => handleSelectSpecialty('MEDICINA')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  specialty === 'MEDICINA' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Medicina
              </button>
              <button
                type="button"
                onClick={() => handleSelectSpecialty('DERMA')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  specialty === 'DERMA' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Dermatología
              </button>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors"
              title="Reiniciar chat"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Simulator Grid */}
        <div className="max-w-5xl mx-auto bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Main Simulation Window (8 cols) */}
          <div className="lg:col-span-8 flex flex-col h-[620px] bg-slate-900 relative">
            
            {/* Window Header */}
            {channel === 'WHATSAPP' ? (
              <div className="bg-emerald-950/80 border-b border-emerald-900/60 px-5 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                      <Bot className="w-5 h-5" />
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-slate-950 rounded-full"></span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white">
                        {clinic.name}
                      </h4>
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-bold border border-emerald-500/30">
                        OFICIAL
                      </span>
                    </div>
                    <p className="text-xs text-emerald-300/80 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>En línea • AsistentePro 24/7</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums">{clinic.phone}</span>
                  <div className="text-[10px] text-emerald-400 font-medium tabular-nums">Latencia: 520ms</div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 border-b border-slate-800 px-5 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-600/30 border border-teal-500/50 flex items-center justify-center text-teal-300">
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">
                      Llamada en Curso: {clinic.assistant}
                    </h4>
                    <p className="text-xs text-teal-400 flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Línea {clinic.phone}</span>
                      <span className="text-slate-500">•</span>
                      <span className="font-mono text-slate-300 tabular-nums">{formatTimer(callDuration)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCallMuted(!isCallMuted)}
                    className={`p-2 rounded-full border transition-colors ${
                      isCallMuted 
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' 
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={isCallMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
                  >
                    {isCallMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="p-2 rounded-full bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600 hover:text-white transition-colors"
                    title="Colgar llamada"
                  >
                    <PhoneOff className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Audio wave indicator banner for Phone Call */}
            {channel === 'PHONE' && (
              <div className="bg-teal-950/40 border-b border-teal-900/40 px-5 py-2 flex items-center justify-between text-xs text-teal-300">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Voz de {clinic.assistant}:</span>
                  <div className="flex items-center gap-1 h-4">
                    <span className="w-1 h-2 bg-teal-400 rounded-full animate-pulse"></span>
                    <span className="w-1 h-4 bg-teal-400 rounded-full animate-pulse delay-75"></span>
                    <span className="w-1 h-3 bg-teal-400 rounded-full animate-pulse delay-150"></span>
                    <span className="w-1 h-4 bg-teal-400 rounded-full animate-pulse delay-100"></span>
                    <span className="w-1 h-2.5 bg-teal-400 rounded-full animate-pulse delay-200"></span>
                  </div>
                  {isSpeaking && (
                    <span className="text-[10px] text-teal-200 bg-teal-800/80 px-1.5 py-0.5 rounded font-medium">
                      Hablando...
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-teal-400/80">
                  Español Neutro Mexicano (Twilio Voice)
                </span>
              </div>
            )}

            {/* Chat Messages List */}
            <div ref={chatContainerRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 text-sm bg-slate-900">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'PATIENT' ? 'items-end' : 'items-start'}`}
                >
                  {msg.triage && (
                    <div className="mb-1.5">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${msg.triage.color}`}>
                        {msg.triage.title}
                      </span>
                    </div>
                  )}

                  <div className="flex items-end gap-2 max-w-[90%] sm:max-w-[80%]">
                    {msg.sender === 'AI' && (
                      <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mb-1">
                        S
                      </div>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        msg.sender === 'PATIENT'
                          ? 'bg-teal-600 text-white rounded-br-sm'
                          : 'bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700/80'
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-line">{msg.text}</p>

                      {/* Appointment Card Preview */}
                      {msg.appointmentCard && (
                        <div className="mt-3.5 bg-slate-950 border border-emerald-500/40 rounded-xl p-3.5 text-left text-slate-200">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                              <CalendarCheck className="w-4 h-4" />
                              <span>CITA AGENDADA EN CALENDARIO</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{msg.appointmentCard.code}</span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Doctor/a:</span>
                              <span className="font-semibold text-white">{msg.appointmentCard.doctor}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Horario:</span>
                              <span className="font-semibold text-emerald-300">{msg.appointmentCard.time}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Sede:</span>
                              <span className="text-slate-300 truncate max-w-[200px]">{msg.appointmentCard.location}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1">
                                <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                                <span>Anticipo No-Show:</span>
                              </span>
                              <span className="text-amber-300 font-bold">{msg.appointmentCard.deposit}</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Sincronizado con Google Cal</span>
                            </span>
                            <span>Aviso 24h por WhatsApp</span>
                          </div>
                        </div>
                      )}

                      {/* Timestamp & double checks */}
                      <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
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
                  <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">
                    S
                  </div>
                  <div className="bg-slate-800 border border-slate-700 px-3.5 py-2 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
                    <span className="text-[11px] text-teal-300">
                      {channel === 'PHONE' ? 'Sofía respondiendo voz en <520ms...' : 'Sofía está escribiendo...'}
                    </span>
                    <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse"></span>
                    <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse delay-75"></span>
                    <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse delay-150"></span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
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
                    ? 'Escribe o simula lo que diría el paciente por teléfono...'
                    : 'Escribe un mensaje de WhatsApp a la clínica...'
                }
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
              
              <button
                type="submit"
                disabled={!inputText.trim() || isTyping}
                className="px-5 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm flex items-center gap-1.5 transition-colors shrink-0"
              >
                <span>Enviar</span>
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Right Sidebar: Preset Scenarios & Telemetry (4 cols) */}
          <div className="lg:col-span-4 p-5 sm:p-6 bg-slate-950 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                  Prueba estos escenarios reales
                </h4>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Haz clic en una opción para ver la respuesta inmediata de la IA con triaje clínico en {clinic.name}:
              </p>

              {/* Sample Prompts */}
              <div className="space-y-2.5">
                {clinic.prompts.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(item.text)}
                    disabled={isTyping}
                    className="w-full text-left p-3 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-teal-500/50 text-xs text-slate-200 transition-colors disabled:opacity-50 group"
                  >
                    <div className="font-bold text-teal-300 group-hover:text-teal-200 flex items-center justify-between mb-1">
                      <span>{item.label}</span>
                      <Send className="w-3 h-3 opacity-0 group-hover:opacity-100 text-teal-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">
                      «{item.text}»
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Architecture Telemetry Box */}
            <div className="mt-6 pt-5 border-t border-slate-800 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Garantías del sistema en vivo:
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Triaje Inmediato:</strong> Separa emergencias 911 de citas electivas sin errores.
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Anticipos Mercado Pago:</strong> El paciente aparta con $200-$500 MXN directo a tu cuenta bancaria.
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Modo Copiloto Recepción:</strong> Tu equipo puede tomar el control del chat o llamada con un solo clic.
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
