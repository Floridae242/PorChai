"use client";

import { useEffect, useState, type ReactNode } from "react";
import { parseScenario } from "@/lib/client/api-mode";
import { withConsentFallback } from "@/lib/client/consent-fallback";
import { createLiveApi } from "@/lib/client/live";
import { createLiffAuth } from "@/lib/client/liff-auth";
import { ApiContext } from "@/lib/client/use-api";
import type { PorchaiApi } from "@/lib/client/types";
import { MockBadge } from "@/components/shell/mock-badge";
import { getLiff } from "@/lib/liff/client";
import { API_MODE } from "./liff-provider";

function createLive(): PorchaiApi {
  return withConsentFallback(createLiveApi(createLiffAuth(getLiff)));
}

export function ApiProvider({ children }: { children: ReactNode }) {
  // One instance for the app session. The mock is loaded lazily so it stays out of live bundles.
  const [api, setApi] = useState<PorchaiApi | null>(() => (API_MODE === "live" ? createLive() : null));

  useEffect(() => {
    if (API_MODE !== "mock") return;
    // Lets the bundler drop the mock chunk from production builds (API_MODE is always live there).
    if (process.env.NODE_ENV === "production") return;
    let cancelled = false;
    import("@/lib/client/mock").then(({ createMockApi }) => {
      if (!cancelled) setApi(createMockApi({
          scenario: process.env.NODE_ENV !== "production" ? parseScenario(window.location.search) : "default",
        }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!api) return null;
  return <ApiContext.Provider value={api}>
      <MockBadge mode={API_MODE} />
      {children}
    </ApiContext.Provider>;
}
