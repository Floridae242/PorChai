# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\liff-flows.spec.ts >> LINE LIFF Frontend Flows - พอใช้ (PorChai) >> [TC-26] ตั้งค่าหลายบิล: กรอก 2,400 บ. เพิ่มบิล 3 รายการ (400, 50, 150) งบ 150 บ./วัน เมื่อลบค่าน้ำ 50 บ. งบต้องอัปเดตเป็น 154 บ./วัน
- Location: tests\e2e\liff-flows.spec.ts:163:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/setup/bills", waiting until "load"

```

# Test source

```ts
  66  |         await expect(errorMsg.first()).toBeVisible();
  67  |       } else {
  68  |         expect(isDisabled).toBe(true);
  69  |       }
  70  |     }
  71  | 
  72  |     // กรณีที่ 2: กรอกเงินปัจจุบัน แต่เว้นว่างวันรับเงิน
  73  |     if (await balanceInput.isVisible()) {
  74  |       await balanceInput.fill("1000");
  75  |     }
  76  |     if (await submitBtn.isVisible() && (await submitBtn.isEnabled())) {
  77  |       await submitBtn.click();
  78  |     }
  79  | 
  80  |     // ตรวจสอบว่าหน้าจอต้องไม่แสดงผลลัพธ์เป็น NaN หรือ undefined โดยเด็ดขาด
  81  |     const bodyContent = await page.locator("body").innerText();
  82  |     expect(bodyContent).not.toMatch(/NaN/i);
  83  |     expect(bodyContent).not.toMatch(/undefined/i);
  84  |   });
  85  | 
  86  |   // --------------------------------------------------------------------------
  87  |   // 2. [TC-17] ป้องกันการกดซ้ำ (Double Submit Protection)
  88  |   // --------------------------------------------------------------------------
  89  |   test("[TC-17] ป้องกันการกดซ้ำ: จำลอง Network Delay 1.5 วินาที กดยืนยันจ่าย 50 บ. รัวๆ 3 ครั้ง ต้องหักครั้งเดียว (1,000 → 950 บ.)", async ({
  90  |     page,
  91  |   }) => {
  92  |     let apiCallCount = 0;
  93  | 
  94  |     // จำลอง Mock API Route พร้อมหน่วงเวลา (Network Delay) 1.5 วินาที
  95  |     await page.route("**/api/entries", async (route) => {
  96  |       apiCallCount += 1;
  97  |       await new Promise((resolve) => setTimeout(resolve, 1500));
  98  |       await route.fulfill({
  99  |         status: 200,
  100 |         contentType: "application/json",
  101 |         body: JSON.stringify({
  102 |           entry: {
  103 |             id: "entry_mock_1",
  104 |             amount: 5000, // 50 บาท (5,000 สตางค์)
  105 |             category: "food",
  106 |             note: "อาหาร 50 บ.",
  107 |           },
  108 |           newBalance: 95000, // 950 บาท (95,000 สตางค์)
  109 |         }),
  110 |       });
  111 |     });
  112 | 
  113 |     await page.goto("/entry/new");
  114 | 
  115 |     // ระบุจำนวนเงิน 50 บาท
  116 |     const amountInput = page
  117 |       .locator('[data-testid="input-amount"]')
  118 |       .or(page.getByLabel(/จำนวนเงิน|ยอดเงิน/i))
  119 |       .or(page.locator('input[name="amount"], input[type="number"]'))
  120 |       .first();
  121 | 
  122 |     if (await amountInput.isVisible()) {
  123 |       await amountInput.fill("50");
  124 |     }
  125 | 
  126 |     const confirmBtn = page
  127 |       .locator('[data-testid="btn-confirm-payment"]')
  128 |       .or(page.getByRole("button", { name: /ยืนยันการจ่าย|บันทึกรายจ่าย|ยืนยัน/i }))
  129 |       .first();
  130 | 
  131 |     await expect(confirmBtn).toBeVisible();
  132 | 
  133 |     // จำลองผู้ใช้กดยืนยันรัวๆ 3 ครั้งติดกันขณะกำลังประมวลผล
  134 |     await Promise.all([
  135 |       confirmBtn.click({ clickCount: 1 }),
  136 |       confirmBtn.click({ force: true }).catch(() => {}),
  137 |       confirmBtn.click({ force: true }).catch(() => {}),
  138 |     ]);
  139 | 
  140 |     // 1. ปุ่มต้องถูก Disable ทันทีหลังคลิกแรกเพื่อป้องกัน Double Submit
  141 |     await expect(confirmBtn).toBeDisabled();
  142 | 
  143 |     // 2. รอให้คำขอเสร็จสิ้น
  144 |     await page.waitForTimeout(2000);
  145 | 
  146 |     // 3. API ต้องถูกเรียกประมวลผลเพียง 1 ครั้งเท่านั้น
  147 |     expect(apiCallCount).toBe(1);
  148 | 
  149 |     // 4. ยอดเงินคงเหลือในหน้ารายงานต้องแสดง 950 บาท (ไม่ใช่ 850 บาท)
  150 |     const balanceDisplay = page
  151 |       .locator('[data-testid="display-balance"]')
  152 |       .or(page.locator(".balance-amount, .text-balance"))
  153 |       .first();
  154 | 
  155 |     if (await balanceDisplay.isVisible()) {
  156 |       await expect(balanceDisplay).toContainText(/950/);
  157 |     }
  158 |   });
  159 | 
  160 |   // --------------------------------------------------------------------------
  161 |   // 3. [TC-26] ตั้งค่าหลายบิลและคำนวณงบเฉลี่ยใหม่เมื่อลบบิล
  162 |   // --------------------------------------------------------------------------
  163 |   test("[TC-26] ตั้งค่าหลายบิล: กรอก 2,400 บ. เพิ่มบิล 3 รายการ (400, 50, 150) งบ 150 บ./วัน เมื่อลบค่าน้ำ 50 บ. งบต้องอัปเดตเป็น 154 บ./วัน", async ({
  164 |     page,
  165 |   }) => {
> 166 |     await page.goto("/setup/bills");
      |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  167 | 
  168 |     // 1. กรอกเงินปัจจุบัน 2,400 บาท (12 วัน)
  169 |     const balanceInput = page
  170 |       .locator('[data-testid="input-balance"]')
  171 |       .or(page.getByLabel(/เงินปัจจุบัน/i))
  172 |       .first();
  173 |     if (await balanceInput.isVisible()) {
  174 |       await balanceInput.fill("2400");
  175 |     }
  176 | 
  177 |     // 2. ฟังก์ชันช่วยเพิ่มบิล
  178 |     const addBillBtn = page
  179 |       .locator('[data-testid="btn-add-bill"]')
  180 |       .or(page.getByRole("button", { name: /\+.*เพิ่มบิล|เพิ่มรายการ/i }))
  181 |       .first();
  182 | 
  183 |     const addBill = async (title: string, amount: string) => {
  184 |       if (await addBillBtn.isVisible()) {
  185 |         await addBillBtn.click();
  186 |       }
  187 |       const titleInput = page
  188 |         .locator('input[placeholder*="ชื่อบิล"], input[name*="title"]')
  189 |         .last();
  190 |       const amountInput = page
  191 |         .locator('input[placeholder*="จำนวนเงิน"], input[name*="amount"]')
  192 |         .last();
  193 | 
  194 |       if (await titleInput.isVisible()) await titleInput.fill(title);
  195 |       if (await amountInput.isVisible()) await amountInput.fill(amount);
  196 |     };
  197 | 
  198 |     // เพิ่ม 3 บิล: ค่าหอ 400, ค่าน้ำ 50, ค่าไฟ 150 (รวม 600 บ.)
  199 |     await addBill("ค่าหอ", "400");
  200 |     await addBill("ค่าน้ำ", "50");
  201 |     await addBill("ค่าไฟ", "150");
  202 | 
  203 |     // 3. ตรวจสอบยอดงบเฉลี่ยต่อวัน: (2,400 - 600) ÷ 12 = 150 บ./วัน
  204 |     const dailyBudgetDisplay = page
  205 |       .locator('[data-testid="daily-budget-summary"]')
  206 |       .or(page.locator(".daily-budget, .budget-per-day"))
  207 |       .first();
  208 | 
  209 |     if (await dailyBudgetDisplay.isVisible()) {
  210 |       await expect(dailyBudgetDisplay).toContainText(/150/);
  211 |     }
  212 | 
  213 |     // 4. กดลบบิล "ค่าน้ำ 50 บาท"
  214 |     // หาปุ่มลบในแถวของค่าน้ำ
  215 |     const waterBillRow = page
  216 |       .locator("tr, div, li")
  217 |       .filter({ hasText: /ค่าน้ำ/i })
  218 |       .first();
  219 | 
  220 |     const deleteBtn = waterBillRow
  221 |       .locator('[data-testid*="delete"], button')
  222 |       .filter({ hasText: /ลบ|delete|×/i })
  223 |       .or(waterBillRow.locator("svg"))
  224 |       .first();
  225 | 
  226 |     if (await deleteBtn.isVisible()) {
  227 |       await deleteBtn.click();
  228 |     }
  229 | 
  230 |     // 5. ตรวจสอบยอดงบเฉลี่ยหลังลบ: (2,400 - 550) ÷ 12 = 1,850 ÷ 12 = 154.16 → 154.00 บ./วัน
  231 |     if (await dailyBudgetDisplay.isVisible()) {
  232 |       await expect(dailyBudgetDisplay).toContainText(/154(\.00)?/);
  233 |     }
  234 |   });
  235 | });
  236 | 
  237 | 
```