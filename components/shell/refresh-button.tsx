"use client";

import { RefreshIcon } from "./icons";

// Pulling the page down inside LINE closes the app, so there is a button instead. The shell reloads the
// screen's data by mounting the page again (every screen loads its data on mount).
export function RefreshButton({
  onRefresh,
  busy,
}: {
  onRefresh: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={busy}
      aria-label="รีเฟรชข้อมูล"
      className="fixed right-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-30 flex size-11 items-center justify-center rounded-pill border border-line bg-card text-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] disabled:opacity-60 xl:right-6"
    >
      <span className={busy ? "motion-safe:animate-spin" : undefined}>
        <RefreshIcon />
      </span>
    </button>
  );
}
