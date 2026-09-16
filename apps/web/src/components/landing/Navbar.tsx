'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Bot, 
  Menu, 
  X, 
  Sparkles, 
  ShieldCheck,
  LayoutDashboard,
  Phone
} from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { name: 'Simulador', href: '#demo' },
    { name: 'Soluciones', href: '#soluciones' },
    { name: 'Calculadora', href: '#calculadora' },
    { name: 'Precios', href: '#precios' },
    { name: 'Testimonios', href: '#testimonios' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <header 
      className={`sticky top-0 z-50 transition-all duration-200 ${
        isScrolled 
          ? 'bg-white/90 backdrop-blur-md border-b border-slate-200/90 shadow-xs' 
          : 'bg-white/80 backdrop-blur-xs border-b border-slate-200/60'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[68px] gap-4">
          
          {/* Brand Identity */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs group-hover:bg-teal-700 transition-colors">
                <Bot className="w-5 h-5" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-white"></span>
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 leading-none">
                Asistente<span className="text-teal-600">Pro</span>
              </span>
              <span className="bg-teal-50 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-200">
                Clínicas
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden xl:flex items-center space-x-1 whitespace-nowrap">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-lg transition-colors whitespace-nowrap"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Action CTAs (Clean, uncluttered, no double-line wrapping) */}
          <div className="hidden md:flex items-center gap-3 shrink-0 whitespace-nowrap">
            {/* Demo phone chip only shown when extra width is available */}
            <a
              href="#demo"
              className="hidden 2xl:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors border border-slate-200/60 whitespace-nowrap"
              title="Línea demo de conmutador en CDMX"
            >
              <Phone className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="tabular-nums">+52 (55) 4912-8830</span>
            </a>

            {/* Dashboard Link */}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 rounded-xl transition-colors whitespace-nowrap"
            >
              <LayoutDashboard className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Acceso Clínica</span>
            </Link>

            {/* Simulator Secondary Button */}
            <a
              href="#demo"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Probar Simulador</span>
            </a>

            {/* Signup Primary Button */}
            <Link
              href="/registro"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all active:scale-95 whitespace-nowrap"
            >
              <span>Prueba gratis</span>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex xl:hidden items-center gap-2">
            <Link
              href="/dashboard"
              className="p-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg md:hidden"
              title="Acceso Clínica"
            >
              <LayoutDashboard className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label={mobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-b border-slate-200 bg-white/95 backdrop-blur-xl px-4 pt-3 pb-6 shadow-xl animate-in slide-in-from-top-2 duration-150">
          <div className="space-y-1 pb-4 border-b border-slate-100">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-base font-semibold text-slate-800 hover:text-teal-700 hover:bg-slate-50 transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <a
              href="#demo"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <Phone className="w-4 h-4 text-teal-600" />
              <span>Línea Demo CDMX: +52 (55) 4912-8830</span>
            </a>

            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-teal-600" />
              <span>Acceso al Dashboard de tu Clínica</span>
            </Link>

            <Link
              href="/registro"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
            >
              <span>Crear cuenta · Prueba gratis</span>
            </Link>

            <a
              href="#demo"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all"
            >
              <Sparkles className="w-4 h-4 text-teal-200" />
              <span>Probar Simulador Interactivo</span>
            </a>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500 pt-3 border-t border-slate-100">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Infraestructura Segura para Clínicas en México</span>
          </div>
        </div>
      )}
    </header>
  );
}
