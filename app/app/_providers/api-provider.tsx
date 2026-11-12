"use client";

import { useState, type ReactNode } from "react";
import { parseScenario } from "@/lib/client/api-mode";
import { withConsentFallback } from "@/lib/client/consent-fallback";
import { ApiError } from "@/lib/client/errors";
import { createLiveApi } from "@/lib/client/live";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";
import type { PorchaiApi } from "@/lib/client/types";
import { getLiff } from "@/lib/liff/client";
import { API_MODE } from "./liff-provider";

// Sends the user to LINE login; the page navigates away, so this never resolves.
async function loginAndWait(): Promise<never> {
  const liff = await getLiff();
  liff.login({ redirectUri: window.location.href });
  return new Promise<never>(() => {});
}

async function getIdToken(): Promise<string> {
  const liff = await getLiff();
  if (!liff.isLoggedIn()) return loginAndWait();
  const token = liff.getIDToken();
  if (!token) throw new ApiError(401, "unauthorized", "เข้าสู่ระบบ LINE ไม่สำเร็จ");
  return token;
}

// LIFF caches the ID token; a fresh login is the only way to get a new one.
const refreshIdToken = (): Promise<string> => loginAndWait();

function createApi(): PorchaiApi {
  if (API_MODE === "mock") {
    const scenario = typeof window === "undefined" ? "default" : parseScenario(window.location.search);
    return createMockApi({ scenario });
  }
  return withConsentFallback(createLiveApi({ getIdToken, refreshIdToken }));
}

export function ApiProvider({ children }: { children: ReactNode }) {
  const [api] = useState(createApi); // one instance for the app session
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
