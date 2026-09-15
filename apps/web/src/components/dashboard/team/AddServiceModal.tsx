'use client';

import React from 'react';
import { AlertCircle, DollarSign, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  mode: 'demo' | 'live';
  tenantName?: string;
  name: string;
  setName: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  presetCategories: string[];
  durationMinutes: number;
  setDurationMinutes: (v: number) => void;
  presetDurations: number[];
  priceMxn: number | '';
  setPriceMxn: (v: number | '') => void;
  requiredDepositMxn: number | '';
  setRequiredDepositMxn: (v: number | '') => void;
  description: string;
  setDescription: (v: string) => void;
  error: string | null;
  isSubmitting: boolean;
}

export function AddServiceModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
  tenantName,
  name,
  setName,
  category,
  setCategory,
  presetCategories,
  durationMinutes,
  setDurationMinutes,
  presetDurations,
  priceMxn,
  setPriceMxn,
  requiredDepositMxn,
  setRequiredDepositMxn,
  description,
  setDescription,
  error,
  isSubmitting,
}: AddServiceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Registrar Nuevo Tratamiento
              </h3>
              <p className="text-xs text-slate-500">
                {mode === 'demo'
                  ? 'Se agregará a la demostración interactiva'
                  : `Se asociará a la clínica: ${tenantName || 'Activa'}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre del tratamiento o procedimiento *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Ortodoncia con Brackets de Zafiro"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Categoría
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {presetCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                      category === cat
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="O escribe una categoría personalizada"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Duración del procedimiento
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {presetDurations.map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setDurationMinutes(dur)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                      durationMinutes === dur
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    )}
                  >
                    {dur} min
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                />
                <span className="text-xs text-slate-500">minutos reservados en agenda</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Precio Oficial (MXN) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={priceMxn}
                    onChange={(e) =>
                      setPriceMxn(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="450"
                    className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-12 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                  <span className="absolute right-3 top-2 text-slate-400 text-xs">MXN</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Anticipo Requerido (MXN) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={requiredDepositMxn}
                    onChange={(e) =>
                      setRequiredDepositMxn(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-12 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                  />
                  <span className="absolute right-3 top-2 text-slate-400 text-xs">MXN</span>
                </div>
              </div>
            </div>

            {/* Accesos rápidos de porcentaje para el anticipo */}
            {typeof priceMxn === 'number' && priceMxn > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="text-[11px] text-slate-400">Atajos de anticipo:</span>
                <button
                  type="button"
                  onClick={() => setRequiredDepositMxn(0)}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                >
                  Sin anticipo ($0)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRequiredDepositMxn(Math.round(priceMxn * 0.2))
                  }
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                >
                  20% (${Math.round(priceMxn * 0.2)})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRequiredDepositMxn(Math.round(priceMxn * 0.5))
                  }
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium"
                >
                  50% (${Math.round(priceMxn * 0.5)})
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descripción breve (para el Asistente IA)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles clave que la IA puede explicarle al paciente por WhatsApp o llamada..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Tratamiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
