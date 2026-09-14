'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle, Sparkles, PhoneCall, ShieldCheck } from 'lucide-react';

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: '¿Cómo funciona la conexión con el número telefónico actual de mi clínica en México?',
      a: 'Es muy sencillo: no necesitas cambiar tu número de teléfono actual (+52). Configuramos un desvío condicional de llamadas (call forwarding) desde tu proveedor de telefonía (Telmex, Totalplay, Izzi, Telcel o Axtel). Si tu recepcionista está ocupada o llaman fuera de horario comercial, la llamada se transfiere automáticamente a AsistentePro en menos de medio segundo.',
    },
    {
      q: '¿Los pacientes se dan cuenta de que están hablando con una Inteligencia Artificial?',
      a: 'Nuestra tecnología de voz sobre Twilio SIP Trunking opera con latencia sub-600ms y síntesis de voz ultra-natural con acento y modismos de cortesía mexicanos («Con mucho gusto le agendo», «Permítame consultar la agenda de la doctora»). El 94% de los pacientes cree que está hablando con una recepcionista humana en el consultorio.',
    },
    {
      q: '¿Cómo funciona el Escudo Anti-Inasistencias con Mercado Pago?',
      a: 'Cuando un paciente solicita una cita, el sistema genera automáticamente un enlace de cobro de anticipo ($200 a $500 MXN) vía Mercado Pago. El paciente puede pagar con tarjeta de crédito, débito, transferencia SPEI o dinero en cuenta. El dinero se deposita directamente en la cuenta bancaria de tu clínica. Esto reduce las inasistencias (no-shows) de un 30% a menos del 5%.',
    },
    {
      q: '¿Qué sucede si un paciente llama con una urgencia médica o dental severa?',
      a: 'El motor de triaje clínico de AsistentePro está entrenado para identificar palabras y síntomas de alarma (dolor insoportable, traumatismo, hemorragias o fiebres altas). En esos casos, el sistema prioriza el caso con alerta roja, asigna espacios de sobrecupo de emergencia y envía una notificación instantánea al WhatsApp del doctor en guardia.',
    },
    {
      q: '¿Pueden mis recepcionistas intervenir en la llamada o conversación de WhatsApp?',
      a: '¡Por supuesto! El "Modo Copiloto" está diseñado para apoyar a tu equipo humano, no para reemplazarlo. Desde el panel web, cualquier miembro de tu clínica puede ver las conversaciones en vivo, pausar la IA con un clic y continuar la atención de manera humana sin interrupciones.',
    },
    {
      q: '¿Cumplen con la legislación de datos personales y salud en México (LFPDPPP y NOM-004)?',
      a: 'Absolutamente. Toda la información de pacientes, citas y transacciones está cifrada bajo estándares bancarios AES-256. Cumplimos estrictamente con la Ley Federal de Protección de Datos Personales en Posesión de Particulares (LFPDPPP) y los lineamientos de confidencialidad del expediente clínico NOM-004-SSA3. Tus datos nunca se comparten con terceros.',
    },
    {
      q: '¿Necesito ingresar mi tarjeta de crédito para la prueba gratis de 14 días?',
      a: 'No. Puedes activar tu prueba gratuita de 14 días sin ingresar ninguna tarjeta de crédito. Tendrás acceso al panel completo, conmutador de prueba y simulador de WhatsApp para comprobar los resultados antes de tomar una decisión.',
    },
  ];

  return (
    <section id="faq" className="py-20 md:py-28 bg-slate-50 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Preguntas Frecuentes de{' '}
            <span className="text-teal-700">
              Médicos y Directores Clínicos
            </span>
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Todo lo que necesitas saber sobre la integración técnica, legalidad, costos y funcionamiento diario en México.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 focus:outline-none focus:bg-slate-50 transition-colors"
                >
                  <span className="font-bold text-slate-900 text-base sm:text-lg leading-snug">
                    {faq.q}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? 'bg-teal-100 text-teal-700 rotate-180' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-sm sm:text-base text-slate-600 leading-relaxed border-t border-slate-100 animate-in fade-in duration-200">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Still have questions banner */}
        <div className="mt-14 bg-teal-50 border border-teal-200/80 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-slate-900 text-base mb-1">
            ¿Tienes dudas específicas sobre tu software médico o especialidad?
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mb-4">
            Nuestro equipo clínico de soporte en CDMX puede responderte de inmediato vía WhatsApp.
          </p>
          <a
            href="https://wa.me/525592254321?text=Hola,%20tengo%20dudas%20sobre%20AsistentePro%20para%20mi%20cl%C3%ADnica"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs sm:text-sm shadow-md transition-all"
          >
            <span>Hablar con un Asesor Clínico (+52)</span>
          </a>
        </div>

      </div>
    </section>
  );
}
