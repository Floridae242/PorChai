import type { FullConfig } from "@playwright/test";
import { ensureMockSlip } from "./generate-mock-slip";

// `next dev` compiles each route on its first request. Warming them up here keeps the recorded
// videos free of long blank compile pauses. Failures are ignored: the tests themselves will report.
const ROUTES = [
  "/app",
  "/app/consent",
  "/app/setup/income",
  "/app/setup/balance",
  "/app/setup/savings",
  "/app/setup/essentials",
  "/app/setup/review",
  "/app/try",
  "/app/try/result",
  "/app/try/decide",
  "/app/try/saved",
  "/app/record/new",
  "/app/record/link",
  "/app/record/done",
  "/app/record/e2e-warmup",
  "/app/plan",
  "/app/plan/edit",
  "/app/balance/adjust",
  "/app/balance/done",
  "/app/cycle/new",
  "/app/points",
  "/app/points/history",
  "/app/perks",
  "/app/settings",
  "/app/settings/savings",
];

export default async function globalSetup(config: FullConfig) {
  // The live demo sends this sample slip in the LINE OA chat; generated once when missing.
  await ensureMockSlip();
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3004";
  for (const route of ROUTES) {
    try {
      await fetch(new URL(route, baseURL), { signal: AbortSignal.timeout(90_000) });
    } catch {
      // ignore: warm-up only
    }
  }
}
