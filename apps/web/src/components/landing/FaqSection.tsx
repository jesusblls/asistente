'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { PLANS, TRIAL_DURATION_DAYS } from '@asistente/shared-types';

type FaqCategory = 'TODAS' | 'TELEFONIA' | 'ANTICIPOS' | 'LEGAL';

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [activeCategory, setActiveCategory] = useState<FaqCategory>('TODAS');

  const faqs = [
    {
      category: 'TELEFONIA' as const,
      q: '¿Cómo funciona la conexión con el número telefónico actual de mi clínica en México?',
      a: 'No necesitas cambiar tu número de teléfono actual (+52). Se configura un desvío condicional de llamadas (call forwarding) desde tu proveedor de telefonía hacia la línea de AsistentePro. Si tu recepcionista está ocupada o llaman fuera de horario, la llamada pasa a la IA. La telefonía de voz está incluida en los planes Clínica Pro y Cadenas & Hospitales.',
    },
    {
      category: 'TELEFONIA' as const,
      q: '¿Los pacientes notan que están hablando con una Inteligencia Artificial?',
      a: 'La voz opera sobre Twilio Voice con una meta de respuesta inferior a 600 ms, voz natural y modismos de cortesía mexicanos («Con mucho gusto le agendo», «Permítame consultar la agenda de la doctora»), y el paciente puede interrumpirla en cualquier momento. Si el paciente prefiere hablar con una persona, puede pedir que lo comuniquen con recepción.',
    },
    {
      category: 'ANTICIPOS' as const,
      q: '¿Cómo funciona el Escudo Anti-Inasistencias con Mercado Pago?',
      a: 'Para los servicios que tú marques con anticipo (por ejemplo, $200 a $500 MXN), al agendar el sistema genera un enlace de pago de Mercado Pago y la cita queda con el anticipo pendiente. Cuando Mercado Pago confirma el pago, la cita pasa a pagada automáticamente y el paciente recibe su confirmación por WhatsApp. Un paciente que ya pagó tiene mucho más compromiso de asistir.',
    },
    {
      category: 'LEGAL' as const,
      q: '¿Qué sucede si un paciente llama con una urgencia médica o dental severa?',
      a: 'El motor de triaje identifica síntomas de alarma. Ante una emergencia vital (dificultad para respirar, dolor en el pecho, hemorragia que no para, pérdida de conocimiento) NO intenta agendar: indica llamar al 911 o acudir a urgencias de inmediato y pasa la conversación a tu equipo. Ante una urgencia dental aguda (dolor intenso, absceso, diente roto) recomienda atención prioritaria el mismo día con indicaciones preventivas.',
    },
    {
      category: 'TELEFONIA' as const,
      q: '¿Pueden mis recepcionistas intervenir en la llamada o conversación de WhatsApp?',
      a: '¡Por supuesto! El "Modo Copiloto" está diseñado para apoyar a tu equipo humano, no para reemplazarlo. Desde el panel web, cualquier miembro de tu clínica puede ver las conversaciones en vivo, pausar la IA con un clic y continuar la atención de manera humana sin interrupciones.',
    },
    {
      category: 'LEGAL' as const,
      q: '¿Cómo protegen los datos de mis pacientes?',
      a: 'Toda la comunicación viaja por HTTPS, las contraseñas se guardan con hash y las credenciales de tus canales (WhatsApp, Twilio) se almacenan cifradas. Cada clínica está aislada: nadie de otra clínica puede ver tus pacientes ni tus citas. Además, cada acceso y cambio del personal sobre expedientes, citas y conversaciones queda en una bitácora de auditoría que no se puede editar ni borrar. El tratamiento de datos personales se describe en nuestro Aviso de Privacidad.',
    },
    {
      category: 'ANTICIPOS' as const,
      q: `¿Necesito ingresar mi tarjeta de crédito para la prueba gratis de ${TRIAL_DURATION_DAYS} días?`,
      a: `No. Puedes activar tu prueba gratuita de ${TRIAL_DURATION_DAYS} días sin ingresar ninguna tarjeta. Durante la prueba tienes acceso al panel, hasta ${PLANS.trial.limits.maxAppointmentsPerMonth} citas y ${PLANS.trial.limits.includedVoiceMinutes} minutos de voz para comprobar los resultados antes de elegir un plan.`,
    },
  ];

  const filteredFaqs = activeCategory === 'TODAS'
    ? faqs
    : faqs.filter(f => f.category === activeCategory);

  return (
    <section id="faq" className="py-20 md:py-28 bg-slate-50 border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Preguntas Frecuentes de Médicos y Directores Clínicos
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Lo que necesitas saber sobre la integración técnica, la seguridad, los costos y el funcionamiento diario en México.
          </p>

          {/* Category Filter Chips */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => { setActiveCategory('TODAS'); setOpenIndex(0); }}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                activeCategory === 'TODAS'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Todas las preguntas
            </button>
            <button
              type="button"
              onClick={() => { setActiveCategory('TELEFONIA'); setOpenIndex(0); }}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                activeCategory === 'TELEFONIA'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Telefonía & WhatsApp (+52)
            </button>
            <button
              type="button"
              onClick={() => { setActiveCategory('ANTICIPOS'); setOpenIndex(0); }}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                activeCategory === 'ANTICIPOS'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Anticipos & Planes
            </button>
            <button
              type="button"
              onClick={() => { setActiveCategory('LEGAL'); setOpenIndex(0); }}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                activeCategory === 'LEGAL'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Seguridad & Triaje
            </button>
          </div>
        </div>

        {/* Accordion List */}
        <div className="space-y-3.5">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 focus:outline-none focus:bg-slate-50 transition-colors"
                >
                  <span className="font-bold text-slate-900 text-base leading-snug">
                    {faq.q}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 ${
                      isOpen ? 'bg-teal-100 text-teal-700 rotate-180' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-sm text-slate-600 leading-relaxed border-t border-slate-100">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Support Banner */}
        <div className="mt-12 bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <h3 className="font-bold text-slate-900 text-base">
            ¿Prefieres comprobarlo tú mismo?
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            Prueba el simulador como si fueras un paciente, o crea la cuenta de tu clínica y úsala {TRIAL_DURATION_DAYS} días sin tarjeta.
          </p>
          <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm transition-colors"
            >
              <span>Crear cuenta de prueba</span>
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm transition-colors"
            >
              <span>Probar el simulador</span>
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
