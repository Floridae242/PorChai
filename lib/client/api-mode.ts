import type { MockScenario } from "./mock";

export type ApiMode = "mock" | "live";

// NEXT_PUBLIC_API_MODE wins; unset (or invalid) = mock while developing, live in production builds.
export function resolveApiMode(env: string | undefined, nodeEnv: string | undefined): ApiMode {
  if (env === "mock" || env === "live") return env;
  return nodeEnv === "production" ? "live" : "mock";
}

const SCENARIOS: readonly MockScenario[] = ["fresh", "default", "midCycle", "shortfall", "tight", "paydayPassed"];

// ?scenario= for demos in mock mode; anything unknown = 'default'.
export function parseScenario(search: string): MockScenario {
  const value = new URLSearchParams(search).get("scenario");
  return SCENARIOS.find((s) => s === value) ?? "default";
}
