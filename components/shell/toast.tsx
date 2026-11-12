"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Mascot, type MascotPose } from "@/components/ui/mascot";

export type ToastOptions = { mascot?: MascotPose };
type ToastApi = { show: (text: string, opts?: ToastOptions) => void };
type ToastState = { id: number; text: string; mascot?: MascotPose };

const ToastContext = createContext<ToastApi | null>(null);
const HIDE_AFTER_MS = 3000;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** One toast at a time, pinned to the top below the safe area, auto-hides after 3 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const show = useCallback((text: string, opts?: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setToast({ id: seq.current, text, mascot: opts?.mascot });
    timer.current = setTimeout(() => setToast(null), HIDE_AFTER_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex justify-center px-4">
          <div
            key={toast.id}
            role="status"
            className="flex max-w-md items-center gap-3 rounded-md border border-line bg-card px-4 py-3 font-body text-sm text-primary"
          >
            {toast.mascot ? <Mascot pose={toast.mascot} size={32} /> : null}
            <span>{toast.text}</span>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
