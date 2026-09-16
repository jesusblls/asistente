'use client';

import React from 'react';
import { Clock } from 'lucide-react';

/**
 * Editor de horarios de consulta.
 *
 * Sustituye al campo de texto libre que había antes ("Lunes a Viernes: 9:00 -
 * 18:00"): ese texto no se podía traducir a reglas de agenda, así que el
 * `SchedulerService` terminaba usando su horario por defecto y rechazaba
 * citas reales fuera de él. Aquí se captura estructurado desde el principio.
 */

export interface DayShift {
  enabled: boolean;
  start: string;
  end: string;
  hasLunch: boolean;
  lunchStart: string;
  lunchEnd: string;
}

/** Índices de `Date.getDay()`: 0 es domingo. */
export type WeeklySchedule = Record<number, DayShift>;

export const DAY_LABELS: { day: number; short: string; long: string }[] = [
  { day: 1, short: 'Lun', long: 'Lunes' },
  { day: 2, short: 'Mar', long: 'Martes' },
  { day: 3, short: 'Mié', long: 'Miércoles' },
  { day: 4, short: 'Jue', long: 'Jueves' },
  { day: 5, short: 'Vie', long: 'Viernes' },
  { day: 6, short: 'Sáb', long: 'Sábado' },
  { day: 0, short: 'Dom', long: 'Domingo' },
];

export const SLOT_DURATION_OPTIONS = [15, 20, 30, 45, 60, 90];

function emptyDay(enabled: boolean): DayShift {
  return {
    enabled,
    start: '09:00',
    end: '18:00',
    hasLunch: enabled,
    lunchStart: '14:00',
    lunchEnd: '15:00',
  };
}

/** Semana típica de consultorio: lunes a viernes con hora de comida. */
export function defaultWeeklySchedule(): WeeklySchedule {
  const schedule: WeeklySchedule = {};
  for (const { day } of DAY_LABELS) {
    schedule[day] = emptyDay(day >= 1 && day <= 5);
  }
  return schedule;
}

/** Convierte el estado del editor al JSON que espera la API. */
export function toAvailabilityRules(schedule: WeeklySchedule, slotDurationMinutes: number) {
  const days: Record<number, { start: string; end: string; lunchStart?: string; lunchEnd?: string }[]> =
    {};

  for (const { day } of DAY_LABELS) {
    const shift = schedule[day];
    if (!shift?.enabled) continue;

    days[day] = [
      shift.hasLunch
        ? {
            start: shift.start,
            end: shift.end,
            lunchStart: shift.lunchStart,
            lunchEnd: shift.lunchEnd,
          }
        : { start: shift.start, end: shift.end },
    ];
  }

  return { days, slotDurationMinutes, bufferBetweenAppointmentsMinutes: 10 };
}

/** Lee el JSON guardado para poder editarlo. Devuelve la semana por defecto si no hay nada usable. */
export function fromAvailabilityRules(raw?: string | null): {
  schedule: WeeklySchedule;
  slotDurationMinutes: number;
} {
  const fallback = { schedule: defaultWeeklySchedule(), slotDurationMinutes: 45 };
  if (!raw || !raw.trim().startsWith('{')) return fallback;

  try {
    const parsed = JSON.parse(raw) as {
      days?: Record<string, { start: string; end: string; lunchStart?: string; lunchEnd?: string }[]>;
      slotDurationMinutes?: number;
    };
    if (!parsed.days || typeof parsed.days !== 'object') return fallback;

    const schedule: WeeklySchedule = {};
    for (const { day } of DAY_LABELS) {
      const shifts = parsed.days[String(day)];
      const shift = Array.isArray(shifts) ? shifts[0] : undefined;
      schedule[day] = shift
        ? {
            enabled: true,
            start: shift.start,
            end: shift.end,
            hasLunch: Boolean(shift.lunchStart && shift.lunchEnd),
            lunchStart: shift.lunchStart || '14:00',
            lunchEnd: shift.lunchEnd || '15:00',
          }
        : emptyDay(false);
    }

    return {
      schedule,
      slotDurationMinutes: parsed.slotDurationMinutes || 45,
    };
  } catch {
    return fallback;
  }
}

