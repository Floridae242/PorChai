"use client";

import { useMemo, useSyncExternalStore } from "react";
import { createEmptySetupDraft, loadSetupDraft, SETUP_DRAFT_KEY, type SetupDraft } from "./setup-draft";

const noopSubscribe = () => () => {};

function readRaw(): string {
  try {
    return window.localStorage.getItem(SETUP_DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

// The saved draft from localStorage. Returns null on the server and during hydration, then the draft once
// mounted, so the first client render always matches the server HTML.
export function useLoadedSetupDraft(): SetupDraft | null {
  const raw = useSyncExternalStore<string | null>(noopSubscribe, readRaw, () => null);
  return useMemo(() => (raw === null ? null : raw === "" ? createEmptySetupDraft() : loadSetupDraft()), [raw]);
}
