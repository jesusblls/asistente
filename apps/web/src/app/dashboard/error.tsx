'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

/**
 * Error boundary del panel. Aísla los fallos de una vista (inbox, calendario,
 * equipo, ajustes) para que el resto del panel siga operativo.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard/error] Error de renderizado:', error);
  }, [error]);

  return (
    <div className="p-8">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-amber-600 border border-amber-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-amber-900">
              No se pudo cargar esta sección del panel
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              La conversación y los datos siguen a salvo en la base de datos. Reintenta o vuelve al
              resumen general.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
              >
                <RefreshCw className="h-4 w-4" />
                Reintentar
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <LayoutDashboard className="h-4 w-4" />
                Ir al resumen
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
