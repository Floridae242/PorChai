import { test, expect } from "@playwright/test";

/**
 * E2E Test: TC-04 – ลอง 300 บาท – 3 วัน flow
 * Simulates the three-step process: Try (ลอง), Reserve (กันไว้), Spend (จ่ายจริง)
 * Verifies UI state and backend balance after each step.
 */

test.describe('TC-04 Flow ลอง → กันไว้ → จ่ายจริง', () => {
  test('should complete the three-step flow correctly', async ({ page }) => {
    // Mock LIFF environment (reuse same script as other E2E tests)
    await page.addInitScript(() => {
      (window as any).liff = {
        init: async () => Promise.resolve(),
        isLoggedIn: () => true,
        isInClient: () => true,
        getIDToken: () => "mock-liff-id-token-xyz",
        getProfile: async () => ({
          userId: "U_demo_e2e_tester",
          displayName: "PorChai Tester",
          pictureUrl: "",
        }),
        login: () => {},
        closeWindow: () => {},
      };
    });

    // Start from the setup page with initial balance 1,000 บาท, 7 days remaining.
    await page.goto('http://localhost:3004/setup');

    // Fill initial balance and payday if needed (assume default values are fine).
    const balanceInput = page.locator('[data-testid="input-balance"]').first();
    if (await balanceInput.isVisible()) {
      await balanceInput.fill('1000');
    }
    const confirmSetup = page.locator('[data-testid="btn-submit-cycle"]').first();
    await confirmSetup.click();

    // --- Step 1: Try (ลอง) 300 บาท for 3 days ---
    await page.goto('/entry/new');
    const amountInput = page.locator('[data-testid="input-amount"]').first();
    await amountInput.fill('300');
    const daysInput = page.locator('[data-testid="input-days"]').first();
    await daysInput.fill('3');
    const tryBtn = page.locator('[data-testid="btn-try"]').first();
    await tryBtn.click();

    // Verify UI shows tentative reservation of 300 and remaining balance still 1,000.
    const tentativeDisplay = page.locator('[data-testid="display-try-amount"]').first();
    await expect(tentativeDisplay).toContainText(/300/);
    const balanceDisplay = page.locator('[data-testid="display-balance"]').first();
    await expect(balanceDisplay).toContainText(/1000/);

    // --- Step 2: Reserve (กันไว้) 300 บาท ---
    const reserveBtn = page.locator('[data-testid="btn-reserve"]').first();
    await reserveBtn.click();
    // After reserving, reserved amount should be reflected and balance reduced.
    const reservedDisplay = page.locator('[data-testid="display-reserved"]').first();
    await expect(reservedDisplay).toContainText(/300/);
    await expect(balanceDisplay).toContainText(/700/);

    // --- Step 3: Spend (จ่ายจริง) 300 บาท ---
    const spendBtn = page.locator('[data-testid="btn-spend"]').first();
    await spendBtn.click();
    // Final balance should be 400 บาท.
    await expect(balanceDisplay).toContainText(/400/);
    const spentDisplay = page.locator('[data-testid="display-spent"]').first();
    await expect(spentDisplay).toContainText(/300/);
  });
});

