'use client';

import React, { useId, useRef } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export interface DeleteConfirmTarget {
  id: string;
  name: string;
  type: 'doctor' | 'service';
}

export interface DeleteConfirmModalProps {
  target: DeleteConfirmTarget | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  error: string | null;
}

export function DeleteConfirmModal({
  target,
  onClose,
  onConfirm,
  isDeleting,
  error,
}: DeleteConfirmModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  // Confirmación destructiva: el foco inicial va a "Cancelar", no a "Sí, eliminar".
  const cancelRef = useRef<HTMLButtonElement>(null);


  return (
    <Modal
      isOpen={target !== null}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      role="alertdialog"
      dismissible={!isDeleting}
      initialFocusRef={cancelRef}
      panelClassName="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="p-6 space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>

        <div className="text-center space-y-1">
          <h3 id={titleId} className="text-base font-bold text-slate-900">
            ¿Eliminar {target?.type === 'doctor' ? 'especialista' : 'tratamiento'}?
          </h3>
          <p id={descriptionId} className="text-xs text-slate-500">
            Estás a punto de eliminar a{' '}
            <strong className="text-slate-800 font-semibold">&quot;{target?.name}&quot;</strong>.
            Esta acción removerá el registro de la disponibilidad del Asistente IA.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
        <button
          ref={cancelRef}
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
        >
          {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
        </button>
      </div>
    </Modal>
  );
}
