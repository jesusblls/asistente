'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Error boundary raíz del App Router.
 * Captura fallos de renderizado en la landing y en el dashboard para que el
 * usuario vea una salida clara en lugar de una pantalla en blanco.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error] Error de renderizado:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Algo salió mal</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ocurrió un error inesperado al mostrar esta pantalla. Puedes intentarlo de nuevo.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    </div>
  );
}
