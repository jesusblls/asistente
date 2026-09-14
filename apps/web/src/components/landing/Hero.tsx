import Link from 'next/link';
import { 
  PhoneCall, 
  MessageSquare, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  CalendarCheck, 
  ArrowRight, 
  Star, 
  CheckCircle2, 
  Play,
  Clock,
  HeartPulse
} from 'lucide-react';

export function Hero() {
  const metrics = [
    {
      value: '+150,000',
      label: 'Citas Agendadas',
      description: 'En consultorios y clínicas de México',
      icon: CalendarCheck,
      color: 'text-teal-600 bg-teal-50 border-teal-200/70',
    },
    {
      value: '99.4%',
      label: 'Satisfacción de Pacientes',
      description: 'Atención cálida, humana e inmediata',
      icon: Star,
      color: 'text-amber-600 bg-amber-50 border-amber-200/70',
    },
    {
      value: '< 600 ms',
      label: 'Latencia Telefónica',
      description: 'Respuesta en tiempo real vía Twilio +52',
      icon: Zap,
      color: 'text-blue-600 bg-blue-50 border-blue-200/70',
    },
    {
      value: '-80%',
      label: 'Menos Inasistencias',
      description: 'Con anticipos en Mercado Pago y alertas 2h',
      icon: ShieldCheck,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200/70',
    },
  ];

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-16 md:pb-28 bg-white border-b border-slate-200/80">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Status Pill */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900 text-slate-200 text-xs sm:text-sm font-medium mb-8 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-semibold">Tecnología Especializada:</span>
            <span className="text-teal-400 font-medium">Voz Natural Mexicana (+52) y WhatsApp Oficial</span>
          </div>
        </div>

        {/* Main Headline */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
            La recepcionista con IA que{' '}
            <span className="text-teal-700 underline decoration-teal-300/60 underline-offset-8">
              contesta tus llamadas en México
            </span>{' '}
            y agenda citas 24/7.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto font-normal">
            No vuelvas a perder un paciente por una llamada no contestada. <strong className="text-slate-900 font-semibold">AsistentePro Clínicas</strong> atiende tu teléfono fijo o celular (+52) con voz humana, clasifica el triaje médico o dental, y confirma citas con anticipo en Mercado Pago.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-lg shadow-teal-600/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Probar Simulador Interactivo</span>
            </a>

            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 rounded-xl border border-slate-300 shadow-sm transition-all hover:border-slate-400"
            >
              <span>Ver Dashboard en Vivo</span>
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </Link>
          </div>

          {/* Micro assurances */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs sm:text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Sin contratos forzosos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Conserva tu número actual (+52)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Instalación en menos de 15 minutos</span>
            </span>
          </div>
        </div>

        {/* Live Floating Call Simulation Card in Hero */}
        <div className="mt-14 max-w-3xl mx-auto bg-white rounded-2xl p-6 sm:p-7 shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/10 relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-600/20">
                <PhoneCall className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base">Llamada en curso: Clínica Dental Polanco</h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    En Vivo
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Número entrante: +52 55 4912 8830 • Latencia: <span className="tabular-nums font-medium text-slate-700">540ms</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums">00:42</span>
            </div>
          </div>

          {/* Mini dialogue snippets */}
          <div className="mt-5 space-y-3">
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                P
              </div>
              <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-800 max-w-lg">
                <span className="text-[11px] font-bold text-slate-500 block mb-0.5">Paciente (Carlos M.)</span>
                «Buenas tardes, ¿tienen espacio mañana para una limpieza dental con la Dra. Sofía?»
              </div>
            </div>

            <div className="flex gap-3 items-start justify-end">
              <div className="bg-teal-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-lg shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[11px] font-bold text-teal-100">Sofía (IA AsistentePro)</span>
                  <span className="text-[10px] bg-teal-700 text-teal-100 px-1.5 py-0.5 rounded font-mono">Voz Twilio +52</span>
                </div>
                «¡Hola Carlos, buenas tardes! Claro que sí, la Dra. Sofía tiene disponible mañana a las 11:30 AM o a las 4:00 PM en nuestra sucursal Polanco. ¿Cuál horario te acomoda mejor?»
              </div>
              <div className="w-7 h-7 rounded-full bg-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                IA
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 text-teal-700 font-medium">
              <HeartPulse className="w-4 h-4" />
              <span>Triaje: Consulta Preventiva General</span>
            </div>
            <div className="text-slate-400">
              Sincronizado automáticamente con Google Calendar & WhatsApp
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
                className="bg-white rounded-xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-teal-300 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${item.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    México
                  </span>
                </div>

                <div className="text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                  {item.value}
                </div>
                <div className="text-sm font-semibold text-slate-800 mt-1">
                  {item.label}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Official Partners / Integrations Bar */}
        <div className="mt-14 pt-8 border-t border-slate-200/80">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400 mb-6">
            Tecnología médica integrada con los estándares de la industria
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 text-slate-500 text-sm font-semibold grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all">
            <div className="flex items-center gap-2 hover:text-teal-600 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>WhatsApp Cloud API (Oficial)</span>
            </div>
            <div className="flex items-center gap-2 hover:text-teal-600 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span>Twilio SIP Trunking México (+52)</span>
            </div>
            <div className="flex items-center gap-2 hover:text-teal-600 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
              <span>Mercado Pago No-Show Shield</span>
            </div>
            <div className="flex items-center gap-2 hover:text-teal-600 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span>Google Calendar & Cal.com</span>
            </div>
            <div className="flex items-center gap-2 hover:text-teal-600 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
              <span>NOM-004-SSA3 Salud</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
