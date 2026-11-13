import { test, expect } from "@playwright/test";

/**
 * Integration test for TC-20: Ensure no PII leakage to external URLs.
 * This test intercepts all outgoing network requests and asserts that
 * request URLs do not contain any user identifiers (e.g., userId, email).
 */

test.describe('TC-20 PII Leakage Prevention', () => {
  test('should not send personal identifiers in outbound requests', async ({ page }) => {
    // Mock LIFF environment (reuse same script as other E2E tests)
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

    // Record any request URLs that match external domains (non‑localhost)
    const externalUrls: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (!url.includes('localhost')) {
        externalUrls.push(url);
      }
      route.continue();
    });

    // Perform typical user actions (navigate to a page that would trigger analytics)
    await page.goto('http://localhost:3004/setup');
    // Simulate a simple interaction
    const btn = page.locator('[data-testid="btn-submit-cycle"]').first();
    if (await btn.isVisible()) await btn.click();

    // After actions, ensure no PII appears in captured URLs
    for (const u of externalUrls) {
      expect(u).not.toMatch(/U_demo_e2e_tester|PorChai%20Tester|email|@/i);
    }
  });
});

