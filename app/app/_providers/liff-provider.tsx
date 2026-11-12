"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getLiff } from "@/lib/liff/client";
import { resolveApiMode } from "@/lib/client/api-mode";

interface LiffState {
  ready: boolean;
  inClient: boolean;
  error: Error | null;
}

const LiffContext = createContext<LiffState | null>(null);

// process.env.NEXT_PUBLIC_* must be read literally so Next can inline it.
export const API_MODE = resolveApiMode(process.env.NEXT_PUBLIC_API_MODE, process.env.NODE_ENV);

export function LiffProvider({ children }: { children: ReactNode }) {
  // Mock mode never loads LIFF.
  const [state, setState] = useState<LiffState>({ ready: API_MODE === "mock", inClient: false, error: null });

  useEffect(() => {
    if (API_MODE === "mock") return;
    getLiff().then(
      (liff) => setState({ ready: true, inClient: liff.isInClient(), error: null }),
      (err) => setState({ ready: false, inClient: false, error: err instanceof Error ? err : new Error(String(err)) }),
    );
  }, []);

  return <LiffContext.Provider value={state}>{children}</LiffContext.Provider>;
}

export function useLiff(): LiffState {
  const state = useContext(LiffContext);
  if (!state) throw new Error("useLiff must be used inside <LiffProvider>");
  return state;
}
