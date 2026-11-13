# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\full-flow-tc22.spec.ts >> TC-22 Full Flow >> should handle try without reservation and then reserve correctly
- Location: tests\e2e\full-flow-tc22.spec.ts:10:3

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
  4  |  * E2E Test: TC-22 – Full three‑step flow with reservation and spend validation.
  5  |  * Simulates a try of 250 baht, checks that no reserve/spend occurs for the first part,
  6  |  * then performs a reservation of 250 baht and verifies the updated balance.
  7  |  */
  8  | 
  9  | test.describe('TC-22 Full Flow', () => {
  10 |   test('should handle try without reservation and then reserve correctly', async ({ page }) => {
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
  24 |     // Start with 1,000 baht balance.
> 25 |     await page.goto('http://localhost:3004/setup');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/setup
  26 |     const balanceInput = page.locator('[data-testid="input-balance"]').first();
  27 |     if (await balanceInput.isVisible()) await balanceInput.fill('1000');
  28 |     await page.locator('[data-testid="btn-submit-cycle"]').first().click();
  29 | 
  30 |     // Step 1: Try 250 baht for 1 day (no reservation).
  31 |     await page.goto('/entry/new');
  32 |     await page.locator('[data-testid="input-amount"]').first().fill('250');
  33 |     await page.locator('[data-testid="input-days"]').first().fill('1');
  34 |     await page.locator('[data-testid="btn-try"]').first().click();
  35 | 
  36 |     // Verify balance remains unchanged.
  37 |     const balanceDisplay = page.locator('[data-testid="display-balance"]').first();
  38 |     await expect(balanceDisplay).toContainText(/1000/);
  39 | 
  40 |     // Step 2: Reserve the 250 baht.
  41 |     await page.locator('[data-testid="btn-reserve"]').first().click();
  42 |     const reservedDisplay = page.locator('[data-testid="display-reserved"]').first();
  43 |     await expect(reservedDisplay).toContainText(/250/);
  44 |     await expect(balanceDisplay).toContainText(/750/);
  45 |   });
  46 | });
  47 | 
  48 | 
```