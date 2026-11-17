"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { RefreshButton } from "./refresh-button";
import { RecordChooserSheet } from "./record-chooser-sheet";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { hideNav, tabForPath } from "./tab-for-path";
import { ToastProvider } from "./toast";

/**
 * < 768: full width, 16px gutters. 768-1279: content max 704, bottom tab bar.
 * >= 1280: 240px sidebar, content max 760 centred in the remaining space.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/app";
  const [chooserOpen, setChooserOpen] = useState(false);
  // Refresh = mount the page again, so every screen loads its data again
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function refresh() {
    setRefreshing(true);
    setRefreshKey((n) => n + 1);
    timer.current = setTimeout(() => setRefreshing(false), 900);
  }

  if (hideNav(pathname)) {
    return (
      <ToastProvider>
        <div data-clarity-mask="true">{children}</div>
      </ToastProvider>
    );
  }

  const active = tabForPath(pathname);
  return (
    <ToastProvider>
      <Sidebar active={active} onRecord={() => setChooserOpen(true)} />
      <div data-clarity-mask="true" className="xl:pl-60">
        <div className="mx-auto w-full max-w-[704px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] xl:max-w-[760px] xl:pb-8">
          <div key={refreshKey}>{children}</div>
        </div>
      </div>
      <RefreshButton onRefresh={refresh} busy={refreshing} />
      <TabBar active={active} onRecord={() => setChooserOpen(true)} />
      <RecordChooserSheet
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
      />
    </ToastProvider>
  );
}
