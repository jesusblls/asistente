'use client';

import React from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  MessageSquare,
  Phone,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { formatMexicanPhone } from '../../../lib/format';
import type { ApiAppointment } from '../../../app/dashboard/calendar/types';

export interface AppointmentRowProps {
  appt: ApiAppointment;
  isToday: boolean;
  isTomorrow: boolean;
  formatApptTime: (isoStr: string) => string;
  formatApptDate: (isoStr: string) => string;
  onUpdateStatus: (appointmentId: string, newStatus: string) => void;
}

/** Una fila de la agenda: horario, datos del paciente/consulta, estado y acciones rápidas. */
export function AppointmentRow({
  appt,
  isToday,
  isTomorrow,
  formatApptTime,
  formatApptDate,
  onUpdateStatus,
}: AppointmentRowProps) {
  return (
    <div
      className={`p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors hover:bg-slate-50 ${
        isTomorrow ? 'border-l-4 border-l-teal-500 bg-teal-50/10' : ''
      }`}
    >
      {/* Horario y Fecha */}
      <div className="flex items-start gap-4">
        <div className="w-28 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 font-mono">
            <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            {formatApptTime(appt.startTime)}
          </div>
          <div className="text-[11px] font-semibold text-slate-600 mt-1 flex items-center gap-1">
            <CalendarIcon className="w-3 h-3 text-slate-400" />
            {formatApptDate(appt.startTime)}
          </div>
          {isTomorrow && (
            <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 rounded">
              Mañana
            </span>
          )}
          {isToday && (
            <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded">
              Hoy
            </span>
          )}
        </div>

        {/* Datos del Paciente y Consulta */}
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="font-bold text-slate-900 text-base">{appt.patient?.fullName}</h3>
            <span className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-1">
              <Phone className="w-3 h-3 text-slate-400" />
              {formatMexicanPhone(appt.patient?.phoneE164)}
            </span>
            {appt.channelOrigin === 'WHATSAPP' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                <MessageSquare className="w-3 h-3" />
                WhatsApp
              </span>
            )}
          </div>

          <p className="text-xs text-slate-700 font-medium">
            <span className="font-semibold text-slate-900">{appt.service?.name}</span> •{' '}
            <span className="text-teal-700 font-semibold">{appt.doctor?.name}</span> (
            {appt.doctor?.specialty})
          </p>

          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-slate-500 pt-0.5">
            <span>Duración: {appt.service?.durationMinutes || 45} min</span>
            <span>•</span>
            <span>Precio: ${appt.service?.priceMxn} MXN</span>
            {appt.symptoms && (
              <>
                <span>•</span>
                <span className="italic text-slate-600">&quot;{appt.symptoms}&quot;</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Badges y Acciones Rápidas */}
      <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
        {/* Badge de Estatus */}
        {appt.status === 'CONFIRMED' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Confirmada
          </span>
        ) : appt.status === 'COMPLETED' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-md border border-blue-200">
            <Check className="w-3.5 h-3.5 text-blue-600" />
            Completada
          </span>
        ) : appt.status === 'CANCELLED' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-md border border-red-200">
            <X className="w-3.5 h-3.5 text-red-600" />
            Cancelada
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md">
            Pendiente
          </span>
        )}

        {/* Anticipo */}
        {appt.paymentStatus === 'DEPOSIT_PENDING' && (
          <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
            Anticipo ${appt.depositAmountMxn || 200} MXN Pendiente
          </span>
        )}

        {/* Botón WhatsApp directo */}
        <a
          href={`https://wa.me/${appt.patient?.phoneE164?.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
          WhatsApp
        </a>

        {/* Acciones de Estado */}
        {appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED' && (
          <button
            onClick={() => onUpdateStatus(appt.id, 'CONFIRMED')}
            className="px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
            title="Confirmar Asistencia"
          >
            Confirmar
          </button>
        )}

        {appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED' && (
          <button
            onClick={() => onUpdateStatus(appt.id, 'COMPLETED')}
            className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            title="Marcar como atendida"
          >
            Completar
          </button>
        )}

        {appt.status !== 'CANCELLED' && (
          <button
            onClick={() => onUpdateStatus(appt.id, 'CANCELLED')}
            className="px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            title="Cancelar cita"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
