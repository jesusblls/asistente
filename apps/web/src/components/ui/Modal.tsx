'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Diálogo modal accesible (WAI-ARIA "Dialog (Modal)").
 *
 * Centraliza lo que cada modal del dashboard repetía (o le faltaba):
 * - `role="dialog"`, `aria-modal` y nombre accesible vía `aria-labelledby`.
 * - Foco: al abrir entra al diálogo, queda atrapado mientras está abierto
 *   (Tab / Shift+Tab ciclan dentro) y al cerrar regresa al control que lo abrió.
 * - Escape cierra (salvo `dismissible={false}`, p. ej. mientras se elimina).
 * - Bloquea el scroll del fondo mientras está abierto.
 *
 * No impone estilos: el fondo conserva las clases de DESIGN.md § 5.4 y el
 * panel recibe las suyas por `panelClassName`, para que migrar un modal no
 * cambie cómo se ve.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const FIELD_SELECTOR =
  'input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled])';

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.tabIndex >= 0 && isVisible(el)
  );
}

// Pila de modales abiertos: solo el de hasta arriba atiende Escape y la trampa
// de foco, para que dos modales apilados no se cierren juntos ni se peleen el foco.
const modalStack: HTMLElement[] = [];
const isTopModal = (panel: HTMLElement) => modalStack[modalStack.length - 1] === panel;

// Contador compartido para que dos modales apilados no se pisen el bloqueo de scroll.
let scrollLockCount = 0;
let savedBodyStyle: { overflow: string; paddingRight: string } | null = null;

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    const { body, documentElement } = document;
    savedBodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    // Compensa el ancho de la barra de desplazamiento para que el fondo no "salte".
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }
    body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0 && savedBodyStyle) {
    document.body.style.overflow = savedBodyStyle.overflow;
    document.body.style.paddingRight = savedBodyStyle.paddingRight;
    savedBodyStyle = null;
  }
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** `id` del título visible del diálogo (nombre accesible). */
  labelledBy: string;
  /** `id` del texto que describe el diálogo, si lo hay. */
  describedBy?: string;
  /** Clases del panel blanco; el fondo es siempre el de DESIGN.md § 5.4. */
  panelClassName?: string;
  /** `alertdialog` para confirmaciones destructivas. */
  role?: 'dialog' | 'alertdialog';
  /** Si es `false`, Escape y el clic en el fondo no cierran (p. ej. durante una operación). */
  dismissible?: boolean;
  /** Cerrar al hacer clic en el fondo. Apagado por omisión para no perder formularios a medio llenar. */
  closeOnBackdropClick?: boolean;
  /** Elemento que recibe el foco al abrir. Por omisión: el primer campo del formulario o el primer control. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  labelledBy,
  describedBy,
  panelClassName,
  role = 'dialog',
  dismissible = true,
  closeOnBackdropClick = false,
  initialFocusRef,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Refs para que los listeners vean siempre los valores actuales sin
  // volver a montar el efecto (lo que robaría el foco en cada render).
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const initialFocusRefRef = useRef(initialFocusRef);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
    initialFocusRefRef.current = initialFocusRef;
  });

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    lockBodyScroll();
    modalStack.push(panel);

    const initial =
      initialFocusRefRef.current?.current ??
      Array.from(panel.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).find(isVisible) ??
      getFocusable(panel)[0] ??
      panel;
    initial.focus({ preventScroll: true });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopModal(panel)) return;
      if (e.key === 'Escape') {
        // Escape que cancela una composición IME o ya atendió otro control no cierra el diálogo.
        if (e.defaultPrevented || e.isComposing) return;
        if (dismissibleRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusable(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    // Red de seguridad: si el foco escapa (clic fuera, foco programático), regresa.
    const handleFocusIn = (e: FocusEvent) => {
      if (!isTopModal(panel)) return;
      if (e.target instanceof Node && !panel.contains(e.target)) {
        (getFocusable(panel)[0] ?? panel).focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      const index = modalStack.lastIndexOf(panel);
      if (index !== -1) modalStack.splice(index, 1);
      unlockBodyScroll();
      // Devuelve el foco al disparador si sigue en la página (p. ej. no se eliminó su fila).
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  // Al bloquearse el cierre (p. ej. "Eliminando...") el botón enfocado se
  // deshabilita y el navegador manda el foco a <body> sin disparar focusin:
  // se recupera en el propio panel para no sacar al lector de pantalla del diálogo.
  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel) return;
    const active = document.activeElement;
    if (!active || !panel.contains(active) || (active as HTMLButtonElement).disabled) {
      panel.focus({ preventScroll: true });
    }
  }, [isOpen, dismissible]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (closeOnBackdropClick && dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn('focus:outline-none', panelClassName)}
      >
        {children}
      </div>
    </div>
  );
}
