import { defineConfig } from "@playwright/test";

// Por-Chai full-system E2E suite for PM demo and sign-off (tests/e2e/full-system-pm-demo.spec.ts).
//
// The app runs in LIVE mode (the real HTTP client, LIFF auth path, idempotency keys and error
// handling) with two stand-ins injected by tests/e2e/helpers/liff-mock.ts:
//   - window.liff (no LINE app needed), honoured only because NEXT_PUBLIC_E2E_LIFF_MOCK=1 below;
//   - a per-user backend behind /api/* that checks the Bearer token and computes every number
//     with the app's own lib/calc. Nothing reaches LINE, Supabase or Microsoft Clarity.
//
// Projects:
//   pm-demo       headless full run (npm run test:e2e:all)
//   pm-demo-slow  same tests with slowMo 300 ms so people can follow each tap (npm run test:e2e:watch)
//   chromium      the live PM presentation (LINE OA chat + MINI App), headed, slowMo 150, no trace (npm run demo:pm)
//
// The dev server is always started fresh (reuseExistingServer: false): a plain `npm run dev` already
// on port 3004 lacks NEXT_PUBLIC_E2E_LIFF_MOCK and would show a real LINE login instead of the demo.
//
// The older mock-mode specs keep their own config: playwright.mock.config.ts.

const PORT = 3004;
const BASE_URL = `http://localhost:${PORT}`;

// LINE in-app browser on an iPhone 13-class screen (what a LIFF MINI App actually runs in).
const LINE_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0 LIFF";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /(full-system-.*|pm-live-journey)\.spec\.ts$/,
  outputDir: "test-results/pm-demo",
  globalSetup: "./tests/e2e/helpers/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One worker keeps the videos in story order and the dev server unhurried.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: LINE_IOS_UA,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    video: "on",
    screenshot: "on",
    trace: "on",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "pm-demo", testMatch: /full-system-.*\.spec\.ts$/, use: { browserName: "chromium" } },
    { name: "pm-demo-slow", testMatch: /full-system-.*\.spec\.ts$/, use: { browserName: "chromium", launchOptions: { slowMo: 300 } } },
    // Live PM presentation (npm run demo:pm): one visible phone-sized window, one continuous journey
    // across the LINE OA chat and the MINI App. slowMo 150 keeps typing and transitions smooth (the spec
    // adds short reading pauses); no trace, so nothing slows the window down.
    // DEMO_HEADLESS=1 / DEMO_SLOWMO=0 give a fast unattended rehearsal of the same journey.
    {
      name: "chromium",
      testMatch: /pm-live-journey\.spec\.ts$/,
      timeout: 15 * 60_000,
      use: {
        browserName: "chromium",
        headless: process.env.DEMO_HEADLESS === "1",
        launchOptions: { slowMo: Number(process.env.DEMO_SLOWMO ?? 150) },
        trace: "off",
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    env: {
      NEXT_PUBLIC_API_MODE: "live",
      NEXT_PUBLIC_E2E_LIFF_MOCK: "1",
      NEXT_PUBLIC_LIFF_ID: "2012545254-6025ZG1r",
      // Valid-looking id so the consent-gated Clarity loader runs; the tag is stubbed by the harness.
      NEXT_PUBLIC_CLARITY_PROJECT_ID: "e2eclarity01",
      // Lets the real /api routes reach token verification in the TC-19 real-server check.
      LINE_LOGIN_CHANNEL_ID: "2012545254",
    },
    // Always our own server: an ordinary `npm run dev` lacks the flags above.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
