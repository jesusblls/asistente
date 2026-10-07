'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import { resetPasswordRequest } from '../../lib/api';

const MIN_PASSWORD_LENGTH = 10;

export default function RestablecerPage() {
  const router = useRouter();
  // `null` mientras se lee el fragmento; '' si el enlace no trae token.
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    // El token llega en el fragmento (#token=...) para que nunca viaje al
    // servidor en la URL. Se quita de la barra de direcciones en cuanto se
    // lee: así no queda en el historial ni se comparte al copiar la URL.
    // Si el efecto corre dos veces (StrictMode), la segunda ya no encuentra
    // el fragmento: no debe pisar el token que leyó la primera.
    const readToken = () => {
      const found = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (found) {
        setToken(found);
        setError(null);
        window.history.replaceState(null, '', window.location.pathname);
      } else {
        setToken((current) => current ?? '');
      }
    };
    readToken();
    // Abrir un segundo enlace con la página ya abierta solo cambia el
    // fragmento, sin recargar: hay que volver a leerlo.
    window.addEventListener('hashchange', readToken);
    return () => window.removeEventListener('hashchange', readToken);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPasswordRequest(token ?? '', password);
      setIsDone(true);
      setTimeout(() => router.replace('/login'), 2500);
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
          <KeyRound className="w-6 h-6" />
          <span className="text-sm font-semibold uppercase tracking-wide">Nueva contraseña</span>
        </div>

        {isDone ? (
          <div className="flex items-start gap-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <p>Listo, tu contraseña cambió. Te llevamos a iniciar sesión...</p>
          </div>
        ) : token === '' ? (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Enlace incompleto</h1>
            <p className="text-sm text-slate-500 mt-2">
              Este enlace no trae el código de recuperación. Ábrelo directo desde el correo o pide uno nuevo.
            </p>
            <Link
              href="/recuperar"
              className="mt-6 w-full inline-flex items-center justify-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Pedir un enlace nuevo
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Elige una contraseña nueva</h1>
            <p className="text-sm text-slate-500 mt-1">
              Al guardarla se cerrarán las sesiones abiertas en otros dispositivos.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="password">
                  Contraseña nueva
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="confirmation">
                  Repite la contraseña
                </label>
                <input
                  id="confirmation"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {error && (
                <div className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}{' '}
                  {error.includes('venció') && (
                    <Link href="/recuperar" className="underline font-semibold">
                      Pedir otro
                    </Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || token === null}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
