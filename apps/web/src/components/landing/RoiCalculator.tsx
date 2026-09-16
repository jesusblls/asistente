'use client';

import { useState, useId } from 'react';
import { 
  Calculator, 
  TrendingUp, 
  ShieldCheck, 
  ArrowRight,
  Sparkles,
  Building2,
  Stethoscope
} from 'lucide-react';

export function RoiCalculator() {
  const [monthlyAppointments, setMonthlyAppointments] = useState<number>(180);
  const [averageTicket, setAverageTicket] = useState<number>(1200);
  const [noShowRate, setNoShowRate] = useState<number>(28);

  const monthlyAppointmentsId = useId();
  const averageTicketId = useId();
  const noShowRateId = useId();

  // Presets for quick selection
  const handleApplyPreset = (appointments: number, ticket: number, rate: number) => {
    setMonthlyAppointments(appointments);
    setAverageTicket(ticket);
    setNoShowRate(rate);
  };

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
    <section id="calculadora" className="py-20 md:py-28 bg-slate-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            ¿Cuánto dinero recuperaría tu clínica con el Escudo Anti-Inasistencias?
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Mueve los controles con las cifras de tu consultorio y comprueba cuántos pesos mexicanos dejas de perder mes a mes al asegurar las citas con anticipo en Mercado Pago.
          </p>

          {/* Quick preset selector */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-slate-500 font-semibold mr-1">Ejemplos rápidos:</span>
            <button
              type="button"
              onClick={() => handleApplyPreset(80, 850, 25)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-teal-500 text-xs font-semibold text-slate-700 transition-colors"
            >
              Consultorio Individual (80 citas)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(180, 1200, 28)}
              className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-xs font-semibold text-teal-800 transition-colors"
            >
              Clínica Dental Promedio (180 citas)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(400, 1800, 32)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-teal-500 text-xs font-semibold text-slate-700 transition-colors"
            >
              Centro Multiespecialidad (400 citas)
            </button>
          </div>
        </div>

        {/* Calculator Grid */}
        <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Sliders Input Panel (7 cols) */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between space-y-8">
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-teal-600" />
                  <h3 className="font-bold text-slate-900 text-base">Parámetros de tu Consultorio</h3>
                </div>
                <span className="text-xs text-slate-500 font-medium">Pesos Mexicanos (MXN)</span>
              </div>

              {/* Slider 1: Consultas al mes */}
              <div className="space-y-3 mb-8">
                <div className="flex items-center justify-between">
                  <label htmlFor={monthlyAppointmentsId} className="text-sm font-bold text-slate-800">
                    Consultas programadas al mes
                  </label>
                  <span className="text-sm font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200 tabular-nums">
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
                  <span>30 citas</span>
                  <span>600 citas</span>
                </div>
              </div>

              {/* Slider 2: Ticket promedio */}
              <div className="space-y-3 mb-8">
                <div className="flex items-center justify-between">
                  <label htmlFor={averageTicketId} className="text-sm font-bold text-slate-800">
                    Costo promedio por consulta / tratamiento
                  </label>
                  <span className="text-sm font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200 tabular-nums">
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
                  <span>$400 MXN</span>
                  <span>$4,000 MXN</span>
                </div>
              </div>

              {/* Slider 3: Tasa de inasistencia actual */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor={noShowRateId} className="text-sm font-bold text-slate-800">
                    Tasa de inasistencia actual (No-Shows)
                  </label>
                  <span className="text-sm font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200 tabular-nums">
                    {noShowRate}% no se presenta
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
                  <span>10% (Bajo)</span>
                  <span>28% (Promedio en México)</span>
                  <span>45% (Crítico)</span>
                </div>
              </div>
            </div>

            {/* Reassurance note */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>¿Por qué funciona el 80% de reducción?</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Un anticipo de $200 a $500 MXN genera compromiso formal del paciente. Si además recibe recordatorios automáticos interactivos 24h y 2h antes por WhatsApp, las ausencias caen a menos del 5%.
              </p>
            </div>
          </div>

          {/* Results Panel (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900 text-white p-6 sm:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-800">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-teal-400 mb-2">
                Resultado de Recuperación
              </div>

              {/* Big recovered amount */}
              <div className="mb-6">
                <span className="text-xs text-slate-400 block mb-1">
                  Pesos Mensuales Recuperados
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-tight tabular-nums">
                  {formatMxn(monthlyRecoveredMxn)}
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Recuperas aproximadamente <strong className="text-white font-bold tabular-nums">+{recoveredAppointments} pacientes</strong> en el consultorio cada mes.
                </p>
              </div>

              {/* Financial Breakdown */}
              <div className="space-y-3 pt-4 border-t border-slate-800 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Pérdida actual por no-shows:</span>
                  <span className="font-semibold text-rose-400 tabular-nums">
                    {formatMxn(lostRevenueMxn)}/mes
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Costo mensual Plan Clínica Pro:</span>
                  <span className="font-semibold text-slate-300 tabular-nums">
                    -{formatMxn(subscriptionCostMxn)}/mes
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-white font-bold">Ganancia Neta Extra:</span>
                  <span className="text-emerald-400 font-extrabold text-base tabular-nums">
                    +{formatMxn(netMonthlyProfit)}/mes
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Recuperación anual estimada:</span>
                  <span className="text-teal-300 font-bold tabular-nums">
                    {formatMxn(annualRecoveredMxn)} / año
                  </span>
                </div>

                <div className="flex items-center justify-between bg-teal-950/80 p-2.5 rounded-xl border border-teal-800/80 mt-3">
                  <span className="text-xs text-teal-200">Retorno de Inversión (ROI):</span>
                  <span className="text-sm font-extrabold text-teal-300 flex items-center gap-1 tabular-nums">
                    <TrendingUp className="w-4 h-4" />
                    +{roiPercentage}%
                  </span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 pt-6 border-t border-slate-800">
              <a
                href="#precios"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-sm transition-colors text-sm"
              >
                <span>Ver Planes y Activar Escudo</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <p className="text-center text-[11px] text-slate-400 mt-2">
                Sin contratos forzosos • Factura CFDI 4.0 mensual
              </p>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
