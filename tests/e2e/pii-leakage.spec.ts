import { test, expect } from "@playwright/test";

test("TC-27: trial title and price stay out of URLs", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(decodeURIComponent(request.url())));
  await page.goto("/app/try");
  await page.getByLabel("ชื่อของที่จะซื้อ (ไม่บังคับ)").fill("private-item-tc27");
  await page.getByLabel("ราคา (บาท)").fill("481.23");
  await page.getByRole("button", { name: "ดูผลกระทบต่องบ" }).click();
  await expect(page).toHaveURL(/\/app\/try\/result$/);
  await expect(page.getByRole("heading", { name: 'ลองซื้อ "private-item-tc27" ราคา 481.23 บาท' })).toBeVisible();
  expect(urls.some((url) => /private-item-tc27|481\.23/.test(url))).toBe(false);
});
