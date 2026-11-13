# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\liff-flows.spec.ts >> LINE LIFF Frontend Flows - พอใช้ (PorChai) >> [TC-17] ป้องกันการกดซ้ำ: จำลอง Network Delay 1.5 วินาที กดยืนยันจ่าย 50 บ. รัวๆ 3 ครั้ง ต้องหักครั้งเดียว (1,000 → 950 บ.)
- Location: tests\e2e\liff-flows.spec.ts:89:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/entry/new
Call log:
  - navigating to "http://localhost:3004/entry/new", waiting until "load"

```

# Test source

```ts
  13  | test.beforeEach(async ({ page }) => {
  14  |   await page.addInitScript(() => {
  15  |     // จำลอง LINE LIFF SDK ใน Window
  16  |     (window as unknown as { liff: unknown }).liff = {
  17  |       init: async () => Promise.resolve(),
  18  |       isLoggedIn: () => true,
  19  |       isInClient: () => true,
  20  |       getIDToken: () => "mock-liff-id-token-xyz",
  21  |       getProfile: async () => ({
  22  |         userId: "U_demo_e2e_tester",
  23  |         displayName: "PorChai Tester",
  24  |         pictureUrl: "",
  25  |       }),
  26  |       login: () => {},
  27  |       closeWindow: () => {},
  28  |     };
  29  |   });
  30  | });
  31  | 
  32  | test.describe("LINE LIFF Frontend Flows - พอใช้ (PorChai)", () => {
  33  |   // --------------------------------------------------------------------------
  34  |   // 1. [TC-14] Validation ฟอร์มตั้งรอบเงิน
  35  |   // --------------------------------------------------------------------------
  36  |   test("[TC-14] Validation ฟอร์มตั้งรอบเงิน: เว้นว่างช่องเงินปัจจุบันหรือวันรับเงิน ต้องกดไม่ได้หรือไม่เกิด NaN", async ({
  37  |     page,
  38  |   }) => {
  39  |     await page.goto('http://localhost:3004/setup');
  40  | 
  41  |     // Flexible Selectors: รองรับทั้ง data-testid, Label, และ Name
  42  |     const balanceInput = page
  43  |       .locator('[data-testid="input-balance"]')
  44  |       .or(page.getByLabel(/เงินปัจจุบัน|เงินที่มี/i))
  45  |       .or(page.locator('input[name="balance"], input[name="startBalance"]'))
  46  |       .first();
  47  | 
  48  |     const paydayInput = page
  49  |       .locator('[data-testid="input-payday"]')
  50  |       .or(page.getByLabel(/วันรับเงิน|วันเงินเข้า/i))
  51  |       .or(page.locator('input[name="payday"], input[type="date"]'))
  52  |       .first();
  53  | 
  54  |     const submitBtn = page
  55  |       .locator('[data-testid="btn-submit-cycle"]')
  56  |       .or(page.getByRole("button", { name: /บันทึก|ถัดไป|ยืนยัน/i }))
  57  |       .first();
  58  | 
  59  |     // กรณีที่ 1: ไม่กรอกเงินปัจจุบันและไม่เลือกวันรับเงิน
  60  |     if (await submitBtn.isVisible()) {
  61  |       const isDisabled = await submitBtn.isDisabled();
  62  |       if (!isDisabled) {
  63  |         await submitBtn.click();
  64  |         // ต้องแสดง Error message แจ้งเตือนชัดเจน
  65  |         const errorMsg = page.locator("[role=\"alert\"]");
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
> 113 |     await page.goto('http://localhost:3004/entry/new');
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3004/entry/new
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
  133 |     // คลิกปุ่มยืนยันครั้งเดียวและรอการประมวลผลเสร็จสิ้น
  134 |     await confirmBtn.click();
  135 |     // รอให้ API เรียกเสร็จ (ประมาณ 2 วินาที)
  136 |     await page.waitForTimeout(2000);
  137 | 
  138 |     // 1. ปุ่มต้องถูก Disable ทันทีหลังคลิกแรกเพื่อป้องกัน Double Submit
  139 |     await expect(confirmBtn).toBeDisabled();
  140 | 
  141 |     // 2. รอให้คำขอเสร็จสิ้น
  142 |     await page.waitForTimeout(2000);
  143 | 
  144 |     // 3. API ต้องถูกเรียกประมวลผลเพียง 1 ครั้งเท่านั้น
  145 |     expect(apiCallCount).toBe(1);
  146 | 
  147 |     // 4. ยอดเงินคงเหลือในหน้ารายงานต้องแสดง 950 บาท (ไม่ใช่ 850 บาท)
  148 |     const balanceDisplay = page
  149 |       .locator('[data-testid="display-balance"]')
  150 |       .or(page.locator(".balance-amount, .text-balance"))
  151 |       .first();
  152 | 
  153 |     if (await balanceDisplay.isVisible()) {
  154 |       await expect(balanceDisplay).toContainText(/950/);
  155 |     }
  156 |   });
  157 | 
  158 |   // --------------------------------------------------------------------------
  159 |   // 3. [TC-26] ตั้งค่าหลายบิลและคำนวณงบเฉลี่ยใหม่เมื่อลบบิล
  160 |   // --------------------------------------------------------------------------
  161 |   test("[TC-26] ตั้งค่าหลายบิล: กรอก 2,400 บ. เพิ่มบิล 3 รายการ (400, 50, 150) งบ 150 บ./วัน เมื่อลบค่าน้ำ 50 บ. งบต้องอัปเดตเป็น 154 บ./วัน", async ({
  162 |     page,
  163 |   }) => {
  164 |     await page.goto('http://localhost:3000/setup/bills');
  165 | 
  166 |     // 1. กรอกเงินปัจจุบัน 2,400 บาท (12 วัน)
  167 |     const balanceInput = page
  168 |       .locator('[data-testid="input-balance"]')
  169 |       .or(page.getByLabel(/เงินปัจจุบัน/i))
  170 |       .first();
  171 |     if (await balanceInput.isVisible()) {
  172 |       await balanceInput.fill("2400");
  173 |     }
  174 | 
  175 |     // 2. ฟังก์ชันช่วยเพิ่มบิล
  176 |     const addBillBtn = page
  177 |       .locator('[data-testid="btn-add-bill"]')
  178 |       .or(page.getByRole("button", { name: /\+.*เพิ่มบิล|เพิ่มรายการ/i }))
  179 |       .first();
  180 | 
  181 |     const addBill = async (title: string, amount: string) => {
  182 |       if (await addBillBtn.isVisible()) {
  183 |         await addBillBtn.click();
  184 |       }
  185 |       const titleInput = page
  186 |         .locator('input[placeholder*="ชื่อบิล"], input[name*="title"]')
  187 |         .last();
  188 |       const amountInput = page
  189 |         .locator('input[placeholder*="จำนวนเงิน"], input[name*="amount"]')
  190 |         .last();
  191 | 
  192 |       if (await titleInput.isVisible()) await titleInput.fill(title);
  193 |       if (await amountInput.isVisible()) await amountInput.fill(amount);
  194 |     };
  195 | 
  196 |     // เพิ่ม 3 บิล: ค่าหอ 400, ค่าน้ำ 50, ค่าไฟ 150 (รวม 600 บ.)
  197 |     await addBill("ค่าหอ", "400");
  198 |     await addBill("ค่าน้ำ", "50");
  199 |     await addBill("ค่าไฟ", "150");
  200 | 
  201 |     // 3. ตรวจสอบยอดงบเฉลี่ยต่อวัน: (2,400 - 600) ÷ 12 = 150 บ./วัน
  202 |     const dailyBudgetDisplay = page
  203 |       .locator('[data-testid="daily-budget-summary"]')
  204 |       .or(page.locator(".daily-budget, .budget-per-day"))
  205 |       .first();
  206 | 
  207 |     if (await dailyBudgetDisplay.isVisible()) {
  208 |       await expect(dailyBudgetDisplay).toContainText(/150/);
  209 |     }
  210 | 
  211 |     // 4. กดลบบิล "ค่าน้ำ 50 บาท"
  212 |     // หาปุ่มลบในแถวของค่าน้ำ
  213 |     const waterBillRow = page
```