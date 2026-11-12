"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
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
          {children}
        </div>
      </div>
      <TabBar active={active} onRecord={() => setChooserOpen(true)} />
      <RecordChooserSheet open={chooserOpen} onClose={() => setChooserOpen(false)} />
    </ToastProvider>
  );
}
