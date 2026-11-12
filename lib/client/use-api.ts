"use client";

import { createContext, useContext } from "react";
import type { PorchaiApi } from "./types";

export const ApiContext = createContext<PorchaiApi | null>(null);

export function useApi(): PorchaiApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside <ApiProvider> (app/app/_providers/api-provider.tsx)");
  return api;
}
