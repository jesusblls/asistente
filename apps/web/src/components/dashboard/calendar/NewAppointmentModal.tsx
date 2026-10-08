'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Stethoscope, X } from 'lucide-react';
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
  /** El catálogo de doctores/servicios sigue cargando. */
  catalogLoading?: boolean;
  /** Error al cargar el catálogo de doctores/servicios. */
  catalogError?: string | null;
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
  catalogLoading = false,
  catalogError = null,
}: NewAppointmentModalProps) {
  if (!isOpen) return null;

  const missingDoctors = doctors.length === 0;
  const missingServices = services.length === 0;
  const catalogIncomplete = !catalogLoading && !catalogError && (missingDoctors || missingServices);
  // Con el catálogo en error, lo que hay en pantalla puede ser de otra clínica:
  // no se permite agendar hasta que cargue bien.
  const canSubmit = !catalogLoading && !catalogError && !missingDoctors && !missingServices;
  const missingLabel =
    missingDoctors && missingServices
      ? 'especialistas ni tratamientos'
      : missingDoctors
        ? 'especialistas'
        : 'tratamientos';

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
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {catalogLoading && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
              Cargando especialistas y tratamientos de la clínica…
            </div>
          )}

          {catalogError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{catalogError}</span>
            </div>
          )}

          {catalogIncomplete && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2.5">
              <div className="flex items-start gap-2">
                <Stethoscope className="w-4 h-4 shrink-0 mt-px text-amber-600" />
                <p>
                  <span className="font-bold">Tu clínica aún no tiene {missingLabel}.</span> Para
                  agendar una cita necesitas al menos un especialista con horario y un tratamiento
                  con precio en MXN.
                </p>
              </div>
              <Link
                href="/dashboard/team"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
              >
                Ir a Especialistas y Tratamientos
              </Link>
            </div>
          )}

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
                disabled={missingDoctors}
                aria-label="Especialista"
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {missingDoctors && <option value="">Sin especialistas registrados</option>}
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
                disabled={missingServices}
                aria-label="Tratamiento"
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {missingServices && <option value="">Sin tratamientos registrados</option>}
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
              disabled={isSubmitting || !canSubmit}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSubmitting ? 'Guardando...' : 'Confirmar y Agendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
