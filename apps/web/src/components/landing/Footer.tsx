import Link from 'next/link';
import { 
  Bot, 
  PhoneCall, 
  Mail, 
  MapPin, 
  ShieldCheck, 
  Heart, 
  Sparkles,
  ExternalLink
} from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 pb-12 border-b border-slate-800">
          
          {/* Col 1: Brand & Overview (2 cols on lg) */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-700 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-teal-600/30">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-lg text-white tracking-tight">
                    Asistente<span className="text-teal-400">Pro</span>
                  </span>
                  <span className="bg-teal-900/60 text-teal-300 text-[10px] font-semibold px-2 py-0.5 rounded border border-teal-700/50">
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

            <div className="pt-2 flex items-center gap-2 text-xs text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Conforme a la NOM-004-SSA3 y LFPDPPP México</span>
            </div>

            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-teal-400 hover:bg-slate-800 border border-teal-500/30 transition-all"
              >
                <span>Acceso a Dashboard de Clínicas</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Col 2: Soluciones Clínicas */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Especialidades
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm">
              <li>
                <a href="#demo" className="hover:text-teal-400 transition-colors">
                  Clínicas Dentales & Odontología
                </a>
              </li>
              <li>
                <a href="#demo" className="hover:text-teal-400 transition-colors">
                  Dermatología & Clínicas Estéticas
                </a>
              </li>
              <li>
                <a href="#demo" className="hover:text-teal-400 transition-colors">
                  Consultorios Médicos Privados
                </a>
              </li>
              <li>
                <a href="#demo" className="hover:text-teal-400 transition-colors">
                  Oftalmología & Ópticas
                </a>
              </li>
              <li>
                <a href="#demo" className="hover:text-teal-400 transition-colors">
                  Fisioterapia & Nutrición
                </a>
              </li>
              <li>
                <a href="#demo" className="hover:text-teal-400 transition-colors">
                  Policlínicas & Hospitales
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Funcionalidades */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Plataforma
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm">
              <li>
                <a href="#caracteristicas" className="hover:text-teal-400 transition-colors">
                  Telefonía Twilio México (+52)
                </a>
              </li>
              <li>
                <a href="#caracteristicas" className="hover:text-teal-400 transition-colors">
                  WhatsApp Cloud API Oficial
                </a>
              </li>
              <li>
                <a href="#caracteristicas" className="hover:text-teal-400 transition-colors">
                  Motor de Triaje Clínico
                </a>
              </li>
              <li>
                <a href="#caracteristicas" className="hover:text-teal-400 transition-colors">
                  Escudo No-Show Mercado Pago
                </a>
              </li>
              <li>
                <a href="#caracteristicas" className="hover:text-teal-400 transition-colors">
                  Modo Copiloto para Recepción
                </a>
              </li>
              <li>
                <a href="#calculadora" className="hover:text-teal-400 transition-colors">
                  Calculadora Interactiva ROI
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Soporte & Contacto en México */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              Soporte en México
            </h4>
            <ul className="space-y-3 text-xs sm:text-sm">
              <li className="flex items-start gap-2.5">
                <PhoneCall className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-white font-medium">+52 55 9225 4321</span>
                  <span className="text-[11px] text-slate-500">Línea directa CDMX</span>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-white font-medium">soporte@asistentepro.mx</span>
                  <span className="text-[11px] text-slate-500">Atención técnica 24/7</span>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-white font-medium">Paseo de la Reforma 222</span>
                  <span className="text-[11px] text-slate-500">Juárez, Cuauhtémoc, CDMX</span>
                </div>
              </li>
            </ul>
          </div>

        </div>

        {/* Legal & Notice of Privacy Bar */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2">
            <span>© 2026 AsistentePro Clínicas S.A.P.I. de C.V.</span>
            <a href="#faq" className="hover:text-teal-400 transition-colors">
              Aviso de Privacidad (LFPDPPP)
            </a>
            <a href="#faq" className="hover:text-teal-400 transition-colors">
              Términos del Servicio
            </a>
            <a href="#faq" className="hover:text-teal-400 transition-colors">
              Cumplimiento NOM-004-SSA3
            </a>
            <a href="#precios" className="hover:text-teal-400 transition-colors">
              Facturación SAT CFDI 4.0
            </a>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Desarrollado con</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-current inline" />
            <span>en México para profesionales de la salud 🇲🇽</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
