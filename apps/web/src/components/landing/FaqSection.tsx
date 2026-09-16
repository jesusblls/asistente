'use client';

import { useState } from 'react';
import { ChevronDown, MessageSquare, PhoneCall, ShieldCheck } from 'lucide-react';

type FaqCategory = 'TODAS' | 'TELEFONIA' | 'ANTICIPOS' | 'LEGAL';

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [activeCategory, setActiveCategory] = useState<FaqCategory>('TODAS');

  const faqs = [
    {
      category: 'TELEFONIA' as const,
      q: '¿Cómo funciona la conexión con el número telefónico actual de mi clínica en México?',
      a: 'Es muy sencillo: no necesitas cambiar tu número de teléfono actual (+52). Configuramos un desvío condicional de llamadas (call forwarding) desde tu proveedor de telefonía (Telmex, Totalplay, Izzi, Telcel o Axtel). Si tu recepcionista está ocupada o llaman fuera de horario comercial, la llamada se transfiere automáticamente a AsistentePro en menos de medio segundo.',
    },
    {
      category: 'TELEFONIA' as const,
      q: '¿Los pacientes notan que están hablando con una Inteligencia Artificial?',
      a: 'Nuestra tecnología de voz sobre Twilio SIP Trunking opera con latencia inferior a 600ms y síntesis de voz natural con acento y modismos de cortesía mexicanos («Con mucho gusto le agendo», «Permítame consultar la agenda de la doctora»). El 94% de los pacientes cree que está hablando con una recepcionista humana en el consultorio.',
    },
    {
      category: 'ANTICIPOS' as const,
      q: '¿Cómo funciona el Escudo Anti-Inasistencias con Mercado Pago?',
      a: 'Cuando un paciente solicita una cita, el sistema genera automáticamente un enlace de cobro de anticipo ($200 a $500 MXN) vía Mercado Pago. El paciente puede pagar con tarjeta de crédito, débito, transferencia SPEI o depósito en OXXO. El dinero se deposita directamente en la cuenta bancaria de tu clínica. Esto reduce las inasistencias de un 30% a menos del 5%.',
    },
    {
      category: 'LEGAL' as const,
      q: '¿Qué sucede si un paciente llama con una urgencia médica o dental severa?',
      a: 'El motor de triaje clínico de AsistentePro está entrenado para identificar palabras y síntomas de alarma (dolor insoportable, traumatismo, hemorragias o fiebres altas). En esos casos, el sistema prioriza el caso con alerta roja, asigna espacios de sobrecupo de emergencia y envía una notificación instantánea al WhatsApp del doctor en guardia.',
    },
    {
      category: 'TELEFONIA' as const,
      q: '¿Pueden mis recepcionistas intervenir en la llamada o conversación de WhatsApp?',
      a: '¡Por supuesto! El "Modo Copiloto" está diseñado para apoyar a tu equipo humano, no para reemplazarlo. Desde el panel web, cualquier miembro de tu clínica puede ver las conversaciones en vivo, pausar la IA con un clic y continuar la atención de manera humana sin interrupciones.',
    },
    {
      category: 'LEGAL' as const,
      q: '¿Cumplen con la legislación de datos personales y salud en México (LFPDPPP y NOM-004)?',
      a: 'Absolutamente. Toda la información de pacientes, citas y transacciones está cifrada bajo estándares bancarios AES-256. Cumplimos estrictamente con la Ley Federal de Protección de Datos Personales en Posesión de Particulares (LFPDPPP) y los lineamientos de confidencialidad del expediente clínico NOM-004-SSA3. Tus datos nunca se comparten con terceros.',
    },
    {
      category: 'ANTICIPOS' as const,
      q: '¿Emiten factura fiscal mexicana con CFDI 4.0 deducible?',
      a: 'Sí. Todos nuestros planes emiten factura fiscal mexicana automática con CFDI 4.0 y desglose de IVA para que tu contador pueda deducirla al 100% como gasto operativo de tu consultorio.',
    },
    {
      category: 'ANTICIPOS' as const,
      q: '¿Necesito ingresar mi tarjeta de crédito para la prueba gratis de 14 días?',
      a: 'No. Puedes activar tu prueba gratuita de 14 días sin ingresar ninguna tarjeta de crédito. Tendrás acceso al panel completo, conmutador de prueba y simulador de WhatsApp para comprobar los resultados antes de tomar una decisión.',
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
            Todo lo que necesitas saber sobre la integración técnica, legalidad, costos y funcionamiento diario en México.
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
              Anticipos & Facturación CFDI
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
              Seguridad & Triaje (NOM-004)
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
            ¿Tienes alguna pregunta sobre tu conmutador o software médico?
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            Nuestro equipo de soporte técnico clínico en Ciudad de México puede asesorarte de inmediato por WhatsApp.
          </p>
          <div className="pt-1">
            <a
              href="https://wa.me/525549128830?text=Hola,%20tengo%20dudas%20sobre%20AsistentePro%20para%20mi%20cl%C3%ADnica"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm transition-colors"
            >
              <span>Hablar con un Asesor Clínico (+52)</span>
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
