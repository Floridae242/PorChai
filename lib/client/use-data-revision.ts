"use client";
import { useEffect, useState } from "react";
import { useApi } from "./use-api";
import { DATA_CHANGED } from "./data-events";
/** Native LINE resumes can fire visibilitychange instead of a new React mount. */
export function useDataRevision() {
  const api = useApi(),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let queued = false,
      active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden" || queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (active) setRevision((n) => n + 1);
      });
    };
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail?.api === api) refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(DATA_CHANGED, changed);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(DATA_CHANGED, changed);
    };
  }, [api]);
  return revision;
}
