'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { useModalDialog } from '../../hooks/useModalDialog';

export interface ResetTenantModalProps {
  clinicName: string;
  isResetting: boolean;
  /** Motivo del último intento fallido, mostrado dentro del propio modal. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmación de "Limpiar". La ruta borra TODO el historial de la clínica,
 * no solo lo sembrado con "+ Citas Demo": por eso se exige escribir el nombre
 * exacto de la clínica, igual que al borrar un repositorio. Un `confirm()` de
 * un clic que hablaba de "datos de prueba" no protegía nada.
 */
export function ResetTenantModal({ clinicName, isResetting, error, onCancel, onConfirm }: ResetTenantModalProps) {
  const [typed, setTyped] = useState('');
  const { dialogRef, initialFocusRef } = useModalDialog<HTMLInputElement>({
    open: true,
    onClose: onCancel,
    canClose: !isResetting,
  });

  const matches = typed === clinicName;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matches && !isResetting) onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-tenant-title"
        aria-describedby="reset-tenant-desc"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="reset-tenant-title" className="font-bold text-slate-900 text-lg leading-tight">
                Borrar el historial de la clínica
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{clinicName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isResetting}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div id="reset-tenant-desc" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 leading-relaxed space-y-2">
            <p>
              Se eliminarán <strong>permanentemente todas</strong> las citas, conversaciones y mensajes de
              esta clínica, <strong>incluidos los de pacientes reales</strong>, no solo los generados con
              “+ Citas Demo”.
            </p>
            <p className="text-red-800">
              Se conservan doctores, servicios, pacientes y configuración. La bitácora de auditoría registra
              este borrado. No se puede deshacer.
            </p>
          </div>

          <div>
            <label htmlFor="reset-tenant-confirm" className="block text-xs font-semibold text-slate-700 mb-1">
              Para confirmar, escribe el nombre exacto de la clínica:{' '}
              <span className="font-mono font-bold text-slate-900 select-all">{clinicName}</span>
            </label>
            <input
              id="reset-tenant-confirm"
              ref={initialFocusRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isResetting}
              className="w-full text-base sm:text-sm px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="pt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={isResetting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!matches || isResetting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 shadow-sm transition-colors disabled:bg-red-300 disabled:cursor-not-allowed"
            >
              {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {isResetting ? 'Borrando...' : 'Borrar historial'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
