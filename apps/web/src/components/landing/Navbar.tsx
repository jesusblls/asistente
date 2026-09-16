'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Bot, 
  Menu, 
  X, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck,
  LayoutDashboard,
  Phone
} from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Simulador en Vivo', href: '#demo' },
    { name: '¿Cómo Funciona?', href: '#soluciones' },
    { name: 'Calculadora ROI', href: '#calculadora' },
    { name: 'Precios', href: '#precios' },
    { name: 'Casos Reales', href: '#testimonios' },
    { name: 'Preguntas', href: '#faq' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Brand Identity */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm group-hover:bg-teal-700 transition-colors">
                <Bot className="w-5 h-5" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white"></span>
              </span>
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">
                  Asistente<span className="text-teal-600">Pro</span>
                </span>
                <span className="bg-teal-50 text-teal-700 text-[11px] font-bold px-2 py-0.5 rounded-md border border-teal-200">
                  Clínicas
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Telefonía & WhatsApp +52 México
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="#demo"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors"
              title="Línea demo activa en CDMX"
            >
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              <span className="tabular-nums">+52 (55) 4912-8830</span>
            </a>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:text-teal-700 hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-teal-600" />
              <span>Acceso Clínica</span>
            </Link>

            <a
              href="#demo"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-teal-200" />
              <span>Probar Simulador</span>
            </a>
          </div>

          {/* Mobile hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <Link
              href="/dashboard"
              className="p-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl"
              title="Acceso Clínica"
            >
              <LayoutDashboard className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-6 shadow-xl animate-in slide-in-from-top-2 duration-150">
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

          <div className="mt-4 pt-1 space-y-2.5">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-teal-600" />
              <span>Acceso al Dashboard de tu Clínica</span>
            </Link>

            <a
              href="#demo"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-all"
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
