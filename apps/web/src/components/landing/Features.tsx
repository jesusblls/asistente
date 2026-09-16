'use client';

import { useState } from 'react';
import { 
  PhoneCall, 
  MessageSquare, 
  Stethoscope, 
  ShieldCheck, 
  Users, 
  CalendarSync, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  HeartPulse,
  CreditCard,
  Building2,
  AlertTriangle,
  FileCheck
} from 'lucide-react';

export function Features() {
  const [activeTab, setActiveTab] = useState<'VOZ' | 'WHATSAPP' | 'TRIAJE' | 'ANTICIPOS' | 'COPILOTO'>('VOZ');

  return (
    <section id="soluciones" className="py-20 md:py-28 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Diseñado para resolver los puntos críticos de tu clínica en México
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Desde la llamada telefónica no contestada hasta el sillón médico vacío por inasistencia. Cada módulo está construido para brindar tranquilidad a tu equipo y calidez a tus pacientes.
          </p>
        </div>

        {/* Tab Navigation for Clinical Capabilities */}
        <div className="flex items-center justify-start md:justify-center overflow-x-auto pb-4 mb-10 gap-2 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('VOZ')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'VOZ'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <PhoneCall className="w-4 h-4" />
            <span>Telefonía Voz (+52)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('WHATSAPP')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'WHATSAPP'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>WhatsApp Oficial Meta</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('TRIAJE')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'TRIAJE'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Triaje en 3 Niveles</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ANTICIPOS')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'ANTICIPOS'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Escudo Anti-Inasistencia</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('COPILOTO')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'COPILOTO'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Modo Copiloto Humano</span>
          </button>
        </div>

        {/* Dynamic Interactive Tab Showcase */}
        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-10 transition-all">
          
          {/* TAB 1: TELEFONÍA EN VIVO */}
          {activeTab === 'VOZ' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 text-xs font-bold">
                  <PhoneCall className="w-3.5 h-3.5 text-sky-600" />
                  <span>Twilio SIP Trunking Sub-600ms</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Atiende hasta 50 llamadas simultáneas con voz mexicana natural
                </h3>

                <p className="text-slate-600 text-base leading-relaxed">
                  Conecta tu línea telefónica fija o celular actual (Telmex, Totalplay, Izzi, Telcel) sin cambiar de número. La IA contesta al primer timbrado con entonación humana y acento de México, resuelve dudas de tratamientos y agenda la cita directamente en la base de datos de tu clínica.
                </p>

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Conserva tu número actual (+52):</strong> Configuración simple mediante desvío de llamadas condicional.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Sin pausas incómodas:</strong> Latencia inferior a 600 ms con interrupción fluida cuando el paciente habla.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Grabación y transcripción médica:</strong> Cada llamada queda registrada en el expediente del paciente para consulta de recepción.</span>
                  </div>
                </div>
              </div>

              {/* Visual Card Mockup */}
              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold">
                      <PhoneCall className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Llamada Entrante Activa</div>
                      <div className="text-[11px] text-slate-500 font-mono">+52 (55) 7102-9912</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    01:14
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-slate-700 space-y-2 border border-slate-100">
                  <p className="font-semibold text-slate-900">Transcripción clínica en tiempo real:</p>
                  <p className="italic text-slate-600 leading-relaxed">
                    «Buenas tardes, hablo para saber si la Dra. Morales atiende urgencias de dolor dental hoy en Polanco...»
                  </p>
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                    <span className="text-teal-700 font-bold">Triaje: Urgencia Dental Nivel 2</span>
                    <span className="text-slate-400">Audio sub-600ms</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Operado vía Twilio SIP México</span>
                  <span className="text-emerald-700 font-semibold">Conexión Segura</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WHATSAPP CLOUD API */}
          {activeTab === 'WHATSAPP' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Meta WhatsApp Business Cloud API Oficial</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Atención oficial sin riesgo de bloqueo en el canal predilecto de México
                </h3>

                <p className="text-slate-600 text-base leading-relaxed">
                  El 96% de los pacientes en México prefiere agendar y recibir recordatorios por WhatsApp. Operamos directamente sobre los servidores oficiales de Meta Cloud API con cero riesgo de suspensión de tu línea comercial.
                </p>

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Tarjetas interactivas con botones:</strong> Confirmación en 1 clic, ubicación en Google Maps y pago de anticipo.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Recordatorios a las 24h y 2h antes:</strong> Solicitan confirmación de asistencia y liberan el horario si el paciente avisa que no podrá ir.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Envío de indicaciones previas:</strong> Instrucciones preoperatorias, ayuno o preparación según el procedimiento médico.</span>
                  </div>
                </div>
              </div>

              {/* Visual Card Mockup */}
              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
                <div className="bg-emerald-900 text-white rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold">
                      C
                    </div>
                    <div>
                      <div className="text-xs font-bold">Clínica Dental Polanco</div>
                      <div className="text-[10px] text-emerald-200">Cuenta de Empresa Oficial</div>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-800 text-emerald-100 px-2 py-0.5 rounded">Verificado</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-2 border border-slate-100 text-slate-800">
                  <p className="font-semibold text-slate-900">¡Tu cita ha sido agendada con éxito!</p>
                  <p className="text-slate-600">🗓 Mañana 4:00 PM • Dra. Sofía Morales</p>
                  <p className="text-slate-600">📍 Av. Pdte. Masaryk 101, Polanco V Secc, CDMX</p>
                  
                  <div className="pt-2 border-t border-slate-200 flex flex-col gap-1.5">
                    <button type="button" className="w-full py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-center text-[11px]">
                      Confirmar Asistencia (1 clic)
                    </button>
                    <button type="button" className="w-full py-1.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg text-center text-[11px]">
                      Ver Ubicación en Waze / Google Maps
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRIAJE CLÍNICO */}
          {activeTab === 'TRIAJE' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                  <Stethoscope className="w-3.5 h-3.5 text-rose-600" />
                  <span>Criterio Clínico NOM-024 & NOM-004</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Triaje clínico en 3 niveles que detecta emergencias en segundos
                </h3>

                <p className="text-slate-600 text-base leading-relaxed">
                  A diferencia de bots comerciales que agendan a ciegas, el motor clínico de AsistentePro evalúa la severidad de los síntomas para proteger la salud del paciente y la responsabilidad de tu consultorio.
                </p>

                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-white rounded-xl border border-rose-200 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                      1
                    </div>
                    <div>
                      <div className="text-xs font-bold text-rose-900">🚨 Nivel 1: Emergencia Vital (911)</div>
                      <p className="text-xs text-slate-600 mt-0.5">Dificultad respiratoria, dolor en pecho, traumatismo severo. NO agenda cita rutinaria: instruye acudir a urgencias de inmediato y alerta al personal.</p>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-amber-200 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                      2
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-900">⚠️ Nivel 2: Urgencia Médica o Dental Aguda</div>
                      <p className="text-xs text-slate-600 mt-0.5">Dolor insoportable (escala ≥ 7), flemón o infección. Ofrece sobrecupo prioritario el mismo día con especialista adecuado e indicaciones preventivas.</p>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-teal-200 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                      3
                    </div>
                    <div>
                      <div className="text-xs font-bold text-teal-900">📅 Nivel 3: Consulta General o Procedimiento Electivo</div>
                      <p className="text-xs text-slate-600 mt-0.5">Limpiezas, revisiones, valoraciones, ortodoncia. Proceso de agendamiento estándar en calendario con anticipo.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Card Mockup */}
              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Registro de Triaje Inmediato
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900">Dolor de muela severo (Escala 8/10)</span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-bold">Nivel 2</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Paciente describe inflamación y dolor punzante tras 24 horas. Derivado automáticamente con el Cirujano Maxilofacial en turno para espacio de 5:30 PM.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 flex items-center justify-between border border-slate-100">
                  <span>Alerta enviada a WhatsApp de Recepción</span>
                  <span className="text-emerald-600 font-bold">Entregado</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ESCUDO ANTI-INASISTENCIAS */}
          {activeTab === 'ANTICIPOS' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Mercado Pago México (No-Show Shield)</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Reduce hasta un 80% las inasistencias cobrando anticipos en pesos MXN
                </h3>

                <p className="text-slate-600 text-base leading-relaxed">
                  Las clínicas en México pierden hasta el 35% de sus ingresos por pacientes que no se presentan a su cita. AsistentePro genera links oficiales de cobro de anticipo ($200 a $500 MXN) que se acreditan directo a la cuenta bancaria de tu consultorio.
                </p>

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Múltiples métodos de pago:</strong> Tarjetas de crédito/débito, transferencias SPEI y depósitos en OXXO.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Depósito íntegro a tu banco:</strong> El dinero entra a la cuenta CLABE de tu clínica sin intermediarios sospechosos.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Política de cancelación respetuosa:</strong> Si el paciente avisa con más de 12 horas, el saldo se aplica a su reprogramación.</span>
                  </div>
                </div>
              </div>

              {/* Visual Card Mockup */}
              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-bold text-slate-900">Enlace de Anticipo Seguro</span>
                  </div>
                  <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    $300 MXN
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                  <div className="text-xs text-slate-600">
                    Apartado de cita médica para: <strong className="text-slate-900">Carlos Mendoza</strong>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Anticipo pagado vía SPEI BBVA • Cita Confirmada</span>
                  </div>

                  <div className="text-[11px] text-slate-400 text-center">
                    Procesado de forma segura con Mercado Pago México
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MODO COPILOTO */}
          {activeTab === 'COPILOTO' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Colaboración Recepción + Inteligencia Artificial</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Superpoderes para tu recepcionista: la IA como copiloto incansable
                </h3>

                <p className="text-slate-600 text-base leading-relaxed">
                  No buscamos reemplazar al personal humano, sino liberarlo del 75% del trabajo telefónico repetitivo (precios, ubicación, horarios) para que pueda atender con calidez y esmero a los pacientes en sala de espera.
                </p>

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Bandeja unificada en tiempo real:</strong> Visualiza llamadas y chats simultáneos en una sola pantalla clara.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Botón de toma de control (Takeover):</strong> Pausa la IA con un clic para que la recepcionista continúe escribiendo o hablando directamente.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>Sugerencias en 1 clic:</strong> La IA redacta borradores de respuesta que el personal puede revisar y enviar en segundos.</span>
                  </div>
                </div>
              </div>

              {/* Visual Card Mockup */}
              <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-bold text-slate-900">Estado de Conversación</span>
                  </div>
                  <button type="button" className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-100 transition-colors">
                    Pausar IA y Tomar Control
                  </button>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
                  <div className="text-slate-500 font-semibold">Respuesta sugerida por la IA:</div>
                  <p className="text-slate-800 italic bg-white p-2 rounded-lg border border-slate-200">
                    «Con gusto le agendo con la Dra. Sofía mañana a las 4:00 PM. ¿Gusta que le reserve este espacio?»
                  </p>
                  <button type="button" className="w-full py-1.5 bg-teal-600 text-white font-bold rounded-lg text-center text-xs">
                    Aprobar y Enviar (1 clic)
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
}
