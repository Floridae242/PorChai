/**
 * Por-Chai (พอใช้) full-system E2E suite: PM demo and sign-off.
 *
 * Mapped to docs/test/TestCase-Porchai-v4 (1).xlsx. Every number asserted here is the value the
 * spreadsheet's "ตรวจสูตร" sheet expects, written exactly as the app renders it (formatBaht).
 *
 * How it runs (see tests/e2e/helpers/liff-mock.ts): the MINI App in live mode, LINE replaced by an
 * injected window.liff, and /api/* answered per user (token-checked) by the app's own calculation code.
 * Clock fixed at 2026-11-11 10:00 Asia/Bangkok.
 *
 * Route map (the request named some paths differently; these are the real ones):
 *   onboarding /app/consent → /app/setup/{income,balance,savings,essentials,review}
 *   simulate   /app/try → /app/try/result → /app/try/decide → /app/try/saved
 *   expenses   /app/record/new → /app/record/link | /app/record/done, edit /app/record/[id]
 *   plans      /app/plan?tab=list|pending|savings, balance /app/balance/adjust, new cycle /app/cycle/new
 *   points     /app/points, /app/points/history
 */
import type { Page } from "@playwright/test";
import {
  expect,
  expandMath,
  expectHero,
  openHome,
  test,
  USER_A,
  USER_B,
  type E2EUser,
} from "./helpers/liff-mock";

// The standard demo dataset (TC-01..03): 1,000 baht, dorm bill 300 baht, 7 days to payday.
const DEMO = { balance: 1000, paydayInDays: 7, bills: [{ title: "ค่าหอ", amount: 300 }] };

// ---------------------------------------------------------------- UI helpers

const nav = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });

async function gotoTab(page: Page, name: "สรุป" | "แผนเงิน" | "สิทธิพิเศษ" | "ตั้งค่า") {
  await nav(page).getByRole("link", { name, exact: true }).click();
}

async function openRecordChooser(page: Page, option: "จดรายจ่าย" | "จดรายรับ" | "ลองก่อนจ่าย") {
  await nav(page).getByRole("button", { name: "จด", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "จะจดอะไร" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: option, exact: true }).click();
}

async function setupIncomeMonthly(page: Page, day: number) {
  await expect(page).toHaveURL(/\/app\/setup\/income$/);
  await page.getByRole("button", { name: "ทางบ้านส่งให้", exact: true }).click();
  await page.getByRole("button", { name: "รายเดือน", exact: true }).click();
  await page.getByRole("button", { name: `วันที่ ${day}`, exact: true }).click();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/setup\/balance$/);
}

async function addBill(page: Page, title: string, amount: number) {
  await page.getByRole("button", { name: "+ เพิ่มบิล" }).click();
  const sheet = page.getByRole("dialog", { name: "เพิ่มบิล" });
  await sheet.getByLabel("ชื่อบิล").fill(title);
  await sheet.getByLabel("จำนวนเงิน (บาท)").fill(String(amount));
  await sheet.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function setupBalance(page: Page, balance: number, bills: { title: string; amount: number }[]) {
  await page.getByLabel("เงินที่มีตอนนี้ (บาท)").fill(String(balance));
  for (const b of bills) await addBill(page, b.title, b.amount);
}

async function setupNoSavingsNoBuffer(page: Page) {
  await expect(page).toHaveURL(/\/app\/setup\/savings$/);
  await page.getByRole("button", { name: "ยังไม่ตั้ง", exact: true }).click();
  await page.getByRole("button", { name: "ไม่กัน", exact: true }).click();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/setup\/essentials$/);
}

