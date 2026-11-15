import { defineConfig } from "@playwright/test";

// Local mock UI only. No LINE login, production API, or real money mutations.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3101", viewport: { width: 390, height: 844 }, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    env: { NEXT_PUBLIC_API_MODE: "mock" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
