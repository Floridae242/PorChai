# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\payday-passed-ui.spec.ts >> TC-23 Payday Passed UI >> should prevent submission when payday is today or past
- Location: tests\e2e\payday-passed-ui.spec.ts:10:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/setup?payday=2026-11-13
Call log:
  - navigating to "http://localhost:3004/setup?payday=2026-11-13", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * E2E Test: TC-23 – Payday Passed UI Behavior
  5  |  * When the payday is today (or past), the submit button should be disabled
  6  |  * and an appropriate warning message is shown.
  7  |  */
  8  | 
  9  | test.describe('TC-23 Payday Passed UI', () => {
  10 |   test('should prevent submission when payday is today or past', async ({ page }) => {
  11 |     // Mock LIFF
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
  24 |     // Navigate to setup with payday set to today (ISO date)
  25 |     const today = new Date().toISOString().split('T')[0];
> 26 |     await page.goto(`http://localhost:3004/setup?payday=${today}`);
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/setup?payday=2026-11-13
  27 | 
  28 |     const submitBtn = page.locator('[data-testid="btn-submit-cycle"]').first();
  29 |     // Button should be disabled
  30 |     await expect(submitBtn).toBeDisabled();
  31 | 
  32 |     // Warning message should be visible
  33 |     const warning = page.locator('[role="alert"]').filter({ hasText: /วันรับเงินต้องเป็นอนาคต/i }).first();
  34 |     await expect(warning).toBeVisible();
  35 |   });
  36 | });
  37 | 
  38 | 
```