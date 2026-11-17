"use client";

import { useSearchParams } from "next/navigation";

// Where a screen's back arrow goes. A link from Settings adds ?from=settings (or ?from=reminders), so
// the arrow returns there instead of to the home page. Only these two names are accepted; anything else
// keeps the screen's own default.
const FROM: Record<string, string> = {
  settings: "/app/settings",
  reminders: "/app/settings/notifications",
};

export function useBack(fallback: string): string {
  const from = useSearchParams()?.get("from");
  return (from && FROM[from]) || fallback;
}

/** The ?from= value to carry to the next screen of the same flow ("" when none). */
export function useFromQuery(): string {
  const from = useSearchParams()?.get("from");
  return from && FROM[from] ? `?from=${from}` : "";
}
