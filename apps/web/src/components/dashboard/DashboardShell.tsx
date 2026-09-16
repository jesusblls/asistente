'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Inbox,
  Calendar,
  Users,
  Contact,
  CreditCard,
  Settings,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Building2,
  Plus,
  X,
  Zap,
  RotateCcw,
  CheckCircle2,
  Eye,
  Activity,
  LogOut,
  Menu,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { logoutRequest, getUser, type AuthUserInfo } from '../../lib/api';
import { TrialBanner } from './TrialBanner';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    mode,
    setMode,
    tenants,
    activeTenant,
    activeTenantId,
    setActiveTenantId,
    createTenant,
    seedTenantData,
    resetTenantData,
  } = useTenant();

  // Estados de dropdowns y modales
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [isNewTenantModalOpen, setIsNewTenantModalOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // En pantallas menores a 1024 px la barra lateral es un cajón deslizable.
  const [isNavOpen, setIsNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeNavButtonRef = useRef<HTMLButtonElement>(null);

  // Formulario nuevo cliente
  const [newClinicName, setNewClinicName] = useState('');
  const [newClinicCity, setNewClinicCity] = useState('Monterrey, N.L.');
  const [newClinicPhone, setNewClinicPhone] = useState('+5281');
  const [newClinicAddress, setNewClinicAddress] = useState('');
  const [isSubmittingTenant, setIsSubmittingTenant] = useState(false);
  const [sessionUser] = useState<AuthUserInfo | null>(() => {
    if (typeof window === 'undefined') return null;
    return getUser();
  });

  const closeNav = useCallback((returnFocus: boolean) => {
    setIsNavOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  }, []);

  // Al abrir el cajón el foco entra en él; Escape lo cierra y lo devuelve al botón.
  useEffect(() => {
    if (!isNavOpen) return;
    closeNavButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNav(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isNavOpen, closeNav]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClinicName.trim()) return;
    setIsSubmittingTenant(true);

    const created = await createTenant({
      name: newClinicName,
      city: newClinicCity,
      phoneE164: newClinicPhone,
      address: newClinicAddress,
    });

    setIsSubmittingTenant(false);
    if (created) {
      setIsNewTenantModalOpen(false);
      setNewClinicName('');
      setNewClinicAddress('');
      showNotice(`¡Clínica "${created.name}" creada exitosamente!`);
    }
  };

  const handleSeed = async () => {
    if (!activeTenantId) return;
    setIsSeeding(true);
    const ok = await seedTenantData(activeTenantId);
    setIsSeeding(false);
    if (ok) {
      showNotice('⚡ 4 citas de prueba generadas con éxito');
      // Recargar ventana o disparar evento
      window.location.reload();
    }
  };

  const handleReset = async () => {
    if (!activeTenantId) return;
    if (!confirm('¿Seguro que deseas limpiar las citas y mensajes de prueba de esta clínica?')) return;
    setIsResetting(true);
    const ok = await resetTenantData(activeTenantId);
    setIsResetting(false);
    if (ok) {
      showNotice('🧹 Citas de prueba eliminadas');
      window.location.reload();
    }
  };

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleLogout = async () => {
    await logoutRequest();
    router.replace('/login');
  };

  const navLinks: { href: string; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
    { href: '/dashboard', label: 'Resumen General', icon: LayoutDashboard },
    { href: '/dashboard/inbox', label: 'Bandeja Omnicanal', icon: Inbox, badge: 'WhatsApp' },
    { href: '/dashboard/calendar', label: 'Agenda y Citas', icon: Calendar },
    { href: '/dashboard/patients', label: 'Pacientes', icon: Contact },
    { href: '/dashboard/team', label: 'Doctores y Servicios', icon: Users },
    { href: '/dashboard/settings', label: 'Canales y Telefonía (+52)', icon: Settings },
    { href: '/dashboard/suscripcion', label: 'Plan y Facturación', icon: CreditCard },
    // En vivo solo ADMIN puede consultar la bitácora; en Demo se muestra a
    // todos porque el cumplimiento es parte de la presentación comercial.
    ...(mode === 'demo' || sessionUser?.role === 'ADMIN'
      ? [{ href: '/dashboard/audit', label: 'Bitácora de Auditoría', icon: Eye }]
      : []),
  ];

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100">
      {/* Fondo del cajón móvil: tocarlo cierra la navegación */}
      {isNavOpen && (
        <div
          aria-hidden="true"
          onClick={() => closeNav(true)}
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
        />
      )}

      {/* ============================================================ */}
      {/* SIDEBAR LATERAL (cajón deslizable bajo 1024 px) */}
      {/* ============================================================ */}
      <aside
        id="panel-nav"
        aria-label="Navegación del panel"
        // La visibilidad cambia al instante al abrir y con retraso al cerrar. Si
        // también se animara al abrir, en el primer cuadro seguiría oculta y el
        // foco no podría entrar al cajón.
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-900 text-slate-300 select-none duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:static lg:z-auto lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:visible lg:transition-none ${
          isNavOpen
            ? 'translate-x-0 visible transition-transform'
            : '-translate-x-full invisible transition-[transform,visibility]'
        }`}
      >
        {/* Cabecera del cajón (solo móvil) */}
        <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
          <span className="text-sm font-bold text-white">AsistentePro</span>
          <button
            ref={closeNavButtonRef}
            type="button"
            onClick={() => closeNav(true)}
            aria-label="Cerrar menú"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de Clínica / Multi-Tenant */}
        <div className="p-4 border-b border-slate-800 relative">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
            <span>Clínica Activa</span>
            <span className="text-[10px] font-semibold text-teal-400 bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-800/40">
              Multi-Tenant
            </span>
          </div>

          <button
            onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-left border border-slate-700/60 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-white font-bold shrink-0 shadow-sm shadow-teal-500/20">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {activeTenant?.name || 'Cargando clínica...'}
                </p>
                <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                  {activeTenant?.address ? activeTenant.address.split(',')[0] : 'CDMX, México'}
                </p>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isTenantDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Menú Desplegable de Clínicas */}
          {isTenantDropdownOpen && (
            <div className="absolute left-4 right-4 top-full mt-2 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-400 border-b border-slate-700/60">
                Cambiar de Cliente ({tenants.length})
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-slate-700/40">
                {tenants.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTenantId(t.id);
                      setIsTenantDropdownOpen(false);
                      showNotice(`Cambiado a "${t.name}"`);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-700/60 transition-colors ${
                      t.id === activeTenantId ? 'bg-teal-950/40 text-teal-300 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-medium truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{t.phoneE164}</p>
                    </div>
                    {t.id === activeTenantId && <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="p-2 border-t border-slate-700/60 bg-slate-900/40">
                <button
                  onClick={() => {
                    setIsTenantDropdownOpen(false);
                    setIsNewTenantModalOpen(true);
                    setIsNavOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors shadow-sm shadow-teal-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear Nuevo Cliente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navegación Principal */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2">
            Gestión de Clínica
          </div>

          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsNavOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center justify-between px-3 py-3 lg:py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-teal-400'}`} />
                  {link.label}
                </div>
                {link.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-teal-500/20 text-teal-300'
                  }`}>
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2">
            Comercial & Ventas
          </div>

          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between px-3 py-3 lg:py-2.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Ver Landing Comercial
            </span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </Link>
        </nav>

        {/* Banner de Modo en Sidebar */}
        <div className="p-3.5 mx-3 mb-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Modo del Sistema
            </span>
            <span className={`w-2 h-2 rounded-full ${mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-purple-400'}`} />
          </div>
          <div className="text-xs font-semibold text-white">
            {mode === 'live' ? '🟢 Operativo / En Vivo' : '🟣 Showcase Comercial'}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
            {mode === 'live'
              ? 'Conectado a la base de datos real y WhatsApp físico.'
              : 'Datos estáticos pulidos para presentaciones de venta.'}
          </p>
        </div>

        {/* Sesión del usuario autenticado */}
        <div className="p-3.5 mx-3 mb-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sesión</div>
          <div className="text-xs font-semibold text-slate-200 truncate mt-0.5">
            {sessionUser?.name || 'Usuario'}
          </div>
          <div className="text-[10px] text-slate-400 truncate">{sessionUser?.email || ''}</div>
          <button
            onClick={handleLogout}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 bg-slate-700/50 hover:bg-red-600/80 hover:text-white border border-slate-600/60 rounded-lg transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* CONTENIDO PRINCIPAL CON TOPBAR */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col min-w-0 h-dvh overflow-hidden">
        {/* Top Navbar con Toggle de Modo y Herramientas Sandbox */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          {/* Lado izquierdo: menú (móvil), clínica y canal */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setIsNavOpen(true)}
              aria-controls="panel-nav"
              aria-expanded={isNavOpen}
              aria-label="Abrir menú"
              className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-slate-800 truncate">{activeTenant?.name || 'Sonrisas Polanco'}</span>
              <span className="hidden sm:inline text-[11px] text-slate-400 font-mono">({activeTenant?.phoneE164 || '+52'})</span>
            </div>

            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 pl-3 border-l border-slate-200 shrink-0">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp Cloud API Activa</span>
            </div>
          </div>

          {/* Lado derecho: SWITCH DUAL (Demo vs En Vivo) y Herramientas */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* HERRAMIENTAS DE PRUEBA (Sandbox Tools) */}
            {mode === 'live' && (
              <div className="flex items-center gap-1.5 sm:mr-2">
                <button
                  onClick={handleSeed}
                  disabled={isSeeding}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                  title="Generar 4 citas de prueba en este cliente para ver cómo se llena la agenda"
                >
                  <Zap className={`w-3 h-3 ${isSeeding ? 'animate-pulse text-amber-500' : 'text-teal-600'}`} />
                  {isSeeding ? 'Generando...' : '+ Citas Demo'}
                </button>

                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Limpiar citas y mensajes de prueba para reiniciar"
                >
                  <RotateCcw className="w-3 h-3" />
                  Limpiar
                </button>
              </div>
            )}

            {/* SWITCH GLOBAL: EN VIVO vs SHOWCASE DEMO */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-xs">
              <button
                onClick={() => {
                  setMode('live');
                  showNotice('🟢 Modo En Vivo activado: Mostrando base de datos real.');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'live'
                    ? 'bg-white text-emerald-800 shadow-sm font-bold border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${mode === 'live' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className="sm:hidden">En Vivo</span>
                <span className="hidden sm:inline">🟢 En Vivo / Sandbox</span>
              </button>

              <button
                onClick={() => {
                  setMode('demo');
                  showNotice('🟣 Modo Demo Showcase activado: Ideal para proyectar a clientes.');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'demo'
                    ? 'bg-purple-600 text-white shadow-sm font-bold shadow-purple-600/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span className="sm:hidden">Demo</span>
                <span className="hidden sm:inline">🟣 Modo Demo (Clientes)</span>
              </button>
            </div>
          </div>
        </header>

        {/* Banner de Notificación Rápida */}
        {actionNotice && (
          <div className="bg-teal-600 text-white text-xs font-medium px-4 sm:px-6 py-2 flex items-center justify-between animate-in slide-in-from-top-1 duration-150">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-white/80 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Vigencia de la prueba. Solo en Modo En Vivo: en una demostración
            comercial, un aviso de "tu prueba vence" es ruido que además habla
            de la cuenta del vendedor, no de la clínica prospecto. */}
        {mode === 'live' && <TrialBanner />}

        {/* Banner Informativo si está en Modo Demo */}
        {mode === 'demo' && (
          <div className="bg-purple-50 border-b border-purple-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-purple-900 font-medium">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong>Modo Demo Showcase Activo</strong>
                <span className="hidden sm:inline">
                  : Estás visualizando datos comerciales ficticios con métricas de alto impacto, ideal para presentaciones de venta con clínicas prospecto.
                </span>
              </span>
            </div>
            <button
              onClick={() => setMode('live')}
              className="text-xs font-bold text-purple-700 underline hover:text-purple-900 shrink-0"
            >
              Volver a Modo En Vivo
            </button>
          </div>
        )}

        {/* Contenido de la Página */}
        <main className="flex-1 overflow-y-auto min-h-0 flex flex-col">
          {children}
        </main>
      </div>

      {/* ============================================================ */}
      {/* MODAL: CREAR NUEVA CLÍNICA (MULTI-TENANT) */}
      {/* ============================================================ */}
      {isNewTenantModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Dar de Alta Nueva Clínica</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Crea un cliente independiente con su propia agenda, doctores e inbox
                </p>
              </div>
              <button
                onClick={() => setIsNewTenantModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Comercial de la Clínica</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Dental Center Monterrey o Clínica Santa Fe"
                  value={newClinicName}
                  onChange={(e) => setNewClinicName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ciudad y Estado</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Monterrey, N.L."
                    value={newClinicCity}
                    onChange={(e) => setNewClinicCity(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono Móvil (+52)</label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej: +528122334455"
                    value={newClinicPhone}
                    onChange={(e) => setNewClinicPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dirección Física (con Valet Parking)</label>
                <input
                  type="text"
                  placeholder="Ej: Av. Vasconcelos 300, San Pedro Garza García, N.L."
                  value={newClinicAddress}
                  onChange={(e) => setNewClinicAddress(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-[11px] text-teal-800 leading-relaxed">
                💡 Al crear la clínica, se generarán automáticamente especialistas dentales (Dra. María Fernández, Dr. Roberto Mendoza) y el catálogo de tratamientos en MXN listos para operar.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewTenantModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTenant}
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm transition-all"
                >
                  {isSubmittingTenant ? 'Creando...' : 'Crear Clínica'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
