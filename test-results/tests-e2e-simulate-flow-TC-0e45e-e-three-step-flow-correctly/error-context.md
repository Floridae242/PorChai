# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\simulate-flow.spec.ts >> TC-04 Flow ลอง → กันไว้ → จ่ายจริง >> should complete the three-step flow correctly
- Location: tests\e2e\simulate-flow.spec.ts:10:3

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
  4  |  * E2E Test: TC-04 – ลอง 300 บาท – 3 วัน flow
  5  |  * Simulates the three-step process: Try (ลอง), Reserve (กันไว้), Spend (จ่ายจริง)
  6  |  * Verifies UI state and backend balance after each step.
  7  |  */
  8  | 
  9  | test.describe('TC-04 Flow ลอง → กันไว้ → จ่ายจริง', () => {
  10 |   test('should complete the three-step flow correctly', async ({ page }) => {
  11 |     // Mock LIFF environment (reuse same script as other E2E tests)
  12 |     await page.addInitScript(() => {
  13 |       (window as any).liff = {
  14 |         init: async () => Promise.resolve(),
  15 |         isLoggedIn: () => true,
  16 |         isInClient: () => true,
  17 |         getIDToken: () => "mock-liff-id-token-xyz",
  18 |         getProfile: async () => ({
  19 |           userId: "U_demo_e2e_tester",
  20 |           displayName: "PorChai Tester",
  21 |           pictureUrl: "",
  22 |         }),
  23 |         login: () => {},
  24 |         closeWindow: () => {},
  25 |       };
  26 |     });
  27 | 
  28 |     // Start from the setup page with initial balance 1,000 บาท, 7 days remaining.
> 29 |     await page.goto('http://localhost:3004/setup');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/setup
  30 | 
  31 |     // Fill initial balance and payday if needed (assume default values are fine).
  32 |     const balanceInput = page.locator('[data-testid="input-balance"]').first();
  33 |     if (await balanceInput.isVisible()) {
  34 |       await balanceInput.fill('1000');
  35 |     }
  36 |     const confirmSetup = page.locator('[data-testid="btn-submit-cycle"]').first();
  37 |     await confirmSetup.click();
  38 | 
  39 |     // --- Step 1: Try (ลอง) 300 บาท for 3 days ---
  40 |     await page.goto('/entry/new');
  41 |     const amountInput = page.locator('[data-testid="input-amount"]').first();
  42 |     await amountInput.fill('300');
  43 |     const daysInput = page.locator('[data-testid="input-days"]').first();
  44 |     await daysInput.fill('3');
  45 |     const tryBtn = page.locator('[data-testid="btn-try"]').first();
  46 |     await tryBtn.click();
  47 | 
  48 |     // Verify UI shows tentative reservation of 300 and remaining balance still 1,000.
  49 |     const tentativeDisplay = page.locator('[data-testid="display-try-amount"]').first();
  50 |     await expect(tentativeDisplay).toContainText(/300/);
  51 |     const balanceDisplay = page.locator('[data-testid="display-balance"]').first();
  52 |     await expect(balanceDisplay).toContainText(/1000/);
  53 | 
  54 |     // --- Step 2: Reserve (กันไว้) 300 บาท ---
  55 |     const reserveBtn = page.locator('[data-testid="btn-reserve"]').first();
  56 |     await reserveBtn.click();
  57 |     // After reserving, reserved amount should be reflected and balance reduced.
  58 |     const reservedDisplay = page.locator('[data-testid="display-reserved"]').first();
  59 |     await expect(reservedDisplay).toContainText(/300/);
  60 |     await expect(balanceDisplay).toContainText(/700/);
  61 | 
  62 |     // --- Step 3: Spend (จ่ายจริง) 300 บาท ---
  63 |     const spendBtn = page.locator('[data-testid="btn-spend"]').first();
  64 |     await spendBtn.click();
  65 |     // Final balance should be 400 บาท.
  66 |     await expect(balanceDisplay).toContainText(/400/);
  67 |     const spentDisplay = page.locator('[data-testid="display-spent"]').first();
  68 |     await expect(spentDisplay).toContainText(/300/);
  69 |   });
  70 | });
  71 | 
  72 | 
```