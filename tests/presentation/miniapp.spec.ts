import { test, expect } from "@playwright/test";
import { checkpoint, isolate, tab } from "./helpers";

test.beforeEach(async ({ page }) => { await isolate(page); });

test("M01 · ผู้ใช้ใหม่: consent → ตั้งรอบเงิน → จด → แต้ม → รายงาน", async ({ page }, info) => {
  await page.goto("/app?scenario=fresh");
  await expect(page).toHaveURL(/\/app\/consent$/);
  await checkpoint(page, info, "01 ยินยอมก่อนเริ่มใช้");
  await page.getByRole("checkbox", { name: "ฉันเข้าใจและยินยอม" }).check();
  await page.getByRole("button", { name: "ยอมรับและเริ่ม" }).click();
  await expect(page).toHaveURL(/\/setup\/income$/);
  await page.getByRole("button", { name: "ทางบ้านส่งให้", exact: true }).click();
  await page.getByRole("button", { name: "ไม่แน่นอน", exact: true }).click();
  await page.getByLabel("กะว่าจะใช้ก้อนนี้ถึงวันที่เท่าไหร่", { exact: true }).fill(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  await checkpoint(page, info, "02 แหล่งเงินและวันรับเงิน");
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByLabel("เงินที่มีตอนนี้ (บาท)", { exact: true }).fill("3000");
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByRole("button", { name: /^10%/ }).click();
  await page.getByRole("button", { name: "ไม่กัน", exact: true }).click();
  await checkpoint(page, info, "03 กันเงินออมและเงินเผื่อ");
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByLabel("ยอดต่อวัน (บาท)", { exact: true }).fill("70");
  await page.getByRole("button", { name: "ดูสรุปแผน", exact: true }).click();
  await checkpoint(page, info, "04 ตรวจแผนก่อนเริ่ม");
  await page.getByRole("button", { name: /ถูกต้อง เริ่มใช้เลย|เริ่มใช้ต่อไป/ }).click();
  await expect(page).toHaveURL(/\/app(?:\?.*)?$/);
  await checkpoint(page, info, "05 Dashboard หลังตั้งแผน");
  // Use the app's SPA links: reloading would intentionally reset the in-memory mock.
  await page.getByRole("button", { name: "จด", exact: true }).click();
  await page.getByRole("link", { name: "จดรายจ่าย", exact: true }).click();
  await page.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("45");
  await page.getByLabel("ชื่อรายการ", { exact: true }).fill("ข้าวเดโม");
  await checkpoint(page, info, "06 จดข้าว 45 บาท");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page).toHaveURL(/\/record\/done/);
  await checkpoint(page, info, "07 บันทึกสำเร็จ");
  await tab(page, "/app");
  await tab(page, "/app/points");
  await expect(page.getByRole("main").getByText("รับแต้มฟรีแล้ววันนี้", { exact: false })).toBeVisible();
  await checkpoint(page, info, "08 แต้มอัตโนมัติจากการจด");
  await tab(page, "/app");
  await tab(page, "/app/reports");
  await expect(page.getByRole("main")).toContainText("45");
  await checkpoint(page, info, "09 รายงานจากข้อมูลที่จดใน session เดียวกัน");
});

test("M02 · ลองก่อนจ่าย → ยกเลิกโดยไม่จด", async ({ page }, info) => {
  await page.goto("/app/try");
  await page.getByLabel("ชื่อของที่จะซื้อ (ไม่บังคับ)", { exact: true }).fill("รองเท้าเดโม");
  await page.getByLabel("ราคา (บาท)", { exact: true }).fill("480");
  await page.getByRole("button", { name: "ดูผลกระทบต่องบ" }).click();
  await expect(page.getByText("80", { exact: true })).toBeVisible();
  await checkpoint(page, info, "10 เปรียบเทียบงบก่อนและหลังซื้อ");
  await page.getByRole("button", { name: "เลือกวิธีจัดการรายการนี้" }).click();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\?.*)?$/);
  await expect(page.getByText("วันนี้ยังไม่มีรายการจด ลองบันทึกมื้อแรกของวันได้เลย")).toBeVisible();
  await checkpoint(page, info, "11 ลองแล้วไม่ซื้อ ไม่มีรายจ่ายใหม่");
});

