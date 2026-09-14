'use client';

import { useState, useId } from 'react';
import { 
  Calculator, 
  TrendingUp, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Sparkles,
  HelpCircle,
  PiggyBank
} from 'lucide-react';

export function RoiCalculator() {
  const [monthlyAppointments, setMonthlyAppointments] = useState<number>(180);
  const [averageTicket, setAverageTicket] = useState<number>(1200);
  const [noShowRate, setNoShowRate] = useState<number>(28); // 28% typical clinic average in Mexico

  const monthlyAppointmentsId = useId();
  const averageTicketId = useId();
  const noShowRateId = useId();

  // Calculations
  const lostAppointments = Math.round(monthlyAppointments * (noShowRate / 100));
  const lostRevenueMxn = lostAppointments * averageTicket;

  // 80% reduction in no-shows
  const recoveredAppointments = Math.round(lostAppointments * 0.8);
  const monthlyRecoveredMxn = recoveredAppointments * averageTicket;
  const annualRecoveredMxn = monthlyRecoveredMxn * 12;

  // Plan Pro Cost = $3,499 MXN
  const subscriptionCostMxn = 3499;
  const netMonthlyProfit = monthlyRecoveredMxn - subscriptionCostMxn;
  const roiPercentage = Math.round((netMonthlyProfit / subscriptionCostMxn) * 100);

  const formatMxn = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <section id="calculadora" className="py-20 md:py-28 bg-slate-100/70 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            ¿Cuánto dinero está perdiendo tu clínica{' '}
            <span className="text-teal-700">
              por llamadas no contestadas y no-shows?
            </span>
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Ajusta los controles deslizantes con las métricas actuales de tu consultorio y descubre cuántos pesos mexicanos puedes recuperar mes con mes con el <strong className="text-slate-800">Escudo Anti-Inasistencias</strong>.
          </p>
        </div>

        {/* Calculator Card Container */}
        <div className="max-w-5xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Sliders Input Panel (7 cols) */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between space-y-8">
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-teal-600" />
                  <h3 className="font-bold text-slate-900 text-lg">Parámetros de tu Consultorio</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium">Valores en Pesos Mexicanos (MXN)</span>
              </div>

              {/* Slider 1: Consultas al mes */}
              <div className="space-y-3 mb-8">
                <div className="flex items-center justify-between">
                  <label htmlFor={monthlyAppointmentsId} className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Consultas programadas al mes</span>
                  </label>
                  <span className="text-base font-extrabold text-teal-700 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200">
                    {monthlyAppointments} citas
                  </span>
                </div>
                <input
                  id={monthlyAppointmentsId}
                  type="range"
                  min="30"
                  max="600"
                  step="10"
                  value={monthlyAppointments}
                  onChange={(e) => setMonthlyAppointments(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600 focus:outline-none"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>30 citas (Consultorio individual)</span>
                  <span>600 citas (Clínica multiespecialidad)</span>
                </div>
              </div>

              {/* Slider 2: Ticket promedio */}
              <div className="space-y-3 mb-8">
                <div className="flex items-center justify-between">
                  <label htmlFor={averageTicketId} className="text-sm font-bold text-slate-800">
                    Ticket promedio por consulta / procedimiento
                  </label>
                  <span className="text-base font-extrabold text-teal-700 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200">
                    {formatMxn(averageTicket)}
                  </span>
                </div>
                <input
                  id={averageTicketId}
                  type="range"
                  min="400"
                  max="4000"
                  step="50"
                  value={averageTicket}
                  onChange={(e) => setAverageTicket(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600 focus:outline-none"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>$400 MXN (General)</span>
                  <span>$4,000 MXN (Especialidad / Cirugía)</span>
                </div>
              </div>

              {/* Slider 3: Tasa de inasistencia actual */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor={noShowRateId} className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Tasa de inasistencia (No-Shows) actual</span>
                  </label>
                  <span className="text-base font-extrabold text-rose-700 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200">
                    {noShowRate}% no asiste
                  </span>
                </div>
                <input
                  id={noShowRateId}
                  type="range"
                  min="10"
                  max="45"
                  step="1"
                  value={noShowRate}
                  onChange={(e) => setNoShowRate(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-600 focus:outline-none"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>10% (Bajo control)</span>
                  <span>28% (Promedio México)</span>
                  <span>45% (Crítico)</span>
                </div>
              </div>
            </div>

            {/* Explanatory notes */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>¿Cómo logramos reducir el 80% de inasistencias?</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Al solicitar un anticipo simbólico de $200 a $500 MXN mediante Mercado Pago y enviar recordatorios por WhatsApp interactivo 24h y 2h antes, el compromiso del paciente aumenta drásticamente.
              </p>
            </div>
          </div>

          {/* Result Highlight Panel (5 cols) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 text-white p-6 sm:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-800">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold mb-4 border border-teal-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Impacto Financiero Estimado</span>
              </div>

              {/* Monthly Pesos Recovered */}
              <div className="mb-6">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                  Pesos Mensuales Recuperados
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-tight">
                  {formatMxn(monthlyRecoveredMxn)}
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Equivalente a <strong className="text-white font-bold">+{recoveredAppointments} pacientes</strong> que sí acuden a su cita cada mes.
                </p>
              </div>

              {/* Detailed Breakdown */}
              <div className="space-y-3.5 pt-4 border-t border-slate-800/90 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Pérdida actual sin IA:</span>
                  <span className="font-semibold text-rose-400 line-through">
                    {formatMxn(lostRevenueMxn)}/mes
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Costo Plan Clínica Pro:</span>
                  <span className="font-semibold text-slate-300">
                    -{formatMxn(subscriptionCostMxn)}/mes
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 font-medium">
                  <span className="text-white font-semibold">Ganancia Neta Extra:</span>
                  <span className="text-emerald-400 font-extrabold text-base">
                    +{formatMxn(netMonthlyProfit)}/mes
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">Retorno Anual Proyectado:</span>
                  <span className="text-teal-300 font-bold">
                    {formatMxn(annualRecoveredMxn)} / año
                  </span>
                </div>

                <div className="flex items-center justify-between bg-teal-900/40 p-2.5 rounded-xl border border-teal-800/60 mt-3">
                  <span className="text-xs text-teal-200">ROI Estimado:</span>
                  <span className="text-sm font-extrabold text-teal-300 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    +{roiPercentage}%
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom CTA in ROI */}
            <div className="mt-8 pt-6 border-t border-slate-800">
              <a
                href="#precios"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-lg transition-all text-sm"
              >
                <span>Comenzar a Recuperar Citas</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <p className="text-center text-[11px] text-slate-400 mt-2">
                Prueba de 14 días sin costo • Cancela cuando quieras
              </p>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
