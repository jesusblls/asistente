'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { TenantDoctor, TenantService } from '../../../app/dashboard/calendar/types';

export interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  doctors: TenantDoctor[];
  services: TenantService[];
  patientName: string;
  setPatientName: (v: string) => void;
  patientPhone: string;
  setPatientPhone: (v: string) => void;
  doctorId: string;
  setDoctorId: (v: string) => void;
  serviceId: string;
  setServiceId: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  symptoms: string;
  setSymptoms: (v: string) => void;
  isSubmitting: boolean;
  submitError: string | null;
}

/** Modal para agendar una cita manualmente desde el panel de recepción. */
export function NewAppointmentModal({
  isOpen,
  onClose,
  onSubmit,
  doctors,
  services,
  patientName,
  setPatientName,
  patientPhone,
  setPatientPhone,
  doctorId,
  setDoctorId,
  serviceId,
  setServiceId,
  date,
  setDate,
  time,
  setTime,
  symptoms,
  setSymptoms,
  isSubmitting,
  submitError,
}: NewAppointmentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Agendar Cita Médica / Dental</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Registra una consulta presencial directamente en el sistema
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {submitError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {submitError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo del Paciente</label>
            <input
              type="text"
              required
              placeholder="Ej: JC o Juan Carlos Martínez"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono Móvil (México +52)</label>
            <input
              type="tel"
              required
              placeholder="Ej: 8128651819 o +528128651819"
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Especialista</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tratamiento</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name} (${svc.priceMxn} MXN)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fecha</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Horario (CDMX)</label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Motivo o Síntomas (Opcional)</label>
            <input
              type="text"
              placeholder="Ej: Limpieza dental de rutina"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm transition-all"
            >
              {isSubmitting ? 'Guardando...' : 'Confirmar y Agendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
