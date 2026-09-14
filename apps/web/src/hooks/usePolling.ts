'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePollingOptions {
  /** Intervalo base entre ciclos exitosos, en milisegundos. */
  intervalMs: number;
  /** Habilita o deshabilita el sondeo (p. ej. sólo en modo 'live'). */
  enabled?: boolean;
  /** Backoff máximo ante errores consecutivos, en milisegundos. */
  maxBackoffMs?: number;
  /** Factor de crecimiento del backoff. */
  backoffFactor?: number;
  /** Pausa el sondeo mientras la pestaña está oculta (ahorra peticiones y batería). */
  pauseWhenHidden?: boolean;
}

export interface UsePollingResult {
  /** Último error registrado por el ciclo de sondeo, si lo hubo. */
  lastError: Error | null;
  /** Fuerza un ciclo inmediato, cancelando el temporizador en curso. */
  refresh: () => void;
  /** Indica que hay una petición en vuelo. */
  isPolling: boolean;
}

/**
 * Sondeo resiliente para paneles operativos.
 *
 * A diferencia de un `setInterval` fijo, este hook:
 *  - cancela la petición en curso al desmontar (AbortController), evitando
 *    actualizaciones de estado sobre componentes desmontados;
 *  - aplica backoff exponencial con jitter cuando el callback lanza un error,
 *    en vez de martillar la API caída cada pocos segundos;
 *  - pausa el ciclo cuando la pestaña está oculta y refresca al volver;
 *  - ignora ciclos solapados (una sola petición en vuelo a la vez).
 */
export function usePolling(
  callback: (signal: AbortSignal) => Promise<void>,
  {
    intervalMs,
    enabled = true,
    maxBackoffMs = 30_000,
    backoffFactor = 2,
    pauseWhenHidden = true,
  }: UsePollingOptions
): UsePollingResult {
  const [lastError, setLastError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const failureCountRef = useRef(0);
  // Evita que un ciclo que termina justo después del desmontaje (p. ej. por abort)
  // vuelva a programar un temporizador sobre un componente ya desmontado.
  const activeRef = useRef(false);
  // Cada reinicio del efecto incrementa la generación: los ciclos de una
  // generación anterior no vuelven a programar temporizadores (evita doble sondeo).
  const generationRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runCycle = useCallback(async () => {
    if (inFlightRef.current) return;
    const generation = generationRef.current;
    inFlightRef.current = true;
    setIsPolling(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    let failed = false;

    try {
      await callbackRef.current(controller.signal);
      failureCountRef.current = 0;
      setLastError(null);
    } catch (error) {
      failed = true;
      failureCountRef.current += 1;
      const normalized = error instanceof Error ? error : new Error(String(error));
      setLastError(normalized);
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[usePolling] ciclo fallido, se aplicará backoff:', normalized.message);
      }
    } finally {
      inFlightRef.current = false;
      controllerRef.current = null;
      setIsPolling(false);
    }

    if (!enabled || !activeRef.current || generationRef.current !== generation) return;
    if (pauseWhenHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    const baseDelay = failed
      ? Math.min(intervalMs * backoffFactor ** failureCountRef.current, maxBackoffMs)
      : intervalMs;
    // Jitter de hasta 20% para evitar que varias pestañas sincronicen sus peticiones.
    const jitter = baseDelay * 0.2 * Math.random();

    clearTimer();
    timerRef.current = setTimeout(() => {
      void runCycle();
    }, baseDelay + jitter);
  }, [backoffFactor, clearTimer, enabled, intervalMs, maxBackoffMs, pauseWhenHidden]);

  const refresh = useCallback(() => {
    clearTimer();
    void runCycle();
  }, [clearTimer, runCycle]);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      clearTimer();
      controllerRef.current?.abort();
      controllerRef.current = null;
      inFlightRef.current = false;
      activeRef.current = false;
      return;
    }

    activeRef.current = true;
    generationRef.current += 1;
    void runCycle();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      } else {
        clearTimer();
      }
    };

    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      generationRef.current += 1;
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      clearTimer();
      controllerRef.current?.abort();
      controllerRef.current = null;
      inFlightRef.current = false;
      activeRef.current = false;
    };
  }, [clearTimer, enabled, pauseWhenHidden, refresh, runCycle]);

  return { lastError, refresh, isPolling };
}
