import { defineConfig } from "@playwright/test";

// Older mock-mode specs (in-browser demo data via ?scenario=). No LINE login, production API,
// or real money mutations. Run with: npm run test:e2e:mock
// The full-system PM suite has its own config: playwright.config.ts.
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: /full-system-.*\.spec\.ts$/,
  outputDir: "test-results/mock",
  fullyParallel: false,
  workers: 1,
  reporter: [["html", { open: "never", outputFolder: "playwright-report-mock" }], ["list"]],
  use: { baseURL: "http://127.0.0.1:3101", viewport: { width: 390, height: 844 }, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    env: { NEXT_PUBLIC_API_MODE: "mock" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
