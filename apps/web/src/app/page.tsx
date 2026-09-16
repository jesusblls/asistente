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
import { ArrowRight, ShieldCheck, Play } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* 1. Navbar */}
      <Navbar />

      <main className="flex-1">
        {/* 2. Hero con audio interactivo y métricas */}
        <Hero />

        {/* 3. Simulador Interactivo Dual (+52 & WhatsApp) */}
        <InteractiveDemo />

        {/* 4. Soluciones Clínicas y Flujo Operativo */}
        <Features />

        {/* 5. Calculadora de ROI y Recuperación en MXN */}
        <RoiCalculator />

        {/* 6. Tarifas en Pesos Mexicanos (MXN) */}
        <Pricing />

        {/* 7. Testimonios Reales en CDMX, MTY y GDL */}
        <Testimonials />

        {/* 8. Preguntas Frecuentes con Filtros */}
        <FaqSection />

        {/* 9. Pre-Footer High Conversion CTA */}
        <section className="py-20 bg-slate-950 text-white border-t border-slate-800">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              ¿Listo para que tu clínica nunca vuelva a perder una llamada?
            </h2>

            <p className="mt-5 text-slate-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Comienza hoy mismo en menos de 15 minutos. Conserva tu número de teléfono (+52), activa WhatsApp Cloud API oficial y elimina los huecos en la agenda por inasistencias.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-sm transition-colors text-base"
              >
                <span>Acceder al Dashboard de tu Clínica</span>
                <ArrowRight className="w-5 h-5 text-teal-200" />
              </Link>

              <a
                href="#demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold rounded-xl border border-slate-700 transition-colors text-base"
              >
                <Play className="w-4 h-4 fill-current text-teal-400" />
                <span>Probar el Simulador en Vivo</span>
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Sin contratos forzosos</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Soporte clínico en México</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Factura fiscal con CFDI 4.0</span>
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
