import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { LEGAL_ENTITY, LEGAL_ENTITY_COMPLETE, LEGAL_VERSION, legalVersionLabel } from '../../lib/legal';

/** Dato del responsable; si falta, se resalta en vez de inventarlo. */
export function EntityField({ field }: { field: keyof typeof LEGAL_ENTITY }) {
  const value = LEGAL_ENTITY[field].trim();
  if (value) return <>{value}</>;
  return (
    <mark className="bg-amber-100 text-amber-800 px-1 rounded not-italic">[dato pendiente de publicar]</mark>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export function LegalDocument({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800">
          <ArrowLeft className="w-4 h-4" /> AsistentePro
        </Link>

        <article className="mt-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-8">
          <header className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">Versión vigente desde el {legalVersionLabel(LEGAL_VERSION)}</p>
            {!LEGAL_ENTITY_COMPLETE && (
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Este documento todavía no incluye todos los datos de identificación del responsable. Los datos resaltados se publicarán a la brevedad.</p>
              </div>
            )}
            <div className="text-sm leading-relaxed text-slate-700 pt-2">{intro}</div>
          </header>
          {children}
        </article>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/privacidad" className="hover:text-teal-700">Aviso de Privacidad</Link>
          {' · '}
          <Link href="/terminos" className="hover:text-teal-700">Términos de Servicio</Link>
        </p>
      </div>
    </main>
  );
}
