'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Check, 
  ArrowRight,
  Building2,
  Stethoscope,
  Crown,
  ShieldCheck
} from 'lucide-react';

import {
  PLANS,
  PLANES_CONTRATABLES,
  TRIAL_DURATION_DAYS,
  importeDelCiclo,
  type PlanLimits,
  type PlanSlug,
} from '@asistente/shared-types';

/**
 * Lo que la landing agrega a cada plan: presentación, no números. Precios,
 * nombres y cupos salen de `PLANS` en @asistente/shared-types —el mismo
 * catálogo que cobra Mercado Pago y que aplica el backend—, para que lo que
 * se anuncia no pueda separarse de lo que se cobra.
 */
const PLAN_PRESENTATION: Record<
  (typeof PLANES_CONTRATABLES)[number],
  { icon: typeof Stethoscope; badge: string; description: string; popular: boolean; ctaText: string }
> = {
  consultorio: {
    icon: Stethoscope,
    badge: 'Para Médicos Independientes',
    description:
      'Para consultorios dentales o médicos privados de un solo especialista que quieren automatizar WhatsApp y reducir inasistencias.',
    popular: false,
    ctaText: 'Comenzar Prueba Gratis',
  },
  'clinica-pro': {
    icon: Crown,
    badge: 'Más completo',
    description:
      'Telefonía de voz con IA (+52) y WhatsApp para clínicas dentales, dermatológicas o policlínicas con equipo.',
    popular: true,
    ctaText: 'Comenzar Prueba Gratis',
  },
  cadenas: {
    icon: Building2,
    badge: 'Alto Volumen',
    description:
      'Para clínicas grandes y hospitales privados con muchos especialistas y alto volumen de llamadas.',
    popular: false,
    ctaText: 'Comenzar Prueba Gratis',
  },
};

/** Funciones reales que todos los planes contratables incluyen. */
const SHARED_FEATURES = [
  'WhatsApp Cloud API oficial de Meta 24/7',
  'Triaje de urgencias en 3 niveles',
  'Escudo Anti-Inasistencias con Mercado Pago',
  'Recordatorios automáticos 24h y 2h antes',
  'Bandeja web con Modo Copiloto para recepción',
];

const formatNumber = (n: number) => new Intl.NumberFormat('es-MX').format(n);

function describeLimits(limits: PlanLimits): string[] {
  return [
    limits.maxDoctors === null
      ? 'Especialistas ilimitados'
      : limits.maxDoctors === 1
        ? '1 Doctor o Especialista activo'
        : `Hasta ${limits.maxDoctors} Doctores o Especialistas`,
    limits.maxAppointmentsPerMonth === null
      ? 'Citas ilimitadas'
      : `Hasta ${formatNumber(limits.maxAppointmentsPerMonth)} citas al mes`,
    ...(limits.voiceEnabled
      ? [`Telefonía de Voz con IA (+52): ${formatNumber(limits.includedVoiceMinutes)} min incluidos`]
      : []),
  ];
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(price);

const trialLimits = PLANS.trial.limits;

/** Descuento anual real, calculado del catálogo (no un texto fijo). */
const annualSavingsPct = Math.max(
  ...PLANES_CONTRATABLES.map((slug: PlanSlug) =>
    Math.round((1 - PLANS[slug].priceAnnualMxn / PLANS[slug].priceMonthlyMxn) * 100)
  )
);

export function Pricing() {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');

  const plans = PLANES_CONTRATABLES.map((slug) => {
    const plan = PLANS[slug];
    return {
      ...PLAN_PRESENTATION[slug],
      slug,
      name: plan.name,
      plan,
      features: [...describeLimits(plan.limits), ...SHARED_FEATURES],
    };
  });

  return (
    <section id="precios" className="py-20 md:py-28 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Tarifas claras en pesos mexicanos, sin letras chiquitas
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Sin contratos forzosos. Empiezas con {TRIAL_DURATION_DAYS} días de prueba sin tarjeta (hasta {trialLimits.maxAppointmentsPerMonth} citas y {trialLimits.includedVoiceMinutes} minutos de voz) para que evalúes el impacto en tu consultorio.
          </p>

          {/* Billing Cycle Switcher */}
          <div className="mt-8 inline-flex items-center p-1.5 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setBillingCycle('MONTHLY')}
              className={`px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                billingCycle === 'MONTHLY'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pago Mensual
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('ANNUAL')}
              className={`px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 ${
                billingCycle === 'ANNUAL'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pago Anual</span>
              <span className="bg-amber-300 text-amber-950 text-[10px] font-black px-1.5 py-0.5 rounded">
                AHORRA {annualSavingsPct}%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const price = billingCycle === 'ANNUAL' ? plan.plan.priceAnnualMxn : plan.plan.priceMonthlyMxn;

            return (
              <div
                key={plan.slug}
                className={`rounded-2xl p-7 sm:p-8 flex flex-col justify-between transition-all ${
                  plan.popular
                    ? 'bg-slate-900 text-white border-2 border-teal-500 shadow-md'
                    : 'bg-white text-slate-900 border border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Bar inside Card */}
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        plan.popular
                          ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                          : 'bg-teal-50 text-teal-700 border border-teal-200'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    {plan.popular ? (
                      <span className="bg-teal-300 text-teal-950 text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider">
                        {plan.badge}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className={`mt-2 text-xs leading-relaxed min-h-[40px] ${
                    plan.popular ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="mt-6 pb-6 border-b border-slate-200/80">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight tabular-nums">
                        {formatPrice(price)}
                      </span>
                      <span className={`text-xs font-medium ${plan.popular ? 'text-slate-400' : 'text-slate-500'}`}>
                        MXN / mes
                      </span>
                    </div>
                    <div className={`text-xs mt-1 ${plan.popular ? 'text-teal-300' : 'text-teal-700 font-medium'}`}>
                      {billingCycle === 'ANNUAL'
                        ? `Cobro anual de ${formatPrice(importeDelCiclo(plan.plan, 'ANNUAL'))} MXN`
                        : 'Cobro mensual recurrente'}
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="mt-6 space-y-3">
                    <span className={`text-xs font-bold uppercase tracking-wider block mb-3 ${
                      plan.popular ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      Incluye:
                    </span>
                    {plan.features.map((feat) => (
                      <div key={feat} className="flex items-start gap-2.5 text-xs sm:text-sm">
                        <Check className={`w-4 h-4 shrink-0 mt-0.5 ${
                          plan.popular ? 'text-teal-400' : 'text-teal-600'
                        }`} />
                        <span className={plan.popular ? 'text-slate-200' : 'text-slate-700'}>
                          {feat}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom CTA */}
                <div className="mt-8 pt-6 border-t border-slate-200/80">
                  <Link
                    href="/registro"
                    className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm transition-colors ${
                      plan.popular
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <p className={`text-center text-[11px] mt-2.5 ${
                    plan.popular ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    Prueba de {TRIAL_DURATION_DAYS} días sin costo
                  </p>
                </div>

              </div>
            );
          })}
        </div>

        {/* Reassurance Footer */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Cancela la renovación cuando quieras desde el panel</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Pago con tarjeta a través de Mercado Pago</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Precios en pesos mexicanos (MXN)</span>
          </span>
        </div>

      </div>
    </section>
  );
}
