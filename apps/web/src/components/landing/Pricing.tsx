'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Check, 
  Sparkles, 
  PhoneCall, 
  MessageSquare, 
  ShieldCheck, 
  HelpCircle, 
  ArrowRight,
  Zap,
  Building2,
  Stethoscope,
  Crown
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
        '1 Doctor / Especialista activo',
        'Hasta 250 citas gestionadas al mes',
        'WhatsApp Cloud API oficial de Meta 24/7',
        'Escudo Anti-Inasistencias con Mercado Pago',
        'Recordatorios automáticos 24h y 2h antes',
        'Sincronización con Google Calendar',
        'Bandeja web para recepcionista o doctor',
        'Soporte técnico por WhatsApp',
      ],
      ctaText: 'Iniciar Prueba de 14 Días',
      ctaHref: '/dashboard',
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
        'Reportes de citas perdidas y conversión semanal',
        'Soporte prioritario con respuesta <30 min',
      ],
      ctaText: 'Comenzar con Clínica Pro',
      ctaHref: '/dashboard',
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
      ctaText: 'Contactar a Ventas Corporativas',
      ctaHref: '/dashboard',
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
    <section id="precios" className="py-20 md:py-28 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Invierte una fracción de un sueldo y{' '}
            <span className="text-teal-700">
              multiplica la ocupación de tu clínica
            </span>
          </h2>

          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Planes adaptados a consultorios independientes, clínicas medianas y cadenas de salud en México. Todos incluyen 14 días de prueba sin compromiso.
          </p>

          {/* Billing Cycle Switcher */}
          <div className="mt-8 inline-flex items-center p-1.5 rounded-2xl bg-slate-100 border border-slate-200">
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                billingCycle === 'MONTHLY'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Pago Mensual
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                billingCycle === 'ANNUAL'
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>Pago Anual</span>
              <span className="bg-amber-300 text-amber-950 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md">
                2 MESES GRATIS
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const price = billingCycle === 'ANNUAL' ? plan.priceAnnual : plan.priceMonthly;

            return (
              <div
                key={plan.slug}
                className={`relative rounded-3xl p-8 flex flex-col justify-between transition-all ${
                  plan.popular
                    ? 'bg-slate-900 text-white shadow-2xl shadow-teal-900/30 border-2 border-teal-500 ring-4 ring-teal-500/10 -translate-y-2'
                    : 'bg-slate-50 text-slate-900 border border-slate-200 hover:border-slate-300 hover:shadow-lg'
                }`}
              >
                {/* Popular Ribbon */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wider shadow-md">
                    {plan.badge}
                  </div>
                )}

                <div>
                  {/* Icon & Plan Name */}
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                        plan.popular
                          ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                          : 'bg-teal-100/80 text-teal-700 border border-teal-200'
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    {!plan.popular && (
                      <span className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <h3 className={`text-2xl font-bold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>
                    {plan.name}
                  </h3>

                  <p className={`mt-2 text-xs leading-relaxed ${plan.popular ? 'text-slate-300' : 'text-slate-600'}`}>
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="mt-6 mb-6 pb-6 border-b border-slate-200/40">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl sm:text-5xl font-extrabold tracking-tight ${plan.popular ? 'text-white' : 'text-slate-900'}`}>
                        {formatPrice(price)}
                      </span>
                      <span className={`text-xs font-semibold ${plan.popular ? 'text-slate-400' : 'text-slate-500'}`}>
                        MXN / mes
                      </span>
                    </div>
                    {billingCycle === 'ANNUAL' && (
                      <p className={`text-xs mt-1 font-medium ${plan.popular ? 'text-emerald-300' : 'text-emerald-600'}`}>
                        Facturado anualmente (Ahorras {formatPrice((plan.priceMonthly - plan.priceAnnual) * 12)} MXN al año)
                      </p>
                    )}
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-3 mb-8">
                    <div className={`text-xs font-bold uppercase tracking-wider ${plan.popular ? 'text-teal-300' : 'text-slate-400'}`}>
                      Incluye:
                    </div>
                    {plan.features.map((feature, fIdx) => (
                      <div key={fIdx} className="flex items-start gap-2.5 text-xs">
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            plan.popular
                              ? 'bg-teal-500 text-white font-bold'
                              : 'bg-teal-700 text-white'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                        <span className={plan.popular ? 'text-slate-200' : 'text-slate-700'}>
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <div>
                  <Link
                    href={plan.ctaHref}
                    className={`w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold text-sm transition-all ${
                      plan.popular
                        ? 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/40'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <p className={`text-center text-[11px] mt-2.5 ${plan.popular ? 'text-slate-400' : 'text-slate-500'}`}>
                    14 días de prueba gratis • Sin tarjeta requerida
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Facturación Fiscal México Reassurance */}
        <div className="mt-14 max-w-4xl mx-auto bg-slate-50 rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700 font-bold shrink-0">
              SAT
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">Facturación Fiscal Mexicana (CFDI 4.0)</p>
              <p className="text-slate-500">
                Emitimos factura fiscal con IVA desglosado 100% deducible para tu consultorio o clínica en México.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-teal-700 font-semibold shrink-0">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            <span>Garantía de Satisfacción 100%</span>
          </div>
        </div>

      </div>
    </section>
  );
}
