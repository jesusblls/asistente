'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  PhoneCall, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  CalendarCheck, 
  ArrowRight, 
  CheckCircle2, 
  Play,
  Pause,
  Clock,
  HeartPulse,
  Volume2
} from 'lucide-react';

export function Hero() {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  const sampleSpeechText = 
    '¡Hola! Qué gusto saludarte. Te estás comunicando a Clínica Dental Sonrisas Polanco. Soy Sofía, tu asistente médica. ¿Te gustaría agendar una cita o presentas alguna molestia urgente?';

  const handleToggleVoiceSample = () => {
    if (isPlayingAudio) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      setAudioProgress(0);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sampleSpeechText);
      utterance.lang = 'es-MX';
      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      // Find best Mexican or Spanish voice
      const voices = window.speechSynthesis.getVoices();
      const mxVoice = voices.find(v => v.lang === 'es-MX' || v.lang.startsWith('es-MX')) ||
                      voices.find(v => v.lang.startsWith('es'));
      if (mxVoice) {
        utterance.voice = mxVoice;
      }

      utterance.onstart = () => {
        setIsPlayingAudio(true);
      };

      utterance.onend = () => {
        setIsPlayingAudio(false);
        setAudioProgress(100);
        setTimeout(() => setAudioProgress(0), 1000);
      };

      utterance.onerror = () => {
        setIsPlayingAudio(false);
        setAudioProgress(0);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // Fallback visual simulation if browser lacks speech synthesis
      setIsPlayingAudio(true);
      setTimeout(() => {
        setIsPlayingAudio(false);
        setAudioProgress(0);
      }, 6000);
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlayingAudio) {
      timer = setInterval(() => {
        setAudioProgress(prev => (prev >= 100 ? 0 : prev + 3));
      }, 200);
    }
    return () => clearInterval(timer);
  }, [isPlayingAudio]);

  const metrics = [
    {
      value: '< 600 ms',
      label: 'Latencia Telefónica',
      description: 'Respuesta en tiempo real vía Twilio +52',
      icon: Zap,
      color: 'text-sky-700 bg-sky-50 border-sky-200',
    },
    {
      value: '-80%',
      label: 'Menos Inasistencias',
      description: 'Con anticipos en Mercado Pago y alertas 2h',
      icon: ShieldCheck,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      value: '24 / 7',
      label: 'Cobertura Completa',
      description: 'Atención nocturna y en fines de semana',
      icon: CalendarCheck,
      color: 'text-teal-700 bg-teal-50 border-teal-200',
    },
    {
      value: '100%',
      label: 'Sincronización',
      description: 'Google Calendar y base de datos clínica',
      icon: HeartPulse,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
  ];

  return (
    <section className="pt-12 pb-20 md:pt-16 md:pb-28 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Title & Value Proposition */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
            Tu clínica nunca vuelve a perder{' '}
            <span className="text-teal-700">una llamada</span>{' '}
            ni un paciente.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto">
            <strong className="text-slate-900 font-semibold">AsistentePro</strong> atiende tu teléfono fijo o celular (+52) con voz cálida mexicana en menos de 600 ms, clasifica urgencias médicas, responde por WhatsApp y asegura la asistencia con anticipo en Mercado Pago.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-all active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Probar Simulador Interactivo</span>
            </a>

            <button
              type="button"
              onClick={handleToggleVoiceSample}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-4 text-base font-semibold rounded-xl border transition-all ${
                isPlayingAudio 
                  ? 'bg-teal-50 border-teal-500 text-teal-900' 
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              {isPlayingAudio ? (
                <>
                  <Pause className="w-5 h-5 text-teal-600 fill-current" />
                  <span>Pausar Muestra de Voz</span>
                  <div className="flex items-center gap-0.5 ml-1">
                    <span className="w-1 h-3 bg-teal-600 rounded-full animate-pulse"></span>
                    <span className="w-1 h-5 bg-teal-600 rounded-full animate-pulse delay-75"></span>
                    <span className="w-1 h-4 bg-teal-600 rounded-full animate-pulse delay-150"></span>
                  </div>
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5 text-teal-600" />
                  <span>Escuchar Voz de Sofía (Demo)</span>
                </>
              )}
            </button>

            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 text-base font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors"
            >
              <span>Ver Dashboard</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>
          </div>

          {/* Micro assurances */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs sm:text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Conserva tu número actual (+52)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Sin contratos forzosos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Factura fiscal CFDI 4.0</span>
            </span>
          </div>
        </div>

        {/* Live Call & Triage Simulation Card */}
        <div className="mt-14 max-w-3xl mx-auto bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-sm relative">
          
          {/* Header of Call Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base">Llamada entrante: Clínica Sonrisas Polanco</h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    En Vivo
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Línea +52 (55) 4912-8830 • Latencia de respuesta: <span className="tabular-nums font-semibold text-slate-800">520 ms</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-mono font-bold text-slate-700 tabular-nums">00:38</span>
            </div>
          </div>

          {/* Dialogue Snippets */}
          <div className="mt-5 space-y-3.5">
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                P
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-800 max-w-lg">
                <span className="text-[11px] font-bold text-slate-500 block mb-0.5">Carlos Mendoza (Paciente)</span>
                «Buenas tardes, tengo un dolor muy fuerte y punzante en una muela desde ayer y se me inflamó la encía, ¿tienen lugar hoy?»
              </div>
            </div>

            <div className="flex gap-3 items-start justify-end">
              <div className="bg-teal-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-lg shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[11px] font-bold text-teal-100">Sofía (IA AsistentePro)</span>
                  <span className="text-[10px] bg-teal-700 text-teal-100 px-1.5 py-0.5 rounded font-mono">Voz Twilio +52</span>
                </div>
                «¡Hola Carlos, lamento mucho el dolor! Por los síntomas lo clasificamos como urgencia prioritaria. El Dr. David Alarcón, especialista maxilofacial, tiene un espacio de sobrecupo hoy a las 5:30 PM en Polanco. ¿Te reservo este horario de inmediato?»
              </div>
              <div className="w-7 h-7 rounded-full bg-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                IA
              </div>
            </div>
          </div>

          {/* Footer of Call Card */}
          <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 font-medium">
              <HeartPulse className="w-3.5 h-3.5" />
              <span>Triaje: Urgencia Dental Nivel 2 • Notificación enviada a recepción</span>
            </div>
            <div className="text-slate-500">
              Sincronizado con Google Calendar & WhatsApp
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {metrics.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-xl p-6 border border-slate-200 hover:border-teal-400 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    México
                  </span>
                </div>

                <div className="text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                  {item.value}
                </div>
                <div className="text-sm font-bold text-slate-800 mt-1">
                  {item.label}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Official Partners & Technology */}
        <div className="mt-14 pt-8 border-t border-slate-200">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">
            Infraestructura médica de confianza y estándares oficiales
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-slate-600 text-xs sm:text-sm font-semibold">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>WhatsApp Cloud API Oficial</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
              <span>Twilio SIP Trunking (+52)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
              <span>Mercado Pago México</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span>Google Calendar</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-700"></span>
              <span>Cumplimiento NOM-004-SSA3</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
