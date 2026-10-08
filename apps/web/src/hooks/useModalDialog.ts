'use client';

import { useEffect, useRef } from 'react';

/**
 * Comportamiento mínimo de un diálogo modal accesible:
 *  - al abrir, el foco entra al elemento indicado (o al primero enfocable);
 *  - Escape lo cierra (salvo que `canClose` sea false, p. ej. mientras guarda);
 *  - Tab no escapa del diálogo hacia la página de fondo;
 *  - al cerrar, el foco vuelve a donde estaba antes de abrirlo.
 */
export function useModalDialog<T extends HTMLElement>({
  open,
  onClose,
  canClose = true,
}: {
  open: boolean;
  onClose: () => void;
  canClose?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);

  useEffect(() => {
    onCloseRef.current = onClose;
    canCloseRef.current = canClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusTarget =
      initialFocusRef.current ??
      dialogRef.current?.querySelector<HTMLElement>(
        'input, button, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
      );
    focusTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (canCloseRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return { dialogRef, initialFocusRef };
}