async function setupSkipEssentials(page: Page) {
  await page.getByRole("button", { name: "ข้ามไปก่อน", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/setup\/review$/);
}

async function tryItem(page: Page, title: string, price: number) {
  await page.getByLabel("ชื่อของที่จะซื้อ (ไม่บังคับ)").fill(title);
  await page.getByLabel("ราคา (บาท)").fill(String(price));
  await page.getByRole("button", { name: "ดูผลกระทบต่องบ" }).click();
  await expect(page).toHaveURL(/\/app\/try\/result$/);
}

const buyCard = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^ถ้าซื้อ ${title}`) });
const skipCard = (page: Page) => page.getByRole("button", { name: /^ถ้ายังไม่ซื้อ/ });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "If I buy" card shows `daily` baht/day (the number right after the "(price บาท)" label). */
async function expectBuyDaily(page: Page, title: string, daily: string) {
  await expect(buyCard(page, title)).toContainText(new RegExp(`\\)\\s*${esc(daily)}\\s*บาท/วัน`));
}
async function expectSkipDaily(page: Page, daily: string) {
  await expect(skipCard(page)).toContainText(new RegExp(`ถ้ายังไม่ซื้อ\\s*${esc(daily)}\\s*บาท/วัน`));
}

async function recordExpense(page: Page, amount: number, note: string) {
  await expect(page).toHaveURL(/\/app\/record\/new/);
  await page.getByLabel("จำนวนเงิน (บาท)").fill(String(amount));
  await page.getByLabel("ชื่อรายการ").fill(note);
}

const planRow = (page: Page, title: string) => page.getByTestId("plan-row").filter({ hasText: title });

/** Calls the API from inside the app's origin (same path the app uses), as any token. */
async function apiAs(page: Page, token: string | null, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  return page.evaluate(
    async ({ token, method, path, body, extraHeaders }) => {
      const headers: Record<string, string> = { ...extraHeaders };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      return { status: res.status, text };
    },
    { token, method, path, body, extraHeaders },
  );
}

// =================================================================== Flow 0
test.describe("Flow 0 · Every screen opens cleanly (route smoke)", () => {
  // Screens reachable from the MINI App with an active cycle. Each must render, finish loading,
  // and never show NaN / Infinity / undefined in place of a number.
  const SCREENS: [string, string][] = [
    ["/app", "สรุป (หน้าแรก)"],
    ["/app/plan", "แผนเงิน · รายการ"],
    ["/app/plan?tab=pending", "แผนเงิน · รอจ่าย"],
    ["/app/plan?tab=savings", "แผนเงิน · ออม/เผื่อ"],
    ["/app/plan/edit", "แก้แผน"],
    ["/app/plan/edit/payday", "แก้แผน · วันเงินเข้า"],
    ["/app/balance/adjust", "ปรับยอดให้ตรงเงินจริง"],
    ["/app/try", "ลองก่อนจ่าย"],
    ["/app/record/new", "จดรายจ่าย"],
    ["/app/record/new?type=income", "จดรายรับ"],
    ["/app/cycle/new", "เริ่มรอบเงินใหม่"],
    ["/app/points", "แต้มของฉัน"],
    ["/app/points/history", "ประวัติแต้ม"],
    ["/app/perks", "สิทธิพิเศษ"],
    ["/app/promotions", "โปรโมชัน"],
    ["/app/sponsors", "ผู้สนับสนุน"],
    ["/app/reports", "รายงาน"],
    ["/app/insights", "วิเคราะห์การใช้จ่าย"],
    ["/app/search", "ค้นหา"],
    ["/app/notifications", "การแจ้งเตือน"],
    ["/app/help", "ช่วยเหลือ"],
    ["/app/summary/categories", "สรุปตามหมวด"],
    ["/app/settings", "ตั้งค่า"],
    ["/app/settings/bills", "ตั้งค่า · บิล"],
    ["/app/settings/categories", "ตั้งค่า · หมวด"],
    ["/app/settings/notifications", "ตั้งค่า · การเตือน"],
    ["/app/settings/privacy", "ตั้งค่า · ความเป็นส่วนตัว"],
    ["/app/settings/savings", "ตั้งค่า · เงินออม"],
    ["/app/settings/delete", "ตั้งค่า · ลบข้อมูล (เปิดดูเท่านั้น)"],
  ];

  test("all MINI App screens render with real numbers", async ({ page, loginAs, backend, snap }) => {
    await loginAs(USER_A);
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
    for (const [path, label] of SCREENS) {
      await test.step(`${label} (${path})`, async () => {
        await page.goto(path);
        // Next 16 keeps earlier screens mounted but hidden, so only the visible <main> counts.
        await expect(page.locator("main:visible").first()).toBeVisible();
        await expect(page.locator('main[aria-busy="true"]:visible')).toHaveCount(0, { timeout: 30_000 });
        await expect(page.locator("body")).not.toContainText(/\bNaN\b|Infinity|undefined/);
        await snap(label);
      });
    }
  });

  test("bottom tab bar reaches every section", async ({ page, loginAs, backend }) => {
    await loginAs(USER_A);
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
    await openHome(page);
    for (const [tab, url] of [
      ["แผนเงิน", /\/app\/plan$/],
      ["สิทธิพิเศษ", /\/app\/perks$/],
      ["ตั้งค่า", /\/app\/settings$/],
      ["สรุป", /\/app$/],
    ] as const) {
      await gotoTab(page, tab);
      await expect(page).toHaveURL(url);
      await expect(nav(page).getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    }
    // The raised ＋ จด button offers all three ways to record.
    await nav(page).getByRole("button", { name: "จด", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "จะจดอะไร" });
    for (const option of ["จดรายจ่าย", "จดรายรับ", "ลองก่อนจ่าย"]) {
      await expect(sheet.getByRole("link", { name: option, exact: true })).toBeVisible();
    }
    await sheet.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(sheet).toBeHidden();
  });
});

// =================================================================== Flow 1
test.describe("Flow 1 · Onboarding & cycle setup (TC-14, TC-26, TC-01 data)", () => {
  test("TC-01 data · new user: consent → 4-step setup → first daily budget 100 baht", async ({ page, loginAs, backend, snap }) => {
    await loginAs(USER_A, { consented: false });

    await test.step("first open asks for consent; start stays disabled until ticked", async () => {
      await page.goto("/app");
      await expect(page).toHaveURL(/\/app\/consent$/);
      const start = page.getByRole("button", { name: "ยอมรับและเริ่ม" });
      await expect(start).toBeDisabled();
      await page.getByRole("checkbox", { name: "ฉันเข้าใจและยินยอม" }).check();
      await expect(start).toBeEnabled();
      await snap("consent ticked");
      await start.click();
    });

    await test.step("step 1/4 · income: family money, monthly, payday on the 18th (7 days)", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/income$/);
      await page.getByRole("button", { name: "ทางบ้านส่งให้", exact: true }).click();
      await page.getByRole("button", { name: "รายเดือน", exact: true }).click();
      await page.getByRole("button", { name: "วันที่ 18", exact: true }).click();
      await expect(page.getByText("อีก 7 วัน")).toBeVisible();
      await snap("payday picked");
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
    });

    await test.step("step 2/4 · balance 1,000 + dorm bill 300", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await setupBalance(page, 1000, [{ title: "ค่าหอ", amount: 300 }]);
      await expect(page.getByTestId("bills-total")).toHaveText("300 บาท");
      await snap("balance and bill");
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
    });

    await test.step("step 3/4 + 4/4 · no savings, no buffer, skip essentials", async () => {
      await setupNoSavingsNoBuffer(page);
      await setupSkipEssentials(page);
    });

    await test.step("review: 700 unallocated ÷ 7 days = 100 baht/day", async () => {
      await expect(page.getByTestId("review-daily-budget")).toHaveText("100");
      await expect(page.getByText("อีก 7 วัน จนถึงวันเงินเข้า")).toBeVisible();
      await expect(page.getByTestId("review-bills-total")).toHaveText("−300 บาท");
      await snap("review 100 per day");
    });

    await test.step("start: one cycle created, signed with the LIFF ID token", async () => {
      await page.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }).click();
      await expect(page).toHaveURL(/\/app(\?toast=saved)?$/);
      await expect(page.getByRole("status").filter({ hasText: "บันทึกแผนแล้ว" })).toBeVisible();
      const created = backend.callsTo("POST", /^\/api\/cycle$/);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ user: "A", hasAuth: true, status: 200 });
      expect(created[0].body).toMatchObject({ balance: 100000, payday: "2026-11-18", bills: [{ title: "ค่าหอ", amount: 30000 }] });
    });

    await test.step("home shows the same numbers", async () => {
      await expandMath(page);
      await expectHero(page, { todayRemaining: "100", daily: "100", daysLeft: "7", balance: "1,000", reserved: "300" });
      await snap("home after setup");
    });
  });

  test("TC-14 · missing or invalid input is refused and nothing is saved", async ({ page, loginAs, backend, snap }) => {
    await loginAs(USER_A);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/setup\/income$/); // no cycle yet → setup

    await test.step("income: nothing picked", async () => {
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
      await expect(page.getByText("กรุณาเลือกแหล่งเงินและความถี่ที่เงินเข้า")).toBeVisible();
      await expect(page).toHaveURL(/\/app\/setup\/income$/);
    });

    await test.step("income: payday in the past, and payday = today", async () => {
      await page.getByRole("button", { name: "ทางบ้านส่งให้", exact: true }).click();
      await page.getByRole("button", { name: "ไม่แน่นอน", exact: true }).click();
      const date = page.getByLabel("กะว่าจะใช้ก้อนนี้ถึงวันที่เท่าไหร่");
      for (const bad of ["2026-11-01", "2026-11-11"]) {
        await date.fill(bad);
        await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
        await expect(page.getByText("กรุณาเลือกวันที่หลังวันนี้")).toBeVisible();
        await expect(page).toHaveURL(/\/app\/setup\/income$/);
      }
      await snap("past payday refused");
    });

    await test.step("income: monthly without a day", async () => {
      await page.getByRole("button", { name: "รายเดือน", exact: true }).click();
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
      await expect(page.getByText("กรุณาเลือกวันที่เงินเข้า")).toBeVisible();
      await page.getByRole("button", { name: "วันที่ 18", exact: true }).click();
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
    });

    await test.step("balance: empty, negative, not a number", async () => {
      const next = page.getByRole("button", { name: "ถัดไป", exact: true });
      const balance = page.getByLabel("เงินที่มีตอนนี้ (บาท)");
      for (const [value, message] of [
        ["", "กรุณากรอกจำนวนเงิน"],
        ["-500", "ใส่จำนวนเงินตั้งแต่ 0 ขึ้นไป"],
        ["abc", "ใส่เป็นตัวเลขเท่านั้น เช่น 400 หรือ 1,250.50"],
        ["100.555", "ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง"],
      ] as const) {
        await balance.fill(value);
        await next.click();
        await expect(page.getByText(message)).toBeVisible();
        await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      }
      await snap("negative balance refused");
    });

    await test.step("bill sheet: empty name and amount", async () => {
      await page.getByRole("button", { name: "+ เพิ่มบิล" }).click();
      const sheet = page.getByRole("dialog", { name: "เพิ่มบิล" });
      await sheet.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(sheet.getByText("กรุณาใส่ชื่อบิล")).toBeVisible();
      await expect(sheet.getByText("กรุณากรอกจำนวนเงิน")).toBeVisible();
      await sheet.getByLabel("ชื่อบิล").fill("ค่าหอ");
      await sheet.getByLabel("จำนวนเงิน (บาท)").fill("-400");
      await sheet.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(sheet.getByText("ใส่จำนวนเงินมากกว่า 0")).toBeVisible();
      await sheet.getByRole("button", { name: "ยกเลิก" }).click();
      await expect(page.getByTestId("bills-total")).toHaveText("0 บาท");
    });

    await test.step("review with an incomplete draft offers no start button", async () => {
      await page.goto("/app/setup/review");
      await expect(page.getByText(/ยังไม่ได้กรอก/)).toBeVisible();
      await expect(page.getByRole("button", { name: "กรอกข้อมูลที่ขาด" })).toBeVisible();
      await expect(page.getByRole("button", { name: /เริ่มใช้/ })).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/\bNaN\b|Infinity/);
      await snap("incomplete review");
    });

    expect(backend.callsTo("POST", /^\/api\/cycle$/), "no cycle may be created from invalid input").toHaveLength(0);
  });

  test("TC-26 · multi-bill form: 400 + 50 + 150 → 150/day, delete water bill → 154/day", async ({ page, loginAs, backend, snap }) => {
    await loginAs(USER_A);
    await page.goto("/app/setup/income");
    await setupIncomeMonthly(page, 23); // 12 days, counting today

    await test.step("2,400 baht and three bills via + เพิ่มบิล", async () => {
      await setupBalance(page, 2400, [
        { title: "ค่าหอ", amount: 400 },
        { title: "ค่าน้ำ", amount: 50 },
        { title: "ค่าไฟ", amount: 150 },
      ]);
      await expect(page.getByTestId("bills-total")).toHaveText("600 บาท");
      await snap("three bills");
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
      await setupNoSavingsNoBuffer(page);
      await setupSkipEssentials(page);
    });

    await test.step("review: 1,800 ÷ 12 = 150 baht/day (matches TC-05)", async () => {
      await expect(page.getByTestId("review-bills-total")).toHaveText("−600 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("150");
      await expect(page.getByText("อีก 12 วัน จนถึงวันเงินเข้า")).toBeVisible();
      await page.getByRole("button", { name: /หักบิล 3 รายการ/ }).click();
      for (const bill of ["ค่าหอ (ยังไม่จ่าย)", "ค่าน้ำ (ยังไม่จ่าย)", "ค่าไฟ (ยังไม่จ่าย)"]) await expect(page.getByText(bill)).toBeVisible();
      await snap("review 150 per day");
    });

    await test.step("go back, delete ค่าน้ำ: bills 550", async () => {
      await page.getByRole("button", { name: "กลับไปแก้ไข" }).click();
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await page.getByRole("button", { name: "แก้ไข ค่าน้ำ" }).click();
      await page.getByRole("dialog", { name: "แก้ไขบิล" }).getByRole("button", { name: "ลบบิลนี้" }).click();
      await expect(page.getByRole("button", { name: "แก้ไข ค่าน้ำ" })).toHaveCount(0);
      await expect(page.getByTestId("bills-total")).toHaveText("550 บาท");
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/setup\/savings$/);
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click(); // choices are kept in the draft
      await setupSkipEssentials(page);
    });

    await test.step("review recalculates: 1,850 ÷ 12 = 154.17 → 154 baht/day", async () => {
      await expect(page.getByTestId("review-bills-total")).toHaveText("−550 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("154");
      await snap("review 154 per day");
    });

    await test.step("start and confirm on home", async () => {
      await page.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expectHero(page, { daily: "154", daysLeft: "12", balance: "2,400", reserved: "550" });
      const plans = (await backend.as(USER_A).plans()).plans.map((p) => p.title);
      expect(plans.sort()).toEqual(["ค่าหอ", "ค่าไฟ"].sort());
    });
  });
});

// =================================================================== Flow 2
test.describe("Flow 2 · ลอง → กันไว้ → จ่ายจริง (TC-01, TC-02, TC-03, TC-22, TC-23)", () => {
  test.beforeEach(async ({ loginAs, backend }) => {
    await loginAs(USER_A);
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
  });

  test("TC-01 → TC-02 → TC-03 · the 3-state journey on the 1,000-baht demo", async ({ page, backend, snap }) => {
    await test.step("start: 1,000 real, 300 reserved, 100 baht/day", async () => {
      await openHome(page);
      await expectHero(page, { todayRemaining: "100", daily: "100", daysLeft: "7", balance: "1,000", reserved: "300" });
      await snap("demo start");
    });

    await test.step("TC-01 ลอง: try 140 baht → 80 baht/day projected, real money untouched", async () => {
      await openRecordChooser(page, "ลองก่อนจ่าย");
      await expect(page).toHaveURL(/\/app\/try$/);
      await tryItem(page, "เสื้อช็อป", 140);
      await expectBuyDaily(page, "เสื้อช็อป", "80");
      await expectSkipDaily(page, "100");
      await snap("simulate 140 → 80 per day");
      expect(backend.callsTo("POST", /^\/api\/(entries|plans)/), "a try must not write anything").toHaveLength(0);
      expect((await backend.as(USER_A).summary()).balance).toBe(100000);
    });

    await test.step("TC-02 กันไว้: keep it in the plan → reserved 440, real money still 1,000, 80 baht/day", async () => {
      await page.getByRole("button", { name: "เลือกวิธีจัดการรายการนี้" }).click();
      await expect(page).toHaveURL(/\/app\/try\/decide$/);
      await expect(page.getByRole("radio", { name: /เก็บไว้ในแผน/ })).toBeChecked();
      await snap("decide: keep in plan");
      await page.getByRole("button", { name: "เก็บไว้ในแผน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/try\/saved\?plan=/);
      await expect(page.getByRole("heading", { name: "บันทึกแล้ว" })).toBeVisible();
      await expect(page.getByText("งบต่อวันหลังกันเงินไว้ในแผน")).toBeVisible();
      await expect(page.locator("section").filter({ hasText: "งบต่อวันหลังกันเงินไว้ในแผน" })).toContainText("80");
      await page.getByRole("link", { name: "กลับหน้าสรุป" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expectHero(page, { daily: "80", balance: "1,000", reserved: "440" });
      await snap("reserved 440");
    });

    await test.step("TC-03 จ่ายจริง: pay it → real 860, reserved back to 300, still 80 baht/day", async () => {
      await gotoTab(page, "แผนเงิน");
      await page.getByRole("tab", { name: "รอจ่าย" }).click();
      const row = planRow(page, "เสื้อช็อป");
      await expect(row).toHaveAttribute("data-plan-status", "reserved");
      await row.getByRole("button", { name: "จ่ายแล้ว", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "จ่ายแล้ว ✓" })).toBeVisible();
      await expect(row).toHaveAttribute("data-plan-status", "paid");
      await snap("paid");
      await gotoTab(page, "สรุป");
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expectHero(page, { daily: "80", balance: "860", reserved: "300" });
      await expect(page.getByTestId("summary-balance-line")).toContainText("คงเหลือจริง 860 บาท");
      await snap("real 860, reserved 300");
    });

    await test.step("no double deduction: exactly one 140-baht entry, from the plan", async () => {
      const { entries } = await backend.as(USER_A).entries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ amount: 14000, source: "plan", note: "เสื้อช็อป" });
    });
  });

  test("TC-22 · tries never add up: 140 → 250 → don't buy returns to 100/day with nothing saved", async ({ page, backend, snap }) => {
    await page.goto("/app/try");
    await tryItem(page, "หูฟัง", 140);
    await expectBuyDaily(page, "หูฟัง", "80");

    await page.getByRole("link", { name: "ย้อนกลับ" }).click();
    await expect(page).toHaveURL(/\/app\/try$/);
    await tryItem(page, "หูฟัง", 250);
    // 700 − 250 = 450 ÷ 7 = 64.28 → 64.25 (not 700 − 140 − 250)
    await expectBuyDaily(page, "หูฟัง", "64.25");
    await expectSkipDaily(page, "100");
    await snap("second try 250 → 64.25");

    await skipCard(page).click();
    await expect(skipCard(page)).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "ไม่ซื้อ · กลับหน้าสรุป" }).click();
    await expect(page.getByTestId("today-hero")).toBeVisible();
    await expandMath(page);
    await expectHero(page, { daily: "100", balance: "1,000", reserved: "300" });
    await snap("back to 100 per day");

    // Each try is computed from the live base with only its own price (dev StrictMode may repeat a call).
    const triedAmounts = new Set(backend.callsTo("POST", /^\/api\/simulate$/).map((c) => (c.body as { amount: number }).amount));
    expect([...triedAmounts].sort()).toEqual([14000, 25000]);
    expect(backend.callsTo("POST", /^\/api\/(entries|plans)/)).toHaveLength(0);
    expect((await backend.as(USER_A).plans()).plans.map((p) => p.title)).toEqual(["ค่าหอ"]);
    expect((await backend.as(USER_A).entries()).entries).toHaveLength(0);
  });

  test("TC-23 · a try beyond the money shows 'ขาดอีก 100 บาท', never a positive daily budget", async ({ page, backend, snap }) => {
    await page.goto("/app/try");
    await tryItem(page, "โทรศัพท์มือสอง", 800);
    await expect(page.getByText("เงินไม่พอหักบิลและรายการนี้ ขาดอีก 100 บาท")).toBeVisible();
    await expect(buyCard(page, "โทรศัพท์มือสอง")).toContainText("ขาดอีก 100 บาท");
    await expect(buyCard(page, "โทรศัพท์มือสอง")).not.toContainText("บาท/วัน");
    await snap("try 800 → short 100");
    expect((await backend.as(USER_A).summary()).balance).toBe(100000);
  });
});

// =================================================================== Flow 3
test.describe("Flow 3 · Expenses: double-submit, edit, delete, balance adjust (TC-17, TC-11, TC-12, TC-13)", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(USER_A);
  });

  test("TC-17 · triple-tap 'บันทึก' on a 1.5 s network: button locks, one entry, 1,000 → 950", async ({ page, backend, snap }) => {
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
    backend.delay("POST", /^\/api\/entries$/, 1500);

    await openHome(page);
    await openRecordChooser(page, "จดรายจ่าย");
    await recordExpense(page, 50, "ข้าวมันไก่");
    const save = page.getByRole("button", { name: "บันทึก", exact: true });
    await expect(save).toBeEnabled();

    // Three taps in the same frame: faster than any re-render could disable the button.
    await save.evaluate((el) => {
      const b = el as HTMLButtonElement;
      b.click();
      b.click();
      b.click();
    });
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await snap("button locked while saving");

    await expect(page).toHaveURL(/\/app\/record\/done\?mode=normal$/);
    await expect(page.getByRole("heading", { name: "บันทึกรายการแล้ว ✓" })).toBeVisible();
    await snap("saved once");

    const posts = backend.callsTo("POST", /^\/api\/entries$/);
    expect(posts, "only one create request may reach the server").toHaveLength(1);
    expect(posts[0].idempotencyKey, "create carries an Idempotency-Key").toBeTruthy();
    expect((await backend.as(USER_A).entries()).entries).toHaveLength(1);

    await openHome(page);
    await expectHero(page, { balance: "950", todayRemaining: "50", daily: "100" });
  });

  test("edit an expense up and down, then delete it: balance follows every change", async ({ page, backend, snap }) => {
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
    await page.goto("/app/record/new");
    await recordExpense(page, 45, "ข้าวเช้า");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/record\/done/);

    await test.step("recorded 45 → balance 955", async () => {
      await openHome(page);
      await expectHero(page, { balance: "955", todayRemaining: "55" });
    });

    const openEntry = async () => {
      await page.goto("/app/plan?tab=list");
      await page.getByRole("link", { name: /ข้าวเช้า/ }).click();
      await expect(page).toHaveURL(/\/app\/record\/[^/]+$/);
      await expect(page.getByLabel("จำนวนเงิน (บาท)")).not.toHaveValue("");
    };

    for (const [amount, balance, remaining] of [
      ["60", "940", "40"],
      ["30", "970", "70"],
    ] as const) {
      await test.step(`edit to ${amount} → balance ${balance}`, async () => {
        await openEntry();
        await page.getByLabel("จำนวนเงิน (บาท)").fill(amount);
        await snap(`edit to ${amount}`);
        await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
        await expect(page).toHaveURL(/\/app\/plan\?tab=list$/);
        await expect(page.getByRole("link", { name: /ข้าวเช้า/ })).toContainText(`−${amount} บาท`);
        await openHome(page);
        await expectHero(page, { balance, todayRemaining: remaining });
      });
    }

    await test.step("delete → balance back to 1,000", async () => {
      await openEntry();
      await page.getByRole("button", { name: "ลบรายการนี้" }).click();
      const sheet = page.getByRole("dialog", { name: "ยืนยันลบรายการนี้ไหม" });
      await expect(sheet).toContainText("ข้าวเช้า");
      await snap("confirm delete");
      await sheet.getByRole("button", { name: "ยืนยันลบรายการ" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=list$/);
      await expect(page.getByText("ยังไม่มีรายการในหมวดนี้")).toBeVisible();
      await openHome(page);
      await expectHero(page, { balance: "1,000", todayRemaining: "100" });
    });

    expect(backend.callsTo("PATCH", /^\/api\/entries\//)).toHaveLength(2);
    expect(backend.callsTo("DELETE", /^\/api\/entries\//)).toHaveLength(1);
  });

  for (const tc of [
    { id: "TC-11", paid: 150, balance: "450", spent: "150", note: "more than" },
    { id: "TC-12", paid: 50, balance: "550", spent: "50", note: "less than" },
  ]) {
    test(`${tc.id} · paid ${tc.note} the 100 baht reserved: money and reservation stay exact`, async ({ page, backend, snap }) => {
      // 600 real, 100 reserved for transport, 5 days → 100/day
      await backend.seedCycle(USER_A, { balance: 600, paydayInDays: 5, reservedItems: [{ title: "ค่าเดินทาง", amount: 100 }], essentialsPerDay: 0 });
      await openHome(page);
      await expectHero(page, { daily: "100", balance: "600", reserved: "100" });

      await test.step(`record the real ${tc.paid} baht; the app offers to link the reserved item`, async () => {
        await page.goto("/app/record/new");
        await recordExpense(page, tc.paid, "ค่าเดินทาง");
        await page.getByRole("button", { name: "บันทึก", exact: true }).click();
        await expect(page).toHaveURL(/\/app\/record\/link$/);
        await page.getByRole("radio", { name: /ผูกกับ "ค่าเดินทาง"/ }).check();
        // Linking pays the plan's own amount, so the app warns when the amounts differ.
        await expect(page.getByText(`ยอดที่คุณจด ${tc.paid} บาท ไม่ตรงกับรายการในแผน 100 บาท`)).toBeVisible();
        await snap("amount mismatch warning");
      });

      await test.step("record it as its own expense and release the reservation", async () => {
        await page.getByRole("radio", { name: /ไม่ผูก/ }).check();
        await page.getByRole("button", { name: "บันทึกเป็นรายจ่ายใหม่" }).click();
        await expect(page).toHaveURL(/\/app\/record\/done\?mode=unlinked$/);
        await page.goto("/app/plan?tab=pending");
        const row = planRow(page, "ค่าเดินทาง");
        await row.getByRole("button", { name: "แก้แผน ค่าเดินทาง" }).click();
        await row.getByRole("button", { name: "ยกเลิก", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: "ยกเลิกรายการในแผนแล้ว" })).toBeVisible();
      });

      await test.step(`real money ${tc.balance}, reserved 0, today's spend ${tc.spent}`, async () => {
        await openHome(page);
        await expectHero(page, { balance: tc.balance, reserved: "0", spentToday: tc.spent });
        await snap("after");
      });
    });
  }

  test("TC-13 · adjust balance to the real 850: 700 → 550 unallocated, 100 → 78.50/day", async ({ page, backend, snap }) => {
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
    await openHome(page);
    await expectHero(page, { daily: "100", balance: "1,000" });
    await page.getByRole("link", { name: "ปรับยอด ›" }).click();
    await expect(page).toHaveURL(/\/app\/balance\/adjust$/);
    await expect(page.getByText("ยอดในพอใช้ตอนนี้:")).toContainText("1,000 บาท");
    await page.getByLabel("เงินจริงที่มีตอนนี้ (บาท)").fill("850");
    await snap("adjust to 850");
    await page.getByRole("button", { name: "ปรับยอด", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/balance\/done$/);
    await snap("adjusted");

    await openHome(page);
    await expectHero(page, { daily: "78.50", balance: "850", reserved: "300" });
    await expect(page.getByText(/อัปเดตยอดล่าสุด .+ น\./)).toBeVisible();
    expect(backend.callsTo("POST", /^\/api\/cycle\/balance$/)).toHaveLength(1);
  });
});

