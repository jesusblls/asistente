'use client';

import React from 'react';
import { AlertTriangle, ArrowLeft, Calendar, ChevronDown, User } from 'lucide-react';
import { formatMexicanPhone } from '../../../lib/format';
import type { ConversationItem } from '../../../app/dashboard/inbox/types';

export interface ChatHeaderProps {
  activeConv: ConversationItem;
  chatHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onToggleTakeover: () => void;
}

/**
 * Encabezado del chat activo: identidad del paciente, control de takeover,
 * resumen de la cita (colapsable, solo por debajo de 1280 px donde no cabe
 * la ficha lateral) y los banners de urgencia / copiloto humano.
 */
export function ChatHeader({ activeConv, chatHeadingRef, onBack, onToggleTakeover }: ChatHeaderProps) {
  return (
    <>
      <div className="p-3 sm:p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a la lista de conversaciones"
            className="md:hidden -ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="hidden sm:flex w-10 h-10 shrink-0 rounded-full bg-teal-600 text-white items-center justify-center font-bold text-sm">
            {activeConv.patientName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2
                ref={chatHeadingRef}
                tabIndex={-1}
                className="text-sm font-bold text-slate-900 truncate focus:outline-none"
              >
                {activeConv.patientName}
              </h2>
              {/* Teléfono y etiqueta larga solo si el panel del chat mide 640 px
                  o más: por debajo truncaban el nombre del paciente. */}
              <span className="hidden [@container_(min-width:40rem)]:inline text-xs text-slate-500 font-mono tabular-nums shrink-0">
                {formatMexicanPhone(activeConv.phone)}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Canal: <strong className="text-slate-700 font-medium">{activeConv.channel}</strong>
              <span> • </span>
              <span>Estado: {activeConv.status}</span>
            </p>
          </div>
        </div>

        {/* Botón de Control / Takeover */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden [@container_(min-width:48rem)]:block">
            <span className="text-xs font-semibold text-slate-700 block">
              {activeConv.isHandedOverToHuman ? '👤 Humano en Control' : '🤖 Asistente IA Activo'}
            </span>
            <span className="text-[11px] text-slate-400">
              {activeConv.isHandedOverToHuman
                ? 'La IA está pausada para este chat'
                : 'La IA responde automáticamente 24/7'}
            </span>
          </div>
          <button
            onClick={onToggleTakeover}
            className={`min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
              activeConv.isHandedOverToHuman
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span className="[@container_(min-width:40rem)]:hidden">
              {activeConv.isHandedOverToHuman ? 'Devolver a IA' : 'Tomar control'}
            </span>
            <span className="hidden [@container_(min-width:40rem)]:inline">
              {activeConv.isHandedOverToHuman ? 'Devolver a la IA' : 'Tomar Control (Pausar IA)'}
            </span>
          </button>
        </div>
      </div>

      {/* Ficha resumida: el panel lateral solo cabe desde 1280 px, y la cita no debe perderse */}
      {activeConv.appointment && (
        <details className="xl:hidden group border-b border-slate-200 bg-white px-4 py-2.5 text-xs shrink-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
              <Calendar className="w-3.5 h-3.5 shrink-0 text-teal-600" />
              <span className="truncate">
                <strong className="font-semibold text-slate-900">{activeConv.appointment.serviceName}</strong>{' '}
                · {activeConv.appointment.startTime}
              </span>
            </span>
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-400 transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-slate-700">
            <dt className="text-slate-500">Especialista</dt>
            <dd>{activeConv.appointment.doctorName}</dd>
            <dt className="text-slate-500">Estado</dt>
            <dd>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  activeConv.appointment.status === 'CONFIRMED'
                    ? 'text-emerald-700 bg-emerald-100'
                    : 'text-amber-700 bg-amber-100'
                }`}
              >
                {activeConv.appointment.status === 'CONFIRMED' ? 'CONFIRMADA' : 'PENDIENTE'}
              </span>
            </dd>
            {activeConv.appointment.depositAmountMxn ? (
              <>
                <dt className="text-slate-500">Anticipo</dt>
                <dd className="font-semibold text-emerald-700">
                  ${activeConv.appointment.depositAmountMxn.toLocaleString('es-MX')} MXN{' '}
                  {activeConv.appointment.paymentStatus === 'DEPOSIT_PAID' ? 'Pagado' : 'Pendiente'}
                </dd>
              </>
            ) : null}
            {activeConv.appointment.symptoms && (
              <>
                <dt className="text-slate-500">Triaje</dt>
                <dd>{activeConv.appointment.symptoms}</dd>
              </>
            )}
          </dl>
        </details>
      )}

      {/* Banner de Urgencia Crítica / Triaje Nivel 2 */}
      {activeConv.isUrgent && (
        <div className="bg-red-50 border-b border-red-200/80 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-red-900 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 animate-pulse" />
            <span>
              <strong className="font-semibold">⚠️ Triaje Nivel 2 — Urgencia Médica/Dental:</strong>{' '}
              {activeConv.appointment?.symptoms || 'Dolor agudo reportado. Requiere valoración prioritaria para hoy.'}
            </span>
          </div>
          <span className="text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded-full shrink-0">
            Mismo Día
          </span>
        </div>
      )}

      {/* Banner Informativo de Modo Copiloto / Takeover Humano */}
      {activeConv.isHandedOverToHuman && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-amber-900 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong className="font-semibold">Modo Copiloto Humano Activo:</strong>{' '}
              La IA está en pausa en este chat. Estás respondiendo manualmente a {activeConv.patientName}.
            </span>
          </div>
          <button
            onClick={onToggleTakeover}
            className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline underline-offset-2 ml-2 shrink-0"
          >
            Reactivar IA 24/7
          </button>
        </div>
      )}
    </>
  );
}
