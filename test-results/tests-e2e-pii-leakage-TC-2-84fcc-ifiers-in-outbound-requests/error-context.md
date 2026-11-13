# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\pii-leakage.spec.ts >> TC-20 PII Leakage Prevention >> should not send personal identifiers in outbound requests
- Location: tests\e2e\pii-leakage.spec.ts:10:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/setup
Call log:
  - navigating to "http://localhost:3004/setup", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * Integration test for TC-20: Ensure no PII leakage to external URLs.
  5  |  * This test intercepts all outgoing network requests and asserts that
  6  |  * request URLs do not contain any user identifiers (e.g., userId, email).
  7  |  */
  8  | 
  9  | test.describe('TC-20 PII Leakage Prevention', () => {
  10 |   test('should not send personal identifiers in outbound requests', async ({ page }) => {
  11 |     // Mock LIFF environment (reuse same script as other E2E tests)
  12 |     await page.addInitScript(() => {
  13 |       (window as any).liff = {
  14 |         init: async () => Promise.resolve(),
  15 |         isLoggedIn: () => true,
  16 |         isInClient: () => true,
  17 |         getIDToken: () => "mock-liff-id-token-xyz",
  18 |         getProfile: async () => ({ userId: "U_demo_e2e_tester", displayName: "PorChai Tester", pictureUrl: "" }),
  19 |         login: () => {},
  20 |         closeWindow: () => {},
  21 |       };
  22 |     });
  23 | 
  24 |     // Record any request URLs that match external domains (non‑localhost)
  25 |     const externalUrls: string[] = [];
  26 |     await page.route('**/*', (route) => {
  27 |       const url = route.request().url();
  28 |       if (!url.includes('localhost')) {
  29 |         externalUrls.push(url);
  30 |       }
  31 |       route.continue();
  32 |     });
  33 | 
  34 |     // Perform typical user actions (navigate to a page that would trigger analytics)
> 35 |     await page.goto('http://localhost:3004/setup');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/setup
  36 |     // Simulate a simple interaction
  37 |     const btn = page.locator('[data-testid="btn-submit-cycle"]').first();
  38 |     if (await btn.isVisible()) await btn.click();
  39 | 
  40 |     // After actions, ensure no PII appears in captured URLs
  41 |     for (const u of externalUrls) {
  42 |       expect(u).not.toMatch(/U_demo_e2e_tester|PorChai%20Tester|email|@/i);
  43 |     }
  44 |   });
  45 | });
  46 | 
  47 | 
```