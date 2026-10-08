import Link from 'next/link';
import { Bot, ShieldCheck, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 pb-12 border-b border-slate-800">
          
          {/* Brand & Mission (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-lg text-white tracking-tight">
                    Asistente<span className="text-teal-400">Pro</span>
                  </span>
                  <span className="bg-teal-950 text-teal-300 text-[10px] font-bold px-2 py-0.5 rounded border border-teal-800">
                    Clínicas
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Infraestructura Médica Inteligente (+52 México)
                </span>
              </div>
            </Link>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm">
              La recepcionista con Inteligencia Artificial que contesta tus llamadas en México (+52) y agenda citas por WhatsApp 24/7 con triaje clínico y cobro de anticipos en Mercado Pago.
            </p>

            <div className="pt-1 flex items-center gap-2 text-xs text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Bitácora de auditoría inmutable de accesos clínicos</span>
            </div>

            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-teal-300 hover:bg-slate-800 border border-teal-800 transition-colors"
              >
                <span>Acceso al Dashboard de tu Clínica</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Specialties */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Especialidades
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm">
              <li>Clínicas Dentales & Odontología</li>
              <li>Dermatología & Clínicas Estéticas</li>
              <li>Consultorios Médicos Privados</li>
              <li>Oftalmología & Cirugía</li>
              <li>Fisioterapia & Rehabilitación</li>
              <li>Policlínicas & Hospitales</li>
            </ul>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Plataforma
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm">
              <li>
                <a href="#soluciones" className="hover:text-teal-400 transition-colors">
                  Telefonía Twilio México (+52)
                </a>
              </li>
              <li>
                <a href="#soluciones" className="hover:text-teal-400 transition-colors">
                  WhatsApp Cloud API Oficial
                </a>
              </li>
              <li>
                <a href="#soluciones" className="hover:text-teal-400 transition-colors">
                  Triaje Clínico en 3 Niveles
                </a>
              </li>
              <li>
                <a href="#soluciones" className="hover:text-teal-400 transition-colors">
                  Escudo No-Show Mercado Pago
                </a>
              </li>
              <li>
                <a href="#soluciones" className="hover:text-teal-400 transition-colors">
                  Modo Copiloto Recepción
                </a>
              </li>
              <li>
                <a href="#calculadora" className="hover:text-teal-400 transition-colors">
                  Calculadora Interactiva ROI
                </a>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Tu Cuenta
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm">
              <li>
                <Link href="/registro" className="hover:text-teal-400 transition-colors">
                  Crear cuenta de prueba
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-teal-400 transition-colors">
                  Iniciar sesión
                </Link>
              </li>
              <li>
                <a href="#precios" className="hover:text-teal-400 transition-colors">
                  Planes y precios
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-teal-400 transition-colors">
                  Preguntas frecuentes
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Legal & Privacy */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2">
            <span>© 2026 AsistentePro</span>
            <Link href="/privacidad" className="hover:text-teal-400 transition-colors">
              Aviso de Privacidad (LFPDPPP)
            </Link>
            <Link href="/terminos" className="hover:text-teal-400 transition-colors">
              Términos de Servicio
            </Link>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Diseñado con rigor clínico en México 🇲🇽</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
