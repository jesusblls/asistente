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

export function Pricing() {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');

  const plans = [
    {
      name: 'Consultorio Individual',
      slug: 'consultorio',
      icon: Stethoscope,
      badge: 'Para Médicos Independientes',
      priceMonthly: 1499,
      priceAnnual: 1199,
      description:
        'Ideal para consultorios dentales o médicos privados de un solo especialista que desean automatizar WhatsApp y eliminar inasistencias.',
      popular: false,
      features: [
        '1 Doctor o Especialista activo',
        'Hasta 250 citas gestionadas al mes',
        'WhatsApp Cloud API oficial de Meta 24/7',
        'Escudo Anti-Inasistencias con Mercado Pago',
        'Recordatorios automáticos 24h y 2h antes',
        'Sincronización con Google Calendar',
        'Bandeja web para recepcionista o doctor',
        'Facturación fiscal CFDI 4.0 mensual',
      ],
      ctaText: 'Comenzar Prueba de 14 Días',
      ctaHref: '/registro',
    },
    {
      name: 'Clínica Pro',
      slug: 'clinica-pro',
      icon: Crown,
      badge: 'MÁS ELEGIDO EN MÉXICO',
      priceMonthly: 3499,
      priceAnnual: 2799,
      description:
        'La solución completa con telefonía de voz en vivo (+52) y WhatsApp para clínicas dentales, dermatológicas o policlínicas con equipo.',
      popular: true,
      features: [
        'Hasta 5 Doctores o gabinetes de atención',
        'Citas ilimitadas por WhatsApp e Instagram',
        'Telefonía de Voz con IA (+52 México) incluida (300 mins)',
        'Triaje médico y dental con detección de urgencias',
        'Modo Copiloto para equipo de recepción en vivo',
        'Sincronización con Google Calendar & Cal.com',
        'Cobro de anticipos con Mercado Pago (Tarjetas / SPEI)',
        'Soporte técnico prioritario por WhatsApp en México',
      ],
      ctaText: 'Probar Clínica Pro Gratis',
      ctaHref: '/registro',
    },
    {
      name: 'Cadenas & Hospitales',
      slug: 'cadenas',
      icon: Building2,
      badge: 'Multisucursal & Corporativo',
      priceMonthly: 7999,
      priceAnnual: 6399,
      description:
        'Para redes de clínicas, hospitales privados y franquicias que requieren conmutador telefónico avanzado e integraciones con su expediente clínico.',
      popular: false,
      features: [
        'Doctores, recepcionistas y sucursales ilimitadas',
        'Telefonía conmutador extendido (1,200 minutos incluidos)',
        'Voz con IA personalizada con el nombre de tu marca',
        'Integración con software médico o ERP vía API y Webhooks',
        'Reglas complejas de asignación de turnos y quirófanos',
        'Gerente de cuenta médico asignado + SLA 99.9%',
        'Contrato corporativo y cumplimiento NOM-004-SSA3',
        'Facturación CFDI 4.0 mensual automática',
      ],
      ctaText: 'Contactar a Asesor Clínico',
      ctaHref: '/registro',
    },
  ];

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <section id="precios" className="py-20 md:py-28 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Tarifas claras en pesos mexicanos, sin letras chiquitas
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Sin contratos forzosos. Todos los planes incluyen 14 días de prueba completa para que evalúes el impacto en tu consultorio.
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
                2 MESES GRATIS
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const price = billingCycle === 'ANNUAL' ? plan.priceAnnual : plan.priceMonthly;

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
                      {billingCycle === 'ANNUAL' ? 'Facturado anualmente (Ahorro del 20%)' : 'Facturación mensual recurrente'}
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="mt-6 space-y-3">
                    <span className={`text-xs font-bold uppercase tracking-wider block mb-3 ${
                      plan.popular ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      Incluye:
                    </span>
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm">
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
                    href={plan.ctaHref}
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
                    Prueba de 14 días sin costo
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
            <span>Factura fiscal mexicana CFDI 4.0 mensual</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Paga con tarjeta de crédito, débito o transferencia SPEI</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Soporte técnico directo en México</span>
          </span>
        </div>

      </div>
    </section>
  );
}
