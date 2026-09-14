import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { InteractiveDemo } from '@/components/landing/InteractiveDemo';
import { Features } from '@/components/landing/Features';
import { RoiCalculator } from '@/components/landing/RoiCalculator';
import { Pricing } from '@/components/landing/Pricing';
import { Testimonials } from '@/components/landing/Testimonials';
import { FaqSection } from '@/components/landing/FaqSection';
import { Footer } from '@/components/landing/Footer';
import Link from 'next/link';
import { Sparkles, ArrowRight, ShieldCheck, PhoneCall, Bot } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* 1. Navbar */}
      <Navbar />

      <main className="flex-1">
        {/* 2. Hero de Alto Impacto */}
        <Hero />

        {/* 3. Simulador Interactivo de Voz (+52) y WhatsApp */}
        <InteractiveDemo />

        {/* 4. Características Clave para Clínicas */}
        <Features />

        {/* 5. Calculadora Interactiva de ROI en Pesos MXN */}
        <RoiCalculator />

        {/* 6. Tabla de Precios en MXN */}
        <Pricing />

        {/* 7. Testimonios Reales de Clínicas en México */}
        <Testimonials />

        {/* 8. Preguntas Frecuentes (FAQ) */}
        <FaqSection />

        {/* 9. Pre-Footer High Conversion CTA Banner */}
        <section className="py-16 md:py-20 bg-slate-900 text-white relative overflow-hidden border-t border-slate-800">
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight mb-6">
              ¿Listo para que tu clínica nunca vuelva a perder una llamada?
            </h2>

            <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
              Empieza hoy mismo en menos de 15 minutos. Conserva tu número de teléfono (+52), activa WhatsApp Cloud API y dile adiós a las salas de espera vacías por inasistencias.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-2xl shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-base"
              >
                <span>Acceder al Dashboard de tu Clínica</span>
                <ArrowRight className="w-5 h-5 text-teal-400" />
              </Link>

              <a
                href="#demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/20 hover:bg-white/30 text-white font-bold rounded-2xl border border-white/40 shadow-sm transition-all text-base"
              >
                <span>Probar el Simulador de Voz</span>
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-teal-100">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-200" />
                <span>Sin contratos forzosos</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-200" />
                <span>Soporte en México 24/7</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-200" />
                <span>Factura con CFDI 4.0</span>
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* 10. Footer */}
      <Footer />
    </div>
  );
}
