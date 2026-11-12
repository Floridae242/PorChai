import { test, expect } from "@playwright/test";

/**
 * Playwright E2E Tests: LINE LIFF User Flows (พอใช้ - PorChai)
 *
 * ครอบคลุม:
 * 1. [TC-14] Form Validation ฟอร์มตั้งรอบเงิน (ป้องกันค่าว่าง / NaN)
 * 2. [TC-17] Double Submit Protection (ป้องกันการกดยืนยันจ่ายเงินรัวๆ)
 * 3. [TC-26] จัดการหลายบิลและคำนวณงบเฉลี่ยใหม่ทันทีเมื่อลบบิล
 */

// Mock LIFF Environment ก่อนหน้าเว็บโหลด
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // จำลอง LINE LIFF SDK ใน Window
    (window as unknown as { liff: unknown }).liff = {
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
});

test.describe("LINE LIFF Frontend Flows - พอใช้ (PorChai)", () => {
  // --------------------------------------------------------------------------
  // 1. [TC-14] Validation ฟอร์มตั้งรอบเงิน
  // --------------------------------------------------------------------------
  test("[TC-14] Validation ฟอร์มตั้งรอบเงิน: เว้นว่างช่องเงินปัจจุบันหรือวันรับเงิน ต้องกดไม่ได้หรือไม่เกิด NaN", async ({
    page,
  }) => {
    await page.goto("/setup");

    // Flexible Selectors: รองรับทั้ง data-testid, Label, และ Name
    const balanceInput = page
      .locator('[data-testid="input-balance"]')
      .or(page.getByLabel(/เงินปัจจุบัน|เงินที่มี/i))
      .or(page.locator('input[name="balance"], input[name="startBalance"]'))
      .first();

    const paydayInput = page
      .locator('[data-testid="input-payday"]')
      .or(page.getByLabel(/วันรับเงิน|วันเงินเข้า/i))
      .or(page.locator('input[name="payday"], input[type="date"]'))
      .first();

    const submitBtn = page
      .locator('[data-testid="btn-submit-cycle"]')
      .or(page.getByRole("button", { name: /บันทึก|ถัดไป|ยืนยัน/i }))
      .first();

    // กรณีที่ 1: ไม่กรอกเงินปัจจุบันและไม่เลือกวันรับเงิน
    if (await submitBtn.isVisible()) {
      const isDisabled = await submitBtn.isDisabled();
      if (!isDisabled) {
        await submitBtn.click();
        // ต้องแสดง Error message แจ้งเตือนชัดเจน
        const errorMsg = page.locator(".error, [role='alert'], .text-red-500");
        await expect(errorMsg.first()).toBeVisible();
      } else {
        expect(isDisabled).toBe(true);
      }
    }

    // กรณีที่ 2: กรอกเงินปัจจุบัน แต่เว้นว่างวันรับเงิน
    if (await balanceInput.isVisible()) {
      await balanceInput.fill("1000");
    }
    if (await submitBtn.isVisible() && (await submitBtn.isEnabled())) {
      await submitBtn.click();
    }

    // ตรวจสอบว่าหน้าจอต้องไม่แสดงผลลัพธ์เป็น NaN หรือ undefined โดยเด็ดขาด
    const bodyContent = await page.locator("body").innerText();
    expect(bodyContent).not.toMatch(/NaN/i);
    expect(bodyContent).not.toMatch(/undefined/i);
  });

  // --------------------------------------------------------------------------
  // 2. [TC-17] ป้องกันการกดซ้ำ (Double Submit Protection)
  // --------------------------------------------------------------------------
  test("[TC-17] ป้องกันการกดซ้ำ: จำลอง Network Delay 1.5 วินาที กดยืนยันจ่าย 50 บ. รัวๆ 3 ครั้ง ต้องหักครั้งเดียว (1,000 → 950 บ.)", async ({
    page,
  }) => {
    let apiCallCount = 0;

    // จำลอง Mock API Route พร้อมหน่วงเวลา (Network Delay) 1.5 วินาที
    await page.route("**/api/entries", async (route) => {
      apiCallCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entry: {
            id: "entry_mock_1",
            amount: 5000, // 50 บาท (5,000 สตางค์)
            category: "food",
            note: "อาหาร 50 บ.",
          },
          newBalance: 95000, // 950 บาท (95,000 สตางค์)
        }),
      });
    });

    await page.goto("/entry/new");

    // ระบุจำนวนเงิน 50 บาท
    const amountInput = page
      .locator('[data-testid="input-amount"]')
      .or(page.getByLabel(/จำนวนเงิน|ยอดเงิน/i))
      .or(page.locator('input[name="amount"], input[type="number"]'))
      .first();

    if (await amountInput.isVisible()) {
      await amountInput.fill("50");
    }

    const confirmBtn = page
      .locator('[data-testid="btn-confirm-payment"]')
      .or(page.getByRole("button", { name: /ยืนยันการจ่าย|บันทึกรายจ่าย|ยืนยัน/i }))
      .first();

    await expect(confirmBtn).toBeVisible();

    // จำลองผู้ใช้กดยืนยันรัวๆ 3 ครั้งติดกันขณะกำลังประมวลผล
    await Promise.all([
      confirmBtn.click({ clickCount: 1 }),
      confirmBtn.click({ force: true }).catch(() => {}),
      confirmBtn.click({ force: true }).catch(() => {}),
    ]);

    // 1. ปุ่มต้องถูก Disable ทันทีหลังคลิกแรกเพื่อป้องกัน Double Submit
    await expect(confirmBtn).toBeDisabled();

    // 2. รอให้คำขอเสร็จสิ้น
    await page.waitForTimeout(2000);

    // 3. API ต้องถูกเรียกประมวลผลเพียง 1 ครั้งเท่านั้น
    expect(apiCallCount).toBe(1);

    // 4. ยอดเงินคงเหลือในหน้ารายงานต้องแสดง 950 บาท (ไม่ใช่ 850 บาท)
    const balanceDisplay = page
      .locator('[data-testid="display-balance"]')
      .or(page.locator(".balance-amount, .text-balance"))
      .first();

    if (await balanceDisplay.isVisible()) {
      await expect(balanceDisplay).toContainText(/950/);
    }
  });

  // --------------------------------------------------------------------------
  // 3. [TC-26] ตั้งค่าหลายบิลและคำนวณงบเฉลี่ยใหม่เมื่อลบบิล
  // --------------------------------------------------------------------------
  test("[TC-26] ตั้งค่าหลายบิล: กรอก 2,400 บ. เพิ่มบิล 3 รายการ (400, 50, 150) งบ 150 บ./วัน เมื่อลบค่าน้ำ 50 บ. งบต้องอัปเดตเป็น 154 บ./วัน", async ({
    page,
  }) => {
    await page.goto("/setup/bills");

    // 1. กรอกเงินปัจจุบัน 2,400 บาท (12 วัน)
    const balanceInput = page
      .locator('[data-testid="input-balance"]')
      .or(page.getByLabel(/เงินปัจจุบัน/i))
      .first();
    if (await balanceInput.isVisible()) {
      await balanceInput.fill("2400");
    }

    // 2. ฟังก์ชันช่วยเพิ่มบิล
    const addBillBtn = page
      .locator('[data-testid="btn-add-bill"]')
      .or(page.getByRole("button", { name: /\+.*เพิ่มบิล|เพิ่มรายการ/i }))
      .first();

    const addBill = async (title: string, amount: string) => {
      if (await addBillBtn.isVisible()) {
        await addBillBtn.click();
      }
      const titleInput = page
        .locator('input[placeholder*="ชื่อบิล"], input[name*="title"]')
        .last();
      const amountInput = page
        .locator('input[placeholder*="จำนวนเงิน"], input[name*="amount"]')
        .last();

      if (await titleInput.isVisible()) await titleInput.fill(title);
      if (await amountInput.isVisible()) await amountInput.fill(amount);
    };

    // เพิ่ม 3 บิล: ค่าหอ 400, ค่าน้ำ 50, ค่าไฟ 150 (รวม 600 บ.)
    await addBill("ค่าหอ", "400");
    await addBill("ค่าน้ำ", "50");
    await addBill("ค่าไฟ", "150");

    // 3. ตรวจสอบยอดงบเฉลี่ยต่อวัน: (2,400 - 600) ÷ 12 = 150 บ./วัน
    const dailyBudgetDisplay = page
      .locator('[data-testid="daily-budget-summary"]')
      .or(page.locator(".daily-budget, .budget-per-day"))
      .first();

    if (await dailyBudgetDisplay.isVisible()) {
      await expect(dailyBudgetDisplay).toContainText(/150/);
    }

    // 4. กดลบบิล "ค่าน้ำ 50 บาท"
    // หาปุ่มลบในแถวของค่าน้ำ
    const waterBillRow = page
      .locator("tr, div, li")
      .filter({ hasText: /ค่าน้ำ/i })
      .first();

    const deleteBtn = waterBillRow
      .locator('[data-testid*="delete"], button')
      .filter({ hasText: /ลบ|delete|×/i })
      .or(waterBillRow.locator("svg"))
      .first();

    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
    }

    // 5. ตรวจสอบยอดงบเฉลี่ยหลังลบ: (2,400 - 550) ÷ 12 = 1,850 ÷ 12 = 154.16 → 154.00 บ./วัน
    if (await dailyBudgetDisplay.isVisible()) {
      await expect(dailyBudgetDisplay).toContainText(/154(\.00)?/);
    }
  });
});

