import { test, expect } from "@playwright/test";

// Mock UI flow only; real LINE SDK/token verification has separate integration tests.
test("TC-17: two immediate save clicks record one expense", async ({ page }) => {
  await page.goto("/app/record/new");
  await page.getByLabel("จำนวนเงิน (บาท)").fill("45");
  await page.getByLabel("ชื่อรายการ").fill("ข้าว");
  const save = page.getByRole("button", { name: "บันทึก", exact: true });
  await expect(save).toBeEnabled();
  await save.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(page).toHaveURL(/\/app\/record\/done\?mode=normal$/);
  await expect(page.getByText("75", { exact: true })).toBeVisible();
});
