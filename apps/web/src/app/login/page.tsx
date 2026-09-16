'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogIn, Loader2 } from 'lucide-react';
import { loginRequest, setSession } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await loginRequest({
        email: email.trim(),
        password,
        tenantSlug: tenantSlug.trim() || undefined,
      });
      setSession(session.token, session.user, session.tenant);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión con el servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="flex items-center gap-2 text-teal-700 mb-6">
          <ShieldCheck className="w-6 h-6" />
          <span className="text-sm font-semibold uppercase tracking-wide">Acceso al panel clínico</span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Inicia sesión</h1>
        <p className="text-sm text-slate-500 mt-1">
          Credenciales del personal autorizado de la clínica.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="admin@clinica.mx"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="tenantSlug">
              Clínica (opcional)
            </label>
            <input
              id="tenantSlug"
              type="text"
              value={tenantSlug}
              onChange={(event) => setTenantSlug(event.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="dental-polanco"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Solo es necesario si tu correo está registrado en más de una clínica.
            </p>
          </div>

          {error && (
            <div className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {isSubmitting ? 'Verificando...' : 'Entrar al panel'}
          </button>

          <p className="text-center text-xs text-slate-500">
            ¿Tu clínica todavía no tiene cuenta?{' '}
            <Link href="/registro" className="font-semibold text-teal-700 hover:text-teal-800">
              Pruébalo gratis 14 días
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