/** Resumen legible de la semana, para mostrarlo fuera del editor. */
export function describeSchedule(schedule: WeeklySchedule): string {
  const active = DAY_LABELS.filter(({ day }) => schedule[day]?.enabled);
  if (active.length === 0) return 'Sin días de atención';

  return active
    .map(({ day, short }) => `${short} ${schedule[day].start}-${schedule[day].end}`)
    .join(' · ');
}

export interface ScheduleEditorProps {
  schedule: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
  slotDurationMinutes: number;
  onSlotDurationChange: (minutes: number) => void;
}

export function ScheduleEditor({
  schedule,
  onChange,
  slotDurationMinutes,
  onSlotDurationChange,
}: ScheduleEditorProps) {
  const update = (day: number, patch: Partial<DayShift>) => {
    onChange({ ...schedule, [day]: { ...schedule[day], ...patch } });
  };

  const noDaysSelected = DAY_LABELS.every(({ day }) => !schedule[day]?.enabled);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-slate-700">
        <Clock className="w-4 h-4 text-teal-600" />
        <span className="text-xs font-semibold">Horario de consulta</span>
      </div>

      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {DAY_LABELS.map(({ day, short, long }) => {
          const shift = schedule[day] ?? emptyDay(false);
          const invalidRange = shift.enabled && shift.end <= shift.start;

          return (
            <div key={day} className="px-3 py-2.5 bg-white">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="flex items-center gap-2 w-24 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shift.enabled}
                    onChange={(e) =>
                      update(day, { enabled: e.target.checked, hasLunch: e.target.checked && shift.hasLunch })
                    }
                    aria-label={`Atiende los ${long}`}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span
                    className={`text-sm font-semibold ${shift.enabled ? 'text-slate-900' : 'text-slate-400'}`}
                  >
                    {short}
                  </span>
                </label>

                {shift.enabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={shift.start}
                      onChange={(e) => update(day, { start: e.target.value })}
                      aria-label={`Hora de apertura del ${long}`}
                      className="px-2 py-1 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                    />
                    <span className="text-slate-400 text-xs">a</span>
                    <input
                      type="time"
                      value={shift.end}
                      onChange={(e) => update(day, { end: e.target.value })}
                      aria-label={`Hora de cierre del ${long}`}
                      className={`px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                        invalidRange
                          ? 'border-red-300 focus:ring-red-500/30'
                          : 'border-slate-300 focus:ring-teal-500/30 focus:border-teal-500'
                      }`}
                    />

                    <label className="flex items-center gap-1.5 ml-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shift.hasLunch}
                        onChange={(e) => update(day, { hasLunch: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-[11px] text-slate-500">Comida</span>
                    </label>

                    {shift.hasLunch && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={shift.lunchStart}
                          onChange={(e) => update(day, { lunchStart: e.target.value })}
                          aria-label={`Inicio de comida del ${long}`}
                          className="px-2 py-1 text-xs border border-slate-200 bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                        <span className="text-slate-400 text-xs">a</span>
                        <input
                          type="time"
                          value={shift.lunchEnd}
                          onChange={(e) => update(day, { lunchEnd: e.target.value })}
                          aria-label={`Fin de comida del ${long}`}
                          className="px-2 py-1 text-xs border border-slate-200 bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">No atiende</span>
                )}
              </div>

              {invalidRange && (
                <p className="text-[11px] text-red-600 mt-1 ml-[6.5rem]">
                  El cierre debe ser posterior a la apertura.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {noDaysSelected && (
        <p className="text-[11px] text-amber-600">
          Marca al menos un día: sin horario el asistente no puede ofrecer citas.
        </p>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="slotDuration">
          Duración base por cita
        </label>
        <select
          id="slotDuration"
          value={slotDurationMinutes}
          onChange={(e) => onSlotDurationChange(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        >
          {SLOT_DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutos
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
