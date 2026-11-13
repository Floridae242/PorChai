import { test, expect } from "@playwright/test";

/**
 * E2E Test: TC-23 – Payday Passed UI Behavior
 * When the payday is today (or past), the submit button should be disabled
 * and an appropriate warning message is shown.
 */

test.describe('TC-23 Payday Passed UI', () => {
  test('should prevent submission when payday is today or past', async ({ page }) => {
    // Mock LIFF
    await page.addInitScript(() => {
      (window as any).liff = {
        init: async () => Promise.resolve(),
        isLoggedIn: () => true,
        isInClient: () => true,
        getIDToken: () => "mock-liff-id-token-xyz",
        getProfile: async () => ({ userId: "U_demo_e2e_tester", displayName: "PorChai Tester", pictureUrl: "" }),
        login: () => {},
        closeWindow: () => {},
      };
    });

    // Navigate to setup with payday set to today (ISO date)
    const today = new Date().toISOString().split('T')[0];
    await page.goto(`http://localhost:3004/setup?payday=${today}`);

    const submitBtn = page.locator('[data-testid="btn-submit-cycle"]').first();
    // Button should be disabled
    await expect(submitBtn).toBeDisabled();

    // Warning message should be visible
    const warning = page.locator('[role="alert"]').filter({ hasText: /วันรับเงินต้องเป็นอนาคต/i }).first();
    await expect(warning).toBeVisible();
  });
});