// =================================================================== Flow 4
test.describe("Flow 4 · Savings %, goals, daily points & rewards (NF-01..06, P-21, P-23)", () => {
  test("NF-01 · save 10% of 1,000 at setup → 100 set aside, 600 ÷ 7 = 85.50/day", async ({ page, loginAs, snap }) => {
    await loginAs(USER_A);
    await page.goto("/app/setup/income");
    await setupIncomeMonthly(page, 18);
    await setupBalance(page, 1000, [{ title: "ค่าหอ", amount: 300 }]);
    await page.getByRole("button", { name: "ถัดไป", exact: true }).click();

    await test.step("savings: invalid custom amount is refused, then pick 10%", async () => {
      await page.getByRole("button", { name: "กำหนดเอง" }).first().click();
      await page.getByLabel("จำนวนเงินออม (บาท)").fill("-5");
      await expect(page.getByText(/ใส่จำนวนเงิน|ใส่เป็นตัวเลข/)).toBeVisible();
      await page.getByRole("button", { name: "10% (100 บาท)" }).click();
      await expect(page.getByRole("button", { name: "10% (100 บาท)" })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "ไม่กัน", exact: true }).click();
      await snap("savings 10%");
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
      await setupSkipEssentials(page);
    });

    await test.step("review and home: 85.50/day, savings 100", async () => {
      await expect(page.getByTestId("review-savings")).toHaveText("−100 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("85.50");
      await snap("review 85.50");
      await page.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expectHero(page, { daily: "85.50", balance: "1,000", reserved: "300", savings: "100" });
      await page.getByRole("link", { name: "ดูเงินออม · เงินเผื่อ" }).click();
      await expect(page.getByText("เป้าออมรอบนี้").locator("..")).toContainText("100 บาท");
      await snap("savings tab");
    });
  });

  test.fixme("NF-04..06 · wishlist goal (target item + date → saving per day)", async () => {
    // Not built in the app yet: no goal screen, route or API exists, and rule R11 (does a goal come out of
    // the daily budget or a separate pot?) is still "รอตกลง" in the test-case file. Enable when it ships.
  });

  test("P-21 · daily check-in gives +1 once; P-23 · redeem a reward, then 'not enough points'", async ({ page, loginAs, backend, snap }) => {
    await loginAs(USER_A);
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
    await openHome(page);
    await expect(page.getByTestId("summary-points")).toHaveText("11 แต้ม");
    await page.getByRole("link", { name: "ดูแต้มและแลกของรางวัล ›" }).click();
    await expect(page).toHaveURL(/\/app\/points$/);
    await expect(page.getByTestId("points-balance")).toHaveText("11");

    await test.step("check in (รับแต้มฟรี): 11 → 12, button becomes 'received today'", async () => {
      await page.getByRole("button", { name: "รับแต้มฟรี", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "อัปเดตแต้มแล้ว · รวม 12 แต้ม" })).toBeVisible();
      await expect(page.getByTestId("points-balance")).toHaveText("12");
      await expect(page.getByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeVisible();
      await expect(page.getByRole("button", { name: "รับแต้มฟรี", exact: true })).toHaveCount(0);
      await snap("checked in");
      // A replayed claim (another tab, a retry) must not add a second point today.
      const again = await apiAs(page, USER_A.idToken, "POST", "/api/points/claim", undefined, { "Idempotency-Key": "replay" });
      expect(JSON.parse(again.text)).toMatchObject({ balance: 12, claimedToday: true });
    });

    const sticker = page.getByTestId("reward-reward-sticker");

    await test.step("redeem the sticker (10 points, 5 in stock): points 12 → 2, stock 5 → 4, pickup code shown", async () => {
      await expect(sticker).toContainText("เหลือ 5 ชิ้น");
      await sticker.getByRole("button", { name: "10 แต้ม" }).click();
      await expect(page.getByRole("heading", { name: "แลกสำเร็จ" })).toBeVisible();
      await expect(page.locator("dd").filter({ hasText: "2 แต้ม" })).toBeVisible();
      await expect(page.getByText(/^RW-[0-9A-Z]{4}$/)).toBeVisible();
      await snap("redeemed");
      await page.getByRole("button", { name: "กลับหน้าแต้ม" }).click();
      await expect(page.getByTestId("points-balance")).toHaveText("2");
      await expect(sticker).toContainText("เหลือ 4 ชิ้น");
    });

    await test.step("redeem again with 2 points: refused, nothing deducted", async () => {
      await sticker.getByRole("button", { name: "10 แต้ม" }).click();
      await expect(page.getByText("แต้มไม่พอ")).toBeVisible();
      await expect(page.getByTestId("points-balance")).toHaveText("2");
      await expect(sticker).toContainText("เหลือ 4 ชิ้น");
      await snap("not enough points");
      const rewards = await backend.as(USER_A).rewards();
      expect(rewards.find((r) => r.id === "reward-sticker")?.stock).toBe(4);
      expect((await backend.as(USER_A).points()).balance).toBe(2);
    });

    await test.step("history lists the +1 and the −10", async () => {
      await page.getByRole("link", { name: "ดูประวัติแต้ม ›" }).click();
      await expect(page).toHaveURL(/\/app\/points\/history$/);
      await expect(page.getByText("+1 แต้ม", { exact: true })).toBeVisible();
      await expect(page.getByText("−10 แต้ม", { exact: true })).toBeVisible();
      await snap("points history");
    });
  });
});

