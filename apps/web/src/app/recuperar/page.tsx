'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { KeyRound, Loader2, MailCheck, ArrowLeft } from 'lucide-react';
import { forgotPasswordRequest } from '../../lib/api';

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      setSentMessage(await forgotPasswordRequest(email.trim()));
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
          <span className="text-sm font-semibold uppercase tracking-wide">Recuperar acceso</span>
        </div>

        {sentMessage ? (
          <div>
            <div className="flex items-start gap-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <MailCheck className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{sentMessage}</p>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              El enlace vence en 30 minutos y solo sirve una vez.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">¿Olvidaste tu contraseña?</h1>
            <p className="text-sm text-slate-500 mt-1">
              Escribe el correo con el que entras al panel y te mandamos un enlace para elegir una nueva.
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
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting ? 'Enviando...' : 'Enviarme el enlace'}
              </button>

              <p className="text-center text-xs text-slate-500">
                ¿Ya la recordaste?{' '}
                <Link href="/login" className="font-semibold text-teal-700 hover:text-teal-800">
                  Inicia sesión
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
