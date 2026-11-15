import { test, expect } from "@playwright/test";

test("TC-22: a mock trial shows the current quarter-baht calculation", async ({ page }) => {
  await page.goto("/app/try");
  await page.getByLabel("ชื่อของที่จะซื้อ (ไม่บังคับ)").fill("รองเท้า");
  await page.getByLabel("ราคา (บาท)").fill("480");
  await page.getByRole("button", { name: "ดูผลกระทบต่องบ" }).click();
  await expect(page).toHaveURL(/\/app\/try\/result$/);
  await expect(page.getByText("80", { exact: true })).toBeVisible();
  await expect(page.getByText("120", { exact: true })).toBeVisible();
});
