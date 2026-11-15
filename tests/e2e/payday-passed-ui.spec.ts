import { test, expect } from "@playwright/test";

test("TC-23: a past payday offers a new cycle instead of a fabricated daily budget", async ({ page }) => {
  await page.goto("/app?scenario=paydayPassed");
  await expect(page.getByText("ถึงวันเงินเข้าแล้ว เริ่มตั้งรอบใหม่เพื่อคำนวณงบต่อได้เลย")).toBeVisible();
  await expect(page.getByRole("link", { name: "เริ่มรอบใหม่", exact: true }).first()).toBeVisible();
  await expect(page.getByText("NaN", { exact: false })).toHaveCount(0);
});
