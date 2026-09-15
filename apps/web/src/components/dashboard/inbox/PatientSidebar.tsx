'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { formatMexicanPhone } from '../../../lib/format';
import type { ConversationItem } from '../../../app/dashboard/inbox/types';

export interface PatientSidebarProps {
  activeConv: ConversationItem;
}

/** Columna derecha: ficha del paciente, cita activa y notas de triaje. Solo visible desde 1280 px. */
export function PatientSidebar({ activeConv }: PatientSidebarProps) {
  return (
    <div className="w-72 bg-white p-5 overflow-y-auto hidden xl:block shrink-0 space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Ficha del Paciente
        </h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-xs text-slate-400 block">Nombre Completo</span>
            <p className="font-semibold text-slate-900">{activeConv.patientName}</p>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Teléfono (México)</span>
            <p className="font-mono text-slate-800 font-semibold tabular-nums">
              {formatMexicanPhone(activeConv.phone) || 'No registrado'}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Canal Principal</span>
            <span className="inline-block mt-0.5 text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
              {activeConv.channel}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Cita Activa</h3>
        {activeConv.appointment ? (
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 truncate">{activeConv.appointment.serviceName}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  activeConv.appointment.status === 'CONFIRMED'
                    ? 'text-emerald-700 bg-emerald-100'
                    : 'text-amber-700 bg-amber-100'
                }`}
              >
                {activeConv.appointment.status === 'CONFIRMED' ? 'CONFIRMADA' : 'PENDIENTE'}
              </span>
            </div>
            <p className="text-slate-600">{activeConv.appointment.doctorName}</p>
            <div className="flex items-center gap-1 text-slate-500 font-medium">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{activeConv.appointment.startTime}</span>
            </div>
            {activeConv.appointment.depositAmountMxn ? (
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Anticipo:</span>
                <span className="font-bold text-emerald-700">
                  ${activeConv.appointment.depositAmountMxn.toLocaleString('es-MX')} MXN{' '}
                  {activeConv.appointment.paymentStatus === 'DEPOSIT_PAID' ? 'Pagado' : 'Pendiente'}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
            <p className="text-xs text-slate-500">Sin cita programada actualmente</p>
            <span className="text-[10px] text-slate-400">Atendido por Asistente IA</span>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notas de Triaje</h3>
        <p className="text-xs text-amber-950 font-medium leading-relaxed bg-amber-50 border border-amber-200/80 p-2.5 rounded-lg">
          {activeConv.appointment?.symptoms ||
            'Paciente atendido mediante canal digital. Diagnóstico y requerimientos canalizados.'}
        </p>
      </div>
    </div>
  );
}