test("M03 · ปฏิทินบิล → ตรวจร่าง → บันทึกบิลประจำ", async ({ page }, info) => {
  await page.goto("/app/settings/bills");
  await expect(page.getByRole("button", { name: "+ เพิ่มบิล", exact: true })).toBeVisible();
  await checkpoint(page, info, "12 ปฏิทินบิลประจำ");
  await page.getByRole("button", { name: "+ เพิ่มบิล", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ชื่อบิล", { exact: true }).fill("ค่าเน็ตเดโม");
  await dialog.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("299");
  await dialog.getByRole("button", { name: "ตรวจบิลก่อนบันทึก" }).click();
  await checkpoint(page, info, "13 ตรวจวันและยอดบิล");
  await dialog.getByRole("button", { name: "ยืนยันเพิ่มบิล" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("ค่าเน็ตเดโม", { exact: true })).toBeVisible();
  await checkpoint(page, info, "14 บิลถูกเพิ่มในปฏิทิน");
});

test("M04 · วิเคราะห์ → หมวด/งบ → แจ้งเตือน → โปร → คู่มือ", async ({ page }, info) => {
  for (const [path, title, expected] of [
    ["/app/insights?scenario=midCycle", "15 วิเคราะห์พฤติกรรม", "พฤติกรรมการใช้เงิน"],
    ["/app/settings/categories", "16 หมวดและงบรายจ่าย", "หมวด"],
    ["/app/notifications", "17 สรุปและเตือนงบ", "สรุปและเตือนงบ"],
    ["/app/promotions", "18 คูปองและโฆษณาตัวอย่าง", "สมมติ"],
    ["/app/help", "19 คู่มือทุกฟีเจอร์", "วิธีใช้"],
  ]) {
    // Independent feature tours have fresh fixture state, not a continuation of M01.
    await page.goto(path);
    await expect(page.getByRole("main")).toContainText(expected);
    await checkpoint(page, info, title);
  }
});


test("M05 · ตั้งหมวดและงบ → บันทึกการแจ้งเตือน", async ({ page }, info) => {
  await page.goto("/app/settings/categories");
  await page.getByRole("button", { name: "+ สร้างหมวดใหม่", exact: true }).click();
  await page.getByLabel("ชื่อหมวด", { exact: true }).fill("ชานมเดโม");
  await page.getByRole("combobox", { name: /หมวดหลัก/ }).selectOption("food");
  await page.getByLabel("งบต่อเดือน (บาท)", { exact: true }).fill("500");
  await page.getByRole("button", { name: "ตรวจข้อมูลก่อนบันทึก", exact: true }).click();
  await checkpoint(page, info, "20 ตรวจหมวดและงบก่อนยืนยัน");
  await page.getByRole("button", { name: "ยืนยันบันทึกหมวดและงบ", exact: true }).click();
  const category = page.getByRole("list", { name: "หมวดและงบรายเดือน" }).getByRole("listitem").filter({ hasText: "ชานมเดโม" });
  await expect(category).toContainText("500 บาท/เดือน");
  await checkpoint(page, info, "21 บันทึกหมวดตามวิธีใช้เงิน");
  await page.goto("/app/notifications");
  await page.getByRole("checkbox", { name: /สรุปรายวัน/ }).check();
  await page.getByLabel("เวลาส่งสรุป (ประเทศไทย)", { exact: true }).fill("20:00");
  await page.getByRole("button", { name: "บันทึกการแจ้งเตือน", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("บันทึกแล้ว");
  await checkpoint(page, info, "22 ตั้งสรุปผ่าน LINE (ไม่ส่ง push จริง)");
});

test("M06 · ยอดไม่ถูกต้องและวันรับเงินผ่านแล้ว", async ({ page }, info) => {
  await page.goto("/app/record/new");
  await page.getByLabel("ชื่อรายการ", { exact: true }).fill("ยอดผิดเดโม");
  await page.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("-10");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page).toHaveURL(/\/record\/new$/);
  await expect(page.getByRole("main")).toContainText(/มากกว่า|ติดลบ|ถูกต้อง/);
  await checkpoint(page, info, "23 ป้องกันยอดผิดก่อนบันทึก");
  await page.goto("/app?scenario=paydayPassed");
  await expect(page.getByText("ถึงวันเงินเข้าแล้ว เริ่มตั้งรอบใหม่เพื่อคำนวณงบต่อได้เลย")).toBeVisible();
  await checkpoint(page, info, "24 ถึงรอบรับเงินใหม่");
});

test("M07 · จดแล้วค้นในบัญชี → คำค้นไม่พบ → สลับค้นเว็บ", async ({ page }, info) => {
  await page.goto("/app/record/new");
  await page.getByLabel("ชื่อรายการ", { exact: true }).fill("ชานมค้นหาเดโม");
  await page.getByLabel("จำนวนเงิน (บาท)", { exact: true }).fill("35");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page).toHaveURL(/\/record\/done/);
  await tab(page, "/app");
  await tab(page, "/app/search");
  await page.getByLabel("คำค้น", { exact: true }).fill("ชานมค้นหาเดโม");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  const results = page.getByRole("region", { name: "ผลการค้นหา" });
  await expect(results).toContainText("พบ 1 รายการ");
  await expect(results).toContainText("35");
  await checkpoint(page, info, "25 ค้นรายการที่เพิ่งจดในบัญชีเดียวกัน");
  await page.getByLabel("คำค้น", { exact: true }).fill("ไม่มีชื่อนี้แน่นอนเดโม");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(results).toContainText("พบ 0 รายการ");
  await expect(results).not.toContainText("ชานมค้นหาเดโม");
  await page.getByRole("button", { name: "ค้นเว็บ", exact: true }).click();
  await expect(results).toHaveCount(0);
  await page.getByLabel("คำค้น", { exact: true }).fill("สิทธิ์นักศึกษา ค่าเดินทาง");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(results).toContainText("โหมดจำลองไม่ค้นเว็บจริง");
  await checkpoint(page, info, "26 แยกข้อมูลส่วนตัวกับการค้นเว็บ");
});

test("M08 · ตั้งค่า → ความเป็นส่วนตัว → ยกเลิกการลบข้อมูล", async ({ page }, info) => {
  await page.goto("/app/settings");
  await page.getByRole("link", { name: /ความเป็นส่วนตัวและข้อมูล/ }).click();
  await expect(page).toHaveURL(/\/settings\/privacy$/);
  await expect(page.getByRole("main")).toContainText("ข้อมูล");
  await checkpoint(page, info, "27 เข้าใจข้อมูลที่พอใช้เก็บ");
  await page.goto("/app/settings/delete");
  await page.getByRole("button", { name: "ลบข้อมูลทั้งหมด", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("ลบแล้วกู้คืนไม่ได้");
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/delete$/);
  await page.getByRole("link", { name: "ยกเลิก", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await checkpoint(page, info, "28 ยกเลิกก่อนลบ กลับมาตั้งค่าได้");
});
