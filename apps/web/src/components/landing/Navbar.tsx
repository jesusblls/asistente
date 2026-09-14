'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Bot, 
  PhoneCall, 
  Menu, 
  X, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck,
  LayoutDashboard
} from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Simulador en Vivo', href: '#demo' },
    { name: 'Características', href: '#caracteristicas' },
    { name: 'Calculadora ROI', href: '#calculadora' },
    { name: 'Precios', href: '#precios' },
    { name: 'Testimonios', href: '#testimonios' },
    { name: 'Preguntas Frecuentes', href: '#faq' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-700 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-teal-600/25 group-hover:scale-105 transition-transform duration-200">
                <Bot className="w-6 h-6" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
              </span>
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xl tracking-tight text-slate-900">
                  Asistente<span className="text-teal-600">Pro</span>
                </span>
                <span className="bg-teal-50 text-teal-700 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-teal-200/70">
                  Clínicas
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <span>🇲🇽</span> Telefonía & WhatsApp +52
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-1 xl:space-x-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-teal-600 hover:bg-teal-50/60 rounded-lg transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:text-teal-700 hover:bg-slate-100 rounded-xl border border-slate-200/90 transition-all shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4 text-teal-600" />
              <span>Acceso Clínica</span>
            </Link>

            <a
              href="#demo"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-md shadow-teal-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Sparkles className="w-4 h-4 text-teal-200" />
              <span>Probar Simulador</span>
            </a>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex md:hidden items-center gap-2">
            <Link
              href="/dashboard"
              className="p-2 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg"
              title="Acceso Clínica"
            >
              <LayoutDashboard className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Abrir menú"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-6 shadow-xl animate-in slide-in-from-top duration-200">
          <div className="space-y-1 pb-4 border-b border-slate-100">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-base font-medium text-slate-800 hover:text-teal-700 hover:bg-slate-100 transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="mt-4 pt-2 space-y-2.5">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-teal-600" />
              <span>Acceso al Dashboard de Clínica</span>
            </Link>

            <a
              href="#demo"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-md shadow-teal-600/20"
            >
              <Sparkles className="w-4 h-4 text-teal-200" />
              <span>Probar Simulador Interactivo</span>
            </a>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Infraestructura Segura para Clínicas en México</span>
          </div>
        </div>
      )}
    </header>
  );
}