// =================================================================== Flow 5
test.describe("Flow 5 · Edge cases, security & privacy (TC-06, TC-07, TC-19, TC-20)", () => {
  test("TC-06 · bills above the money: setup and home show 'ขาด 100 บาท', never a positive daily budget", async ({ page, loginAs, backend, snap }) => {
    await loginAs(USER_A);

    await test.step("setup review with 500 baht and a 600-baht bill (5 days)", async () => {
      await page.goto("/app/setup/income");
      await setupIncomeMonthly(page, 16);
      await setupBalance(page, 500, [{ title: "ค่าหอ", amount: 600 }]);
      await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
      await setupNoSavingsNoBuffer(page);
      await setupSkipEssentials(page);
      await expect(page.getByTestId("review-shortfall")).toHaveText("ยังขาดอีก 100 บาท");
      await expect(page.getByText("เงินที่มียังไม่ครอบคลุมบิลก่อนวันเงินเข้า")).toBeVisible();
      await expect(page.getByTestId("review-daily-budget")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "แก้ตัวเลข" })).toBeVisible();
      await snap("setup shortfall");
      expect(backend.callsTo("POST", /^\/api\/cycle$/)).toHaveLength(0);
    });

    await test.step("an existing cycle in deficit: home shows the shortfall, the bill is not shrunk", async () => {
      await backend.seedCycle(USER_A, { balance: 500, paydayInDays: 5, bills: [{ title: "ค่าหอ", amount: 600 }] });
      await page.goto("/app");
      await expect(page.getByTestId("today-hero")).toHaveAttribute("data-budget-kind", "shortfall");
      await expect(page.getByText("เงินที่มีไม่พอหักบิลและเงินที่กันไว้ ขาดอีก 100 บาท")).toBeVisible();
      await expect(page.getByTestId("hero-shortfall")).toHaveText("100");
      await expect(page.getByTestId("hero-budget-line")).toHaveCount(0);
      await expandMath(page);
      await expectHero(page, { balance: "500", reserved: "600" });
      await snap("home shortfall");
    });
  });

  test("TC-07 · payday is today: no division by zero, the app asks to start a new cycle", async ({ page, loginAs, backend, snap }) => {
    await loginAs(USER_A);
    await backend.seedCycle(USER_A, { balance: 600, paydayInDays: 0, essentialsPerDay: 0 });
    await page.goto("/app");
    await expect(page.getByTestId("today-hero")).toHaveAttribute("data-budget-kind", "payday-passed");
    await expect(page.getByText("ถึงวันเงินเข้าแล้ว เริ่มตั้งรอบใหม่เพื่อคำนวณงบต่อได้เลย")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/\bNaN\b|Infinity/);
    await snap("payday today");

    await page.getByRole("link", { name: "เริ่มรอบใหม่", exact: true }).first().click();
    await expect(page).toHaveURL(/\/app\/cycle\/new$/);
    await expect(page.getByRole("heading", { name: "ถึงวันเงินเข้าแล้ว เริ่มรอบใหม่กันเลย" })).toBeVisible();
    await snap("new cycle prompt");

    await page.goto("/app/try");
    await tryItem(page, "ของกิน", 50);
    await expect(page.getByText("ถึงวันเงินเข้าแล้ว ยังลองคำนวณไม่ได้ ถ้าเงินเข้าแล้วให้ตั้งรอบเงินใหม่ก่อน")).toBeVisible();
    await expect(page.getByText("บาท/วัน")).toHaveCount(0);
  });

  test("TC-19 · data isolation: User A's token can never read or change User B's money", async ({ page, loginAs, backend, request, baseURL, snap }) => {
    await loginAs(USER_A);
    await backend.seedCycle(USER_A, { ...DEMO, essentialsPerDay: 0 });
    backend.register(USER_B);
    await backend.seedCycle(USER_B, { balance: 5555, paydayInDays: 10, bills: [{ title: "ค่าเทอม B", amount: 1234 }], essentialsPerDay: 0 });
    const bEntry = (await backend.as(USER_B).addEntry({ amount: 7777, category: "food", note: "รายการลับของ B" }, "b-1")).entry;
    const bPlan = (await backend.as(USER_B).plans()).plans[0];
    const bBefore = JSON.stringify([await backend.as(USER_B).summary(), await backend.as(USER_B).entries(), await backend.as(USER_B).plans()]);

    await openHome(page);
    await expectHero(page, { balance: "1,000" });

    const leaksB = (text: string) => /555500|5,555|7777|77\.77|รายการลับของ B|ค่าเทอม B/.test(text) || text.includes(bEntry.id) || text.includes(USER_B.lineUserId);

    await test.step("reads with A's token return only A's data, whatever user id is passed", async () => {
      for (const path of ["/api/summary", `/api/summary?userId=${USER_B.lineUserId}`, "/api/entries", "/api/plans", "/api/points/history"]) {
        const res = await apiAs(page, USER_A.idToken, "GET", path, undefined, { "X-User-Id": USER_B.lineUserId });
        expect(res.status, path).toBe(200);
        expect(leaksB(res.text), `${path} must not contain User B's data`).toBe(false);
      }
    });

    await test.step("writes on B's records with A's token are refused (not found for A)", async () => {
      const attempts = [
        ["PATCH", `/api/entries/${bEntry.id}`, { amount: 1 }],
        ["DELETE", `/api/entries/${bEntry.id}`, undefined],
        ["POST", `/api/plans/${bPlan.id}/pay`, {}],
        ["POST", `/api/plans/${bPlan.id}/cancel`, undefined],
      ] as const;
      for (const [method, path, body] of attempts) {
        const res = await apiAs(page, USER_A.idToken, method, path, body);
        expect([403, 404], `${method} ${path}`).toContain(res.status);
        expect(leaksB(res.text)).toBe(false);
      }
      // "Change B's balance" with A's token can only ever touch A's own account.
      const adjust = await apiAs(page, USER_A.idToken, "POST", `/api/cycle/balance?userId=${USER_B.lineUserId}`, { balance: 99900, userId: USER_B.lineUserId });
      expect(adjust.status).toBe(200);
      expect((await backend.as(USER_A).summary()).balance).toBe(99900);
    });

    await test.step("no token, or a forged token, is 401", async () => {
      expect((await apiAs(page, null, "GET", "/api/summary")).status).toBe(401);
      expect((await apiAs(page, `${USER_A.idToken}x`, "GET", "/api/summary")).status).toBe(401);
      const forgedB = USER_B.idToken.split(".").slice(0, 2).concat("Zm9yZ2Vk").join(".");
      expect((await apiAs(page, forgedB, "GET", "/api/summary")).status).toBe(401);
    });

    await test.step("User B's data is byte-for-byte unchanged", async () => {
      const bAfter = JSON.stringify([await backend.as(USER_B).summary(), await backend.as(USER_B).entries(), await backend.as(USER_B).plans()]);
      expect(bAfter).toBe(bBefore);
    });

    await test.step("switching the LIFF login to User B shows B's own numbers", async () => {
      await loginAs(USER_B);
      await page.reload();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expectHero(page, { balance: "5,477.23", reserved: "1,234" });
      await snap("logged in as B");
      const lastSummary = backend.callsTo("GET", /^\/api\/summary$/).at(-1);
      expect(lastSummary?.user).toBe("B");
    });

    await test.step("real Next.js API routes (no harness): no token / forged token never get data", async () => {
      const noToken = await request.get(`${baseURL}/api/summary`);
      expect(noToken.status()).toBe(401);
      expect(await noToken.json()).toMatchObject({ error: { code: "unauthorized" } });
      // The real server sends the token to LINE to verify; offline it answers 503. Never 200.
      const forged = await request.get(`${baseURL}/api/summary`, { headers: { Authorization: `Bearer ${USER_A.idToken}` } });
      expect([401, 503]).toContain(forged.status());
      expect(await forged.text()).not.toMatch(/"balance"/);
    });
  });

  test("TC-20 · privacy: no user id, token, amount or item name in any URL; Clarity gets nothing personal", async ({ page, loginAs, backend, outbound, snap }) => {
    // Distinctive values so any leak is unmistakable.
    const ITEM = "PIIcanaryItem";
    const NOTE = "PIIcanaryNote";
    await loginAs(USER_A);
    await backend.seedCycle(USER_A, { balance: 3456.78, paydayInDays: 7, bills: [{ title: "PIIcanaryBill", amount: 321.09 }], essentialsPerDay: 0 });

    await test.step("walk the money screens: home, try, keep in plan, record, plans, points", async () => {
      await openHome(page);
      await page.goto("/app/try");
      await tryItem(page, ITEM, 481.23);
      await page.getByRole("button", { name: "เลือกวิธีจัดการรายการนี้" }).click();
      await page.getByRole("button", { name: "เก็บไว้ในแผน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/try\/saved/);
      await page.goto("/app/record/new");
      await recordExpense(page, 62.47, NOTE);
      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/record\/(link|done)/);
      if (page.url().includes("/record/link")) await page.getByRole("button", { name: "บันทึกเป็นรายจ่ายใหม่" }).click();
      await expect(page).toHaveURL(/\/app\/record\/done/);
      await page.goto("/app/plan?tab=pending");
      await page.goto("/app/points");
      // Recording today's expense already earned today's point, so the claim button is replaced.
      await expect(page.getByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeVisible();
      await openHome(page);
      await snap("journey done");
    });

    const SECRETS = [
      USER_A.lineUserId,
      USER_A.displayName,
      USER_A.idToken,
      USER_A.accessToken,
      ITEM,
      NOTE,
      "PIIcanaryBill",
      "3456.78",
      "3,456.78",
      "345678",
      "481.23",
      "48123",
      "62.47",
      "6247",
      "321.09",
      "32109",
    ];

    await test.step("no secret appears in any request URL (path or query), any host", async () => {
      const leaks = outbound
        .filter((r) => !new URL(r.url).pathname.startsWith("/_next/static/")) // build-hashed file names
        .map((r) => {
          let url = r.url;
          try {
            url = decodeURIComponent(r.url);
          } catch {
            // keep raw
          }
          return { url, hit: SECRETS.filter((s) => url.includes(s)) };
        })
        .filter((x) => x.hit.length > 0);
      expect(leaks).toEqual([]);
      expect(outbound.length).toBeGreaterThan(20);
    });

    await test.step("the LINE ID token is only ever sent to our own /api, as a header", async () => {
      for (const r of outbound) {
        const auth = r.headers["authorization"];
        if (auth) {
          const u = new URL(r.url);
          expect(["localhost", "127.0.0.1"]).toContain(u.hostname);
          expect(u.pathname.startsWith("/api/")).toBe(true);
        }
      }
      const external = outbound.filter((r) => !["localhost", "127.0.0.1"].includes(new URL(r.url).hostname));
      for (const r of external) {
        const sent = `${r.url} ${r.postData ?? ""} ${JSON.stringify(r.headers)}`;
        expect(SECRETS.filter((s) => sent.includes(s)), r.url).toEqual([]);
      }
    });

    await test.step("Clarity: loaded only after consent, tag URL carries just the project id, only consent calls", async () => {
      const tags = outbound.filter((r) => r.url.includes("clarity.ms/tag/"));
      expect(tags.length, "Clarity tag requested (consented, LIFF ready)").toBeGreaterThan(0);
      for (const t of tags) expect(t.url).toBe("https://www.clarity.ms/tag/e2eclarity01");
      const calls = await page.evaluate(() => (window as unknown as { __clarityCalls?: unknown[][] }).__clarityCalls ?? []);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(["consentv2", "consent"]).toContain(c[0]);
      expect(JSON.stringify(calls)).not.toMatch(new RegExp(SECRETS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")));
    });

    await test.step("every money figure and name on screen sits inside a Clarity-masked element", async () => {
      await openHome(page);
      const unmasked = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent?.trim() ?? "";
          if (!/\d/.test(text) && !/PIIcanary/.test(text)) continue;
          const el = n.parentElement;
          if (!el || el.closest("script,style,nextjs-portal")) continue;
          if (!el.closest('[data-clarity-mask="true"]')) out.push(text);
        }
        return out;
      });
      expect(unmasked).toEqual([]);
    });
  });
});

// Keep the type import used (documentation for readers extending the suite).
export type { E2EUser };
