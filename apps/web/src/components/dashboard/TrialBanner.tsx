'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { API_BASE_URL, apiFetch } from '@/lib/api';

/**
 * Aviso de vigencia de la prueba gratuita.
 *
 * `GET /api/plan` ya sabía cuántos días quedan, pero el dato no llegaba a
 * ninguna pantalla: la clínica se enteraba de que su prueba venció cuando el
 * panel empezó a rechazarle acciones con un 402. Este aviso lo dice antes.
 */

interface PlanResumen {
  planName: string;
  status: string;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  gracePeriodEndsAt?: string | null;
  graceDaysLeft?: number | null;
  pastDueSince?: string | null;
  lastPaymentError?: string | null;
  isSuspended: boolean;
}

/** A partir de aquí el aviso deja de poder descartarse. */
const DIAS_CRITICOS = 3;

/** Debajo de esto el aviso pasa de informativo a advertencia. */
const DIAS_ADVERTENCIA = 7;

const CLAVE_DESCARTE = 'asistente_trial_banner_descartado';

/**
 * El descarte dura un día: la clínica puede quitarse el aviso de encima
 * mientras trabaja, pero vuelve a verlo mañana, con un día menos.
 */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function leerDescarte(): string | null {
  try {
    return localStorage.getItem(CLAVE_DESCARTE);
  } catch {
    // Ventana privada o almacenamiento bloqueado: se muestra el aviso.
    return null;
  }
}

function guardarDescarte(): void {
  try {
    localStorage.setItem(CLAVE_DESCARTE, hoyISO());
  } catch {
    // Sin almacenamiento el aviso reaparece al recargar; es el peor caso
    // aceptable, y nunca debe romper el panel.
  }
}

function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso));
}

export function TrialBanner() {
  const [plan, setPlan] = useState<PlanResumen | null>(null);
  const [descartado, setDescartado] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/plan`);
      if (!res.ok) return;
      setPlan(await res.json());
      setDescartado(leerDescarte() === hoyISO());
    } catch {
      // Un fallo de red no debe ensuciar el panel con un aviso a medias.
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!plan) return null;

  const suspendida = plan.isSuspended;
  const enPrueba = plan.status === 'TRIALING';
  const morosa = plan.status === 'PAST_DUE';

  // Una suscripción de paga y vigente no necesita aviso de ningún tipo.
  if (!suspendida && !enPrueba && !morosa) return null;

  const dias = plan.trialDaysLeft ?? 0;
  const diasGracia = plan.graceDaysLeft ?? 0;
  // En morosidad o suspensión el aviso siempre es crítico y no se descarta.
  const critico = suspendida || morosa || dias <= DIAS_CRITICOS;

  // El aviso crítico no se puede quitar: con la prueba vencida o pago pendiente el panel
  // rechaza las acciones que importan, y esconder el porqué solo convierte
  // el bloqueo en un misterio.
  if (!critico && descartado) return null;

  const descartar = () => {
    guardarDescarte();
    setDescartado(true);
  };

  const estilos = suspendida
    ? 'bg-red-50 border-red-200 text-red-900'
    : morosa
      ? 'bg-amber-50 border-amber-300 text-amber-900'
      : dias <= DIAS_CRITICOS
        ? 'bg-amber-50 border-amber-300 text-amber-900'
        : dias <= DIAS_ADVERTENCIA
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-teal-50 border-teal-200 text-teal-900';

  const Icono = suspendida || morosa ? AlertTriangle : Clock;
  const colorIcono = suspendida
    ? 'text-red-600'
    : morosa || dias <= DIAS_ADVERTENCIA
      ? 'text-amber-600'
      : 'text-teal-600';

  return (
    <div
      role={critico ? 'alert' : 'status'}
      className={`border-b px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs font-medium ${estilos}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icono className={`w-4 h-4 shrink-0 ${colorIcono}`} />

        {suspendida ? (
          <span className="min-w-0">
            <strong>
              {morosa
                ? 'Servicio suspendido por falta de pago'
                : plan.status === 'TRIALING'
                  ? 'Tu prueba gratuita terminó'
                  : 'Tu suscripción no está activa'}
            </strong>
            <span className="hidden sm:inline">
              : {morosa
                ? 'el período de gracia ha expirado. Reactiva tu método de pago para reanudar la recepción de llamadas y mensajes.'
                : 'no puedes dar de alta especialistas, agendar citas ni recibir llamadas hasta activar un plan. Tus datos siguen intactos.'}
            </span>
          </span>
        ) : morosa ? (
          <span className="min-w-0">
            <strong>Cobro de suscripción rechazado:</strong>
            <span>
              {' '}te {diasGracia === 1 ? 'queda 1 día' : `quedan ${diasGracia} días`} de período de gracia.
            </span>
            <span className="hidden sm:inline">
              {' '}La IA y telefonía siguen activas, pero se suspenderán si no regularizas el pago.
            </span>
          </span>
        ) : (
          <span className="min-w-0">
            <strong>
              {dias === 0
                ? 'Tu prueba gratuita vence hoy'
                : dias === 1
                  ? 'Te queda 1 día de prueba gratuita'
                  : `Te quedan ${dias} días de prueba gratuita`}
            </strong>
            {plan.trialEndsAt && (
              <span className="hidden sm:inline">
                {' '}
                — termina el {formatearFecha(plan.trialEndsAt)}. Activa un plan para no perder la
                continuidad.
              </span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/dashboard/suscripcion"
          className={`inline-flex items-center gap-1 font-bold underline whitespace-nowrap ${
            suspendida
              ? 'text-red-700 hover:text-red-900'
              : morosa
                ? 'text-amber-800 hover:text-amber-950'
                : 'text-teal-700 hover:text-teal-900'
          }`}
        >
          {morosa ? 'Regularizar pago' : 'Ver planes'}
          <ArrowRight className="w-3 h-3" />
        </Link>

        {!critico && (
          <button
            onClick={descartar}
            aria-label="Ocultar el aviso por hoy"
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
