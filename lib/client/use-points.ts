"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { PorchaiApi } from "./types";
import { useApi } from "./use-api";
import { DATA_CHANGED } from "./data-events";
export interface Points {
  balance: number;
  claimedToday: boolean;
}
interface Snapshot {
  data: Points | null;
  loading: boolean;
  failed: boolean;
}
interface Store {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  epoch: number;
  pending: Promise<void> | null;
  lastEvent?: Event;
}
const INITIAL: Snapshot = { data: null, loading: true, failed: false };
const stores = new WeakMap<PorchaiApi, Store>();
function store(api: PorchaiApi): Store {
  let s = stores.get(api);
  if (!s) {
    s = { snapshot: INITIAL, listeners: new Set(), epoch: 0, pending: null };
    stores.set(api, s);
  }
  return s;
}
function set(s: Store, snapshot: Snapshot) {
  s.snapshot = snapshot;
  for (const listener of s.listeners) listener();
}
export function publishPoints(api: PorchaiApi, data: Points) {
  const s = store(api);
  s.epoch++;
  s.pending = null;
  set(s, { data: { ...data }, loading: false, failed: false });
}
export function refreshPoints(api: PorchaiApi, force = false): Promise<void> {
  const s = store(api);
  if (s.pending && !force) return s.pending;
  const epoch = ++s.epoch;
  set(s, { ...s.snapshot, loading: true, failed: false });
  const pending = Promise.resolve()
    .then(() => api.points())
    .then(
      (data) => {
        if (epoch === s.epoch) set(s, { data, loading: false, failed: false });
      },
      () => {
        if (epoch === s.epoch)
          set(s, { ...s.snapshot, loading: false, failed: true });
      },
    )
    .finally(() => {
      if (epoch === s.epoch) s.pending = null;
    });
  s.pending = pending;
  return pending;
}
/** One authoritative snapshot per API/account; unknown is never fabricated as zero. */
export function usePoints() {
  const api = useApi(),
    s = store(api);
  const snapshot = useSyncExternalStore(
    (listener) => {
      s.listeners.add(listener);
      return () => {
        s.listeners.delete(listener);
      };
    },
    () => s.snapshot,
    () => INITIAL,
  );
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") void refreshPoints(api);
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.api !== api || s.lastEvent === event) return;
      s.lastEvent = event;
      if (detail.reset) {
        s.epoch++;
        s.pending = null;
        set(s, INITIAL);
        return;
      }
      void refreshPoints(api, true);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(DATA_CHANGED, changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(DATA_CHANGED, changed);
    };
  }, [api, s]);
  return {
    ...snapshot,
    update: (data: Points) => publishPoints(api, data),
    refresh: () => refreshPoints(api, true),
  };
}
