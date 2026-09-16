'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Sparkles, Loader2, Check } from 'lucide-react';
import { registerRequest, setSession } from '../../lib/api';

const TRIAL_DAYS = 14;
const MIN_PASSWORD_LENGTH = 10;

const INCLUIDO = [
  'Acceso completo durante 14 días',
  'Sin tarjeta de crédito',
  'WhatsApp, voz con IA y agenda',
  'Cancelas cuando quieras',
];

export default function RegistroPage() {
  const router = useRouter();
  const [clinicName, setClinicName] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await registerRequest({
        clinicName: clinicName.trim(),
        phoneE164: phoneE164.trim(),
        adminName: adminName.trim(),
        email: email.trim(),
        password,
      });
      setSession(session.token, session.user, session.tenant);
      // La cuenta nace vacía: sin doctores, horarios ni precios la IA no tiene
      // con qué atender, así que el primer destino es la configuración inicial.
      router.replace('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión con el servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
        {/* Columna de valor */}
        <aside className="bg-gradient-to-br from-teal-700 to-teal-900 text-white rounded-2xl p-7 lg:p-8 shadow-sm">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            {TRIAL_DAYS} días gratis
          </div>
          <h2 className="mt-5 text-2xl font-extrabold leading-tight tracking-tight">
            Tu recepcionista con IA, atendiendo hoy mismo
          </h2>
          <p className="mt-3 text-sm text-teal-50/90 leading-relaxed">
            Crea tu cuenta y configura tu consultorio en unos minutos. Contesta WhatsApp y
            llamadas, agenda citas y cobra anticipos las 24 horas.
          </p>
          <ul className="mt-6 space-y-2.5">
            {INCLUIDO.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-teal-50">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-teal-200" />
                {item}
              </li>
            ))}
          </ul>
        </aside>

        {/* Formulario */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 lg:p-8">
          <div className="flex items-center gap-2 text-teal-700 mb-5">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Crear cuenta de clínica
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Empieza tu prueba gratuita
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sin tarjeta. Sin contrato. Configuras y decides.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="clinicName">
                Nombre de tu clínica o consultorio
              </label>
              <input
                id="clinicName"
                type="text"
                required
                maxLength={200}
                value={clinicName}
                onChange={(event) => setClinicName(event.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Clínica Dental Sonrisas"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="phoneE164">
                Teléfono de la clínica
              </label>
              <input
                id="phoneE164"
                type="tel"
                required
                autoComplete="tel"
                value={phoneE164}
                onChange={(event) => setPhoneE164(event.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="55 1234 5678"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Número mexicano. Puedes escribirlo con lada, sin prefijos.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="adminName">
                Tu nombre
              </label>
              <input
                id="adminName"
                type="text"
                required
                autoComplete="name"
                maxLength={200}
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Dra. Mariana Valdez"
              />
            </div>

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
                placeholder="contacto@clinica.mx"
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
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                  passwordTooShort
                    ? 'border-amber-300 focus:ring-amber-500'
                    : 'border-slate-300 focus:ring-teal-500'
                }`}
                placeholder="Mínimo 10 caracteres"
              />
              <p
                className={`text-[11px] mt-1 ${passwordTooShort ? 'text-amber-600' : 'text-slate-400'}`}
              >
                {passwordTooShort
                  ? `Te faltan ${MIN_PASSWORD_LENGTH - password.length} caracteres`
                  : `Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isSubmitting ? 'Creando tu clínica...' : `Crear cuenta y probar ${TRIAL_DAYS} días`}
            </button>

            <p className="text-center text-xs text-slate-500">
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" className="font-semibold text-teal-700 hover:text-teal-800">
                Inicia sesión
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
