import { test, expect } from "@playwright/test";

test("TC-22: opening and cancelling a trial does not record spending", async ({ page }) => {
  await page.goto("/app/try");
  await page.getByLabel("ราคา (บาท)").fill("480");
  await page.getByRole("button", { name: "ดูผลกระทบต่องบ" }).click();
  await expect(page.getByText("80", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "เลือกวิธีจัดการรายการนี้" }).click();
  await expect(page).toHaveURL(/\/app\/try\/decide$/);
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("วันนี้ยังไม่มีรายการจด ลองบันทึกมื้อแรกของวันได้เลย")).toBeVisible();
});
