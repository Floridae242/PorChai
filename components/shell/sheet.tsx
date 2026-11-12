"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export type SheetProps = { open: boolean; onClose: () => void; title: string; children: ReactNode };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Bottom sheet (< 768) / centred 480px dialog (>= 768). Portal, Esc + backdrop close, focus trap, scroll lock. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      data-testid="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--green-900)]/40 md:items-center"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-sheet bg-card px-4 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] font-body text-primary outline-none md:w-[480px] md:rounded-sheet md:pb-6"
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
