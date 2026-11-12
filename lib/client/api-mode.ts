import type { MockScenario } from "./mock";

export type ApiMode = "mock" | "live";

// Production builds are ALWAYS live, even if NEXT_PUBLIC_API_MODE=mock leaks into the build env:
// real users must never see mock data. Outside production, NEXT_PUBLIC_API_MODE wins;
// unset (or invalid) = mock.
export function resolveApiMode(env: string | undefined, nodeEnv: string | undefined): ApiMode {
  if (nodeEnv === "production") return "live";
  if (env === "mock" || env === "live") return env;
  return "mock";
}

const SCENARIOS: readonly MockScenario[] = ["fresh", "default", "midCycle", "shortfall", "tight", "paydayPassed"];

// ?scenario= for demos in mock mode; anything unknown = 'default'.
export function parseScenario(search: string): MockScenario {
  const value = new URLSearchParams(search).get("scenario");
  return SCENARIOS.find((s) => s === value) ?? "default";
}
