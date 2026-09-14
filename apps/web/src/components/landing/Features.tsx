import { 
  PhoneCall, 
  MessageSquare, 
  Stethoscope, 
  ShieldCheck, 
  Users, 
  CalendarSync, 
  CheckCircle2, 
  Zap, 
  ArrowRight,
  Headphones,
  Lock,
  Clock,
  Sparkles
} from 'lucide-react';

export function Features() {
  const featuresList = [
    {
      title: 'Llamadas Naturales con Twilio México (+52)',
      tagline: 'Telefonía con latencia <600ms y acento mexicano cálido',
      description:
        'Conecta tu línea telefónica fija o celular actual (Telmex, Totalplay, Izzi, Telcel). La IA contesta al primer timbrado con entonación humana, atiende dudas complejas y agenda citas sin hacer esperar al paciente.',
      icon: PhoneCall,
      color: 'from-teal-500 to-emerald-600',
      badge: 'Voz Twilio SIP',
      bulletPoints: [
        'Conserva tu mismo número telefónico mexicano (+52)',
        'Respuesta instantánea sin silencios incómodos (<600ms)',
        'Transferencia asistida a recepción o doctor en casos especiales',
        'Grabación y transcripción médica automática en el dashboard',
      ],
    },
    {
      title: 'WhatsApp Cloud API Oficial de Meta',
      tagline: 'Cero riesgo de baneo y verificación oficial de negocio',
      description:
        'Operamos directamente con los servidores de Meta WhatsApp Business Cloud API. Respuestas instantáneas en el canal favorito del 96% de los pacientes en México, enviando ubicaciones en Google Maps y confirmaciones interactivas.',
      icon: MessageSquare,
      color: 'from-emerald-500 to-teal-600',
      badge: 'Meta Certified',
      bulletPoints: [
        'Infraestructura oficial Meta Cloud API sin riesgo de bloqueo',
        'Envío interactivo de tarjetas de cita con botones de confirmación',
        'Recordatorios automáticos a las 24 horas y 2 horas de la cita',
        'Soporte para compartir ubicación, guías de preparación y recetas',
      ],
    },
    {
      title: 'Triaje Médico & Dental Especializado',
      tagline: 'Clasificación de urgencias y preguntas de descarte',
      description:
        'Algoritmos clínicos entrenados para identificar síntomas de alarma: dolor agudo, hemorragias, infecciones o traumatismos. Prioriza citas urgentes en espacios de sobrecupo y alerta al médico en turno.',
      icon: Stethoscope,
      color: 'from-rose-500 to-red-600',
      badge: 'Criterio Clínico',
      bulletPoints: [
        'Detección automática de urgencias vs. procedimientos electivos',
        'Preguntas previas de descarte (alergias, medicamentos, dolor)',
        'Notificación instantánea a recepción ante casos graves',
        'Canalización directa con el especialista adecuado según síntoma',
      ],
    },
    {
      title: 'Escudo Anti-Inasistencias con Mercado Pago',
      tagline: 'Cobra anticipos seguros y reduce el 80% de los No-Shows',
      description:
        'Las clínicas en México pierden hasta el 35% de sus ingresos por pacientes que no asisten. AsistentePro genera links seguros de Mercado Pago para apartar la cita ($200 - $500 MXN) vía tarjeta, SPEI o transferencias.',
      icon: ShieldCheck,
      color: 'from-amber-500 to-yellow-600',
      badge: 'No-Show Shield',
      bulletPoints: [
        'Links automáticos de pago vía Mercado Pago o SPEI',
        'Acreditación directa a la cuenta bancaria de tu clínica',
        'Disminuye el ausentismo de un 30% a menos del 5%',
        'Reprogramación automática de citas si el paciente avisa a tiempo',
      ],
    },
    {
      title: 'Modo Copiloto para Recepcionistas',
      tagline: 'Superpoderes para tu equipo de recepción existente',
      description:
        'La IA no reemplaza al personal humano: lo potencia. Tu recepcionista monitorea todas las conversaciones en vivo desde una bandeja unificada, recibe sugerencias de respuesta en 1 clic y puede tomar el control cuando lo desee.',
      icon: Users,
      color: 'from-teal-700 to-slate-800',
      badge: 'Colaboración Humano + IA',
      bulletPoints: [
        'Bandeja omnicanal unificada (WhatsApp, Teléfono, Messenger)',
        'Sugerencias inteligentes de respuesta en un solo clic',
        'Modo "Pausa IA" con intervención humana en tiempo real',
        'Historial clínico previo del paciente visible en pantalla',
      ],
    },
    {
      title: 'Sincronización Bidireccional de Agenda',
      tagline: 'Google Calendar, Outlook y software médico en tiempo real',
      description:
        'Cero riesgo de empalmes o dobles reservas. La recepcionista con IA consulta la disponibilidad exacta de cada doctor, respetando tiempos de comida, desinfección de consultorio (buffers) y quirófanos disponibles.',
      icon: CalendarSync,
      color: 'from-sky-600 to-teal-800',
      badge: 'Sync 2-Vías',
      bulletPoints: [
        'Conexión nativa con Google Calendar, Cal.com y Microsoft 365',
        'Respeto de buffers de tiempo entre consultas (ej: 10 min)',
        'Múltiples sucursales y agendas de doctores independientes',
        'Cancelaciones y reagendas reflejadas al instante en tu celular',
      ],
    },
  ];

  return (
    <section id="caracteristicas" className="py-20 md:py-28 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Todo lo que tu clínica necesita para{' '}
            <span className="text-teal-700">
              llenar tu agenda sin esfuerzo
            </span>
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Combinamos telefonía avanzada mexicana, la API oficial de WhatsApp y motores de triaje médico para garantizar una experiencia de paciente impecable y una tasa de asistencia superior al 95%.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuresList.map((feat, index) => {
            const Icon = feat.icon;
            return (
              <div
                key={index}
                className="bg-slate-50/80 rounded-3xl p-7 sm:p-8 border border-slate-200/90 hover:border-teal-400 hover:shadow-xl hover:shadow-teal-600/5 transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar: Icon + Badge */}
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${feat.color} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform duration-200`}>
                      <Icon className="w-7 h-7" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-xs">
                      {feat.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 leading-snug mb-1">
                    {feat.title}
                  </h3>
                  <div className="text-xs font-semibold text-teal-700 mb-3">
                    {feat.tagline}
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    {feat.description}
                  </p>
                </div>

                {/* Bullet Points */}
                <div className="pt-5 border-t border-slate-200/80 space-y-2.5">
                  {feat.bulletPoints.map((point, pIdx) => (
                    <div key={pIdx} className="flex items-start gap-2 text-xs text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Deep Dive Callout Banner */}
        <div className="mt-16 bg-gradient-to-r from-teal-900 via-slate-900 to-slate-950 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold mb-3 border border-teal-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Compatibilidad Total con la Normatividad Mexicana</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
                Seguridad de datos de pacientes conforme a la NOM-004-SSA3 y LFPDPPP
              </h3>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Toda la información médica, citas y audios se procesan con cifrado de grado militar (AES-256) en tránsito y reposo. Los datos pertenecen exclusivamente a tu clínica y jamás se utilizan para entrenar modelos públicos.
              </p>
            </div>

            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3 justify-end">
              <a
                href="#demo"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-md transition-all text-sm"
              >
                <span>Ver demostración en vivo</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <div className="text-center text-xs text-slate-400">
                Instalación guiada por ingenieros de soporte en México
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
