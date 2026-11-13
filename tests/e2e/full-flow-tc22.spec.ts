import { test, expect } from "@playwright/test";

/**
 * E2E Test: TC-22 – Full three‑step flow with reservation and spend validation.
 * Simulates a try of 250 baht, checks that no reserve/spend occurs for the first part,
 * then performs a reservation of 250 baht and verifies the updated balance.
 */

test.describe('TC-22 Full Flow', () => {
  test('should handle try without reservation and then reserve correctly', async ({ page }) => {
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

    // Start with 1,000 baht balance.
    await page.goto('http://localhost:3004/setup');
    const balanceInput = page.locator('[data-testid="input-balance"]').first();
    if (await balanceInput.isVisible()) await balanceInput.fill('1000');
    await page.locator('[data-testid="btn-submit-cycle"]').first().click();

    // Step 1: Try 250 baht for 1 day (no reservation).
    await page.goto('/entry/new');
    await page.locator('[data-testid="input-amount"]').first().fill('250');
    await page.locator('[data-testid="input-days"]').first().fill('1');
    await page.locator('[data-testid="btn-try"]').first().click();

    // Verify balance remains unchanged.
    const balanceDisplay = page.locator('[data-testid="display-balance"]').first();
    await expect(balanceDisplay).toContainText(/1000/);

    // Step 2: Reserve the 250 baht.
    await page.locator('[data-testid="btn-reserve"]').first().click();
    const reservedDisplay = page.locator('[data-testid="display-reserved"]').first();
    await expect(reservedDisplay).toContainText(/250/);
    await expect(balanceDisplay).toContainText(/750/);
  });
});

