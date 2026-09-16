import { 
  Star, 
  MapPin, 
  CheckCircle2, 
  Building2 
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
        'Antes perdíamos 3 de cada 10 pacientes porque llamaban mientras estábamos atendiendo en el sillón dental o fuera de horario. En el primer mes con AsistentePro recuperamos más de $52,000 pesos en citas que antes se iban con otra clínica. Contesta con acento mexicano cálido y nadie nota que es una IA.',
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
        'El Escudo Anti-Inasistencias con Mercado Pago eliminó por completo los "no-shows" de pacientes que apartaban y dejaban el espacio vacío. Los pacientes adoran que les respondemos al instante a las 11 de la noche por WhatsApp con la preparación exacta para su procedimiento láser.',
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
        'Nuestras recepcionistas estaban abrumadas contestando el teléfono y respondiendo las mismas dudas de precios y horarios. Con el Modo Copiloto, la IA atiende el 75% del volumen repetitivo y nuestro personal se dedica a consentir a los pacientes que están físicamente en sala de espera.',
      highlight: 'Personal de recepción sin estrés',
    },
  ];

  return (
    <section id="testimonios" className="py-20 md:py-28 bg-slate-900 text-white border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Clínicas en CDMX, Monterrey y Guadalajara confían en AsistentePro
          </h2>

          <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed">
            Médicos y directores clínicos que transformaron su atención a pacientes, eliminaron inasistencias y multiplicaron la ocupación de sus consultorios.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {testimonials.map((item, index) => (
            <div
              key={index}
              className="bg-slate-800/80 rounded-2xl p-7 border border-slate-700 flex flex-col justify-between"
            >
              <div>
                {/* Stars and Verification Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(item.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>

                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Verificado</span>
                  </span>
                </div>

                {/* Impact Highlight */}
                <div className="mb-4 inline-block bg-teal-950 border border-teal-800/80 text-teal-300 text-xs font-bold px-3 py-1 rounded-lg">
                  {item.impact}
                </div>

                {/* Quote */}
                <p className="text-slate-200 text-sm leading-relaxed mb-6 italic">
                  «{item.quote}»
                </p>
              </div>

              {/* Author Footer */}
              <div className="pt-4 border-t border-slate-700/80 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl ${item.avatarBg} flex items-center justify-center font-bold text-white text-sm shrink-0`}>
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

        {/* Credibility Counter Banner */}
        <div className="mt-14 bg-slate-800/60 rounded-2xl p-6 border border-slate-700 max-w-4xl mx-auto flex flex-wrap items-center justify-around gap-6 text-center">
          <div>
            <div className="text-2xl font-extrabold text-white tabular-nums">4.9 / 5.0</div>
            <div className="text-xs text-slate-400 mt-0.5">Calificación promedio de pacientes</div>
          </div>
          <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <div className="text-2xl font-extrabold text-teal-400 tabular-nums">&lt; 15 min</div>
            <div className="text-xs text-slate-400 mt-0.5">Tiempo promedio de instalación</div>
          </div>
          <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-400 tabular-nums">99.9%</div>
            <div className="text-xs text-slate-400 mt-0.5">Disponibilidad de línea telefónica</div>
          </div>
        </div>

      </div>
    </section>
  );
}
