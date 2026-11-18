import { defineConfig } from "@playwright/test";

// Deliberately fixed to loopback. This suite never signs into a real LINE account.
const delay = Number(process.env.DEMO_PAUSE_MS ?? 1200);
if (!Number.isFinite(delay) || delay < 0 || delay > 5000) throw new Error("DEMO_PAUSE_MS must be 0–5000");
export default defineConfig({
  testDir: "./tests/presentation",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: "artifacts/presentation/results",
  reporter: [["list"], ["html", { outputFolder: "artifacts/presentation/report", open: "never" }], ["json", { outputFile: "artifacts/presentation/results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3117",
    viewport: { width: 430, height: 932 },
    actionTimeout: 15_000,
    video: "on", trace: "on", screenshot: "only-on-failure",
    launchOptions: { slowMo: delay ? 180 : 0 },
  },
  projects: [
    { name: "chat-replay", testMatch: "chat-replay.spec.ts" },
    { name: "miniapp", testMatch: "miniapp.spec.ts" },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3117",
    url: "http://127.0.0.1:3117/app",
    env: { PORCHAI_PRESENTATION: "1", NEXT_PUBLIC_API_MODE: "mock", NEXT_PUBLIC_CLARITY_PROJECT_ID: "" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
