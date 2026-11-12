"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SubmitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown }
  | { ok: false; skipped: true }; // ignored: already in flight or already succeeded

function newKey(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    // No crypto at all (very old WebView): last resort.
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fingerprint(payload: unknown): string {
  return JSON.stringify(payload) ?? "undefined";
}

/**
 * Guard for any mutating button: one request at a time (ref lock), no re-submit after success until
 * reset(), and an idempotency key that is reused for retries of the same payload but rotated when the
 * payload changes or reset() starts a genuinely new action.
 */
export function useSubmit<T = unknown>() {
  const locked = useRef(false); // in flight OR already succeeded
  const key = useRef<{ id: string; fp: string } | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = useCallback(
    async (payload: unknown, send: (idempotencyKey: string) => Promise<T>): Promise<SubmitResult<T>> => {
      if (locked.current) return { ok: false, skipped: true };
      locked.current = true;
      const fp = fingerprint(payload);
      if (!key.current || key.current.fp !== fp) key.current = { id: newKey(), fp };
      const id = key.current.id;
      setBusy(true);
      setError(null);
      try {
        const value = await send(id);
        if (mounted.current) setDone(true); // busy stays true and the lock stays held after success
        return { ok: true, value };
      } catch (err) {
        locked.current = false;
        if (mounted.current) {
          setBusy(false);
          setError(err);
        }
        return { ok: false, error: err };
      }
    },
    [],
  );

  const reset = useCallback(() => {
    locked.current = false;
    key.current = null;
    setBusy(false);
    setDone(false);
    setError(null);
  }, []);

  return { submit, busy, done, error, reset };
}
