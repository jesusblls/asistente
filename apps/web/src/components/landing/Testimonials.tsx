import { 
  Star, 
  Quote, 
  MapPin, 
  CheckCircle2, 
  Building2, 
  TrendingUp, 
  ShieldCheck,
  Sparkles
} from 'lucide-react';

export function Testimonials() {
  const testimonials = [
    {
      name: 'Dr. Alejandro Morales',
      title: 'Director Clínico y Fundador',
      clinic: 'Clínica Odontológica Sonrisas Polanco',
      location: 'Polanco, Ciudad de México (CDMX)',
      avatarInitials: 'AM',
      avatarBg: 'bg-teal-700',
      rating: 5,
      impact: '+$52,000 MXN / mes recuperados',
      quote:
        'Antes perdíamos 3 de cada 10 pacientes porque llamaban mientras estábamos atendiendo en el sillón dental o fuera de horario. En el primer mes con AsistentePro recuperamos más de $52,000 pesos en citas que antes se iban con otra clínica. Lo más impresionante es que contesta con acento mexicano cálido y nadie nota que es una IA.',
      highlight: 'Reducción de 84% en citas perdidas',
    },
    {
      name: 'Dra. Marcela Garza Treviño',
      title: 'Dermatóloga y Directora Médica',
      clinic: 'DermoSkin Instituto Dermatológico',
      location: 'San Pedro Garza García, Monterrey, N.L.',
      avatarInitials: 'MG',
      avatarBg: 'bg-emerald-700',
      rating: 5,
      impact: '98.5% tasa de asistencia',
      quote:
        'El Escudo Anti-Inasistencias con Mercado Pago eliminó por completo los "no-shows" de pacientes que apartaban y nos dejaban el espacio vacío. Los pacientes adoran que les respondemos al instante a las 11 de la noche por WhatsApp con la preparación exacta para su procedimiento láser.',
      highlight: 'Cero espacios vacíos por inasistencia',
    },
    {
      name: 'Dr. Roberto Villaseñor S.',
      title: 'Coordinador de Especialidades Médicas',
      clinic: 'Centro Médico Providencia',
      location: 'Colonia Providencia, Guadalajara, Jalisco',
      avatarInitials: 'RV',
      avatarBg: 'bg-indigo-700',
      rating: 5,
      impact: '3.5 hrs/día ahorradas en recepción',
      quote:
        'Nuestras recepcionistas estaban abrumadas contestando el teléfono y respondiendo las mismas dudas de precios y horarios. Con el Modo Copiloto, la IA atiende el 75% del volumen repetitivo y nuestro personal se dedica a consentir a los pacientes que están físicamente en la sala de espera.',
      highlight: 'Personal de recepción mucho más feliz',
    },
  ];

  return (
    <section id="testimonios" className="py-20 md:py-28 bg-slate-900 text-white relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Clínicas líderes en CDMX, Monterrey y Guadalajara{' '}
            <span className="text-teal-400">
              confían en AsistentePro
            </span>
          </h2>

          <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed">
            Descubre cómo médicos y directores clínicos transformaron su atención a pacientes, eliminaron inasistencias y multiplicaron la facturación de sus consultorios.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {testimonials.map((item, index) => (
            <div
              key={index}
              className="bg-slate-800/90 rounded-3xl p-8 border border-slate-700/80 hover:border-teal-500/50 shadow-xl flex flex-col justify-between transition-all group"
            >
              <div>
                {/* Top: Stars & City Badge */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(item.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>

                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-800/60 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Clínica Verificada</span>
                  </span>
                </div>

                {/* Highlight Badge */}
                <div className="mb-4 inline-block bg-teal-950/80 border border-teal-800/60 text-teal-300 text-xs font-bold px-3 py-1 rounded-lg">
                  {item.impact}
                </div>

                {/* Quote */}
                <p className="text-slate-200 text-sm leading-relaxed mb-6 italic">
                  «{item.quote}»
                </p>
              </div>

              {/* Doctor / Clinic Info Footer */}
              <div className="pt-5 border-t border-slate-700/80 flex items-center gap-3.5">
                <div className={`w-12 h-12 rounded-2xl ${item.avatarBg} flex items-center justify-center font-bold text-white text-base shadow-md shrink-0`}>
                  {item.avatarInitials}
                </div>

                <div className="min-w-0">
                  <h4 className="font-bold text-white text-sm leading-tight truncate">
                    {item.name}
                  </h4>
                  <p className="text-xs text-teal-400 font-medium truncate mt-0.5">
                    {item.clinic}
                  </p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                    <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{item.location}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Aggregate Credibility Banner */}
        <div className="mt-14 bg-slate-800/50 rounded-2xl p-6 border border-slate-700/60 max-w-4xl mx-auto flex flex-wrap items-center justify-around gap-6 text-center">
          <div>
            <div className="text-2xl font-extrabold text-white">4.9 / 5.0</div>
            <div className="text-xs text-slate-400 mt-0.5">Calificación promedio en clínicas</div>
          </div>
          <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <div className="text-2xl font-extrabold text-teal-400">&lt; 15 min</div>
            <div className="text-xs text-slate-400 mt-0.5">Tiempo promedio de instalación</div>
          </div>
          <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-400">99.9%</div>
            <div className="text-xs text-slate-400 mt-0.5">Disponibilidad de conmutador</div>
          </div>
        </div>

      </div>
    </section>
  );
}
