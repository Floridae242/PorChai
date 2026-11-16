/**
 * Por-Chai (พอใช้) · live PM demo: ONE continuous first-time-user journey through the whole MINI App.
 *
 *   npm run demo:pm
 *
 * One command starts the dev server (playwright.config.ts → webServer), opens one visible phone-sized
 * window (project "chromium": headed, slowMo 600 ms) and walks a brand-new user from first launch to the
 * last feature in a single browser session, never closing the window between stages. A small caption at
 * the top of the screen tells the audience which stage is running.
 *
 * Same harness as the full-system suite (tests/e2e/helpers/liff-mock.ts): LINE is replaced by an injected
 * window.liff, every /api/* call is answered per user by the app's own calculation code, nothing leaves the
 * machine, and the clock is fixed at 2026-11-11 10:00 Asia/Bangkok so the numbers are the same every run.
 *
 * Real routes (the brief named some differently):
 *   onboarding /app/consent → /app/setup/{income,balance,savings,essentials,review}
 *   simulate   /app/try → /app/try/result → /app/try/decide → /app/try/saved
 *   expenses   /app/record/new → /app/record/done, edit /app/record/[id], history /app/plan?tab=list
 *   balance    /app/balance/adjust        points /app/points, /app/points/history       perks /app/perks
 *
 * Not in the app, so not demonstrated: wishlist goals (NF-04..06 has no screen, route or API yet; the
 * savings target is shown instead). The daily check-in is the "รับแต้มฟรี" button (เช็กครบแล้ว is the
 * LINE chat command). Paying or recording anything also earns today's point automatically, so the
 * check-in tap happens during the dashboard tour, before the first payment.
 */
import type { Page } from "@playwright/test";
import { expandMath, expect, expectHero, makeUser, test } from "./helpers/liff-mock";

const NEW_USER = makeUser("A", "U_new_user_demo", "ผู้ใช้ใหม่ (เดโม)");

// ---------------------------------------------------------------- presentation helpers

/**
 * Caption pill at the top of the phone screen. It ignores clicks (never blocks a tap) and lives in a
 * closed shadow root, so no getByText / toContainText assertion can ever match the caption itself.
 */
async function caption(page: Page, text: string) {
  await page.evaluate((t) => {
    const w = window as unknown as { __pmCaption?: HTMLElement };
    if (!w.__pmCaption || !w.__pmCaption.isConnected) {
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText = "position:fixed;top:6px;left:0;right:0;z-index:2147483647;pointer-events:none;display:flex;justify-content:center";
      const root = host.attachShadow({ mode: "closed" });
      const pill = document.createElement("div");
      pill.style.cssText =
        "max-width:92vw;padding:4px 12px;border-radius:999px;background:rgba(17,24,39,.82);color:#fff;" +
        "font:600 12px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)";
      root.appendChild(pill);
      document.body.appendChild(host);
      w.__pmCaption = pill;
    }
    w.__pmCaption.textContent = t;
  }, text);
}

/** A beat for the audience to read the screen (only when the demo runs slowed down). */
async function pause(page: Page, ms = 1200) {
  if (Number(process.env.DEMO_SLOWMO ?? 600) > 0) await page.waitForTimeout(ms);
}

// ---------------------------------------------------------------- app helpers

const nav = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });
const next = (page: Page) => page.getByRole("button", { name: "ถัดไป", exact: true });

async function gotoTab(page: Page, name: "สรุป" | "แผนเงิน" | "สิทธิพิเศษ" | "ตั้งค่า") {
  await nav(page).getByRole("link", { name, exact: true }).click();
}

async function home(page: Page) {
  await gotoTab(page, "สรุป");
  await expect(page).toHaveURL(/\/app(\?.*)?$/);
  await expect(page.getByTestId("today-hero")).toBeVisible();
  await expandMath(page);
}

async function openRecordChooser(page: Page, option: "จดรายจ่าย" | "จดรายรับ" | "ลองก่อนจ่าย") {
  await nav(page).getByRole("button", { name: "จด", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "จะจดอะไร" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: option, exact: true }).click();
}

async function addBill(page: Page, title: string, amount: number) {
  await page.getByRole("button", { name: "+ เพิ่มบิล" }).click();
  const sheet = page.getByRole("dialog", { name: "เพิ่มบิล" });
  await sheet.getByLabel("ชื่อบิล").pressSequentially(title);
  await sheet.getByLabel("จำนวนเงิน (บาท)").pressSequentially(String(amount));
  await sheet.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function tryItem(page: Page, title: string, price: number) {
  await page.getByLabel("ชื่อของที่จะซื้อ (ไม่บังคับ)").filter({ visible: true }).pressSequentially(title);
  await page.getByLabel("ราคา (บาท)").filter({ visible: true }).pressSequentially(String(price));
  await page.getByRole("button", { name: "ดูผลกระทบต่องบ" }).click();
  await expect(page).toHaveURL(/\/app\/try\/result$/);
}

const buyCard = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^ถ้าซื้อ ${title}`) });
const skipCard = (page: Page) => page.getByRole("button", { name: /^ถ้ายังไม่ซื้อ/ });
const planRow = (page: Page, title: string) => page.getByTestId("plan-row").filter({ hasText: title });

async function recordExpense(page: Page, amount: number, note: string) {
  await expect(page).toHaveURL(/\/app\/record\/new/);
  await page.getByLabel("จำนวนเงิน (บาท)").filter({ visible: true }).pressSequentially(String(amount));
  await page.getByLabel("ชื่อรายการ").filter({ visible: true }).pressSequentially(note);
}

async function openEntryFromHistory(page: Page, note: string) {
  await page.goto("/app/plan?tab=list");
  await page.getByRole("link", { name: new RegExp(note) }).click();
  await expect(page).toHaveURL(/\/app\/record\/[^/?]+$/);
  await expect(page.getByLabel("จำนวนเงิน (บาท)").filter({ visible: true })).not.toHaveValue("");
}

// ================================================================== the journey

test("Complete First-Time User Journey & All Features Demo", async ({ page, loginAs, backend, snap }) => {
  const me = () => backend.as(NEW_USER);
  await loginAs(NEW_USER, { consented: false });

  // ---------------------------------------------------------------- 1
  await test.step("1 · First launch & onboarding setup", async () => {
    await test.step("first open: consent screen, start stays locked until ticked", async () => {
      await page.goto("/app");
      await expect(page).toHaveURL(/\/app\/consent$/);
      await caption(page, "1 · เปิดแอปครั้งแรก: ขอความยินยอม");
      const start = page.getByRole("button", { name: "ยอมรับและเริ่ม" });
      await expect(start).toBeDisabled();
      await pause(page);
      await page.getByRole("checkbox", { name: "ฉันเข้าใจและยินยอม" }).check();
      await expect(start).toBeEnabled();
      await start.click();
    });

    await test.step("1/4 income: empty → error, then family money, monthly, the 23rd (12 days)", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/income$/);
      await caption(page, "1 · ตั้งค่า 1/4 · กดถัดไปตอนยังไม่กรอก → ต้องเตือน");
      await next(page).click();
      await expect(page.getByText("กรุณาเลือกแหล่งเงินและความถี่ที่เงินเข้า")).toBeVisible();
      await pause(page);
      await caption(page, "1 · ตั้งค่า 1/4 · วันเงินเข้า: อีก 12 วัน");
      await page.getByRole("button", { name: "ทางบ้านส่งให้", exact: true }).click();
      await page.getByRole("button", { name: "รายเดือน", exact: true }).click();
      await page.getByRole("button", { name: "วันที่ 23", exact: true }).click();
      await expect(page.getByText("อีก 12 วัน")).toBeVisible();
      await pause(page);
      await next(page).click();
    });

    await test.step("2/4 balance: empty and negative refused, then 2,400 + bills 400 / 50 / 150", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await caption(page, "1 · ตั้งค่า 2/4 · ลองยอดเงินว่าง / ติดลบ → ต้องเตือน");
      await next(page).click();
      await expect(page.getByText("กรุณากรอกจำนวนเงิน")).toBeVisible();
      const balance = page.getByLabel("เงินที่มีตอนนี้ (บาท)").filter({ visible: true });
      await balance.pressSequentially("-500");
      await next(page).click();
      await expect(page.getByText("ใส่จำนวนเงินตั้งแต่ 0 ขึ้นไป")).toBeVisible();
      await pause(page);
      await caption(page, "1 · ตั้งค่า 2/4 · เงินที่มี 2,400 บาท + บิล 3 รายการ");
      await balance.fill("");
      await balance.pressSequentially("2400");
      await addBill(page, "ค่าหอ", 400);
      await addBill(page, "ค่าน้ำ", 50);
      await addBill(page, "ค่าไฟ", 150);
      await expect(page.getByTestId("bills-total")).toHaveText("600 บาท");
      await snap("three bills, 600");
      await pause(page);
      await next(page).click();
    });

    await test.step("3/4 savings: empty → error, then none for now", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/savings$/);
      await caption(page, "1 · ตั้งค่า 3/4 · ยังไม่เลือก → ต้องเตือน");
      await next(page).click();
      await expect(page.getByText(/กรุณาเลือกเป้าออมและเงินเผื่อ/)).toBeVisible();
      await pause(page);
      await page.getByRole("button", { name: "ยังไม่ตั้ง", exact: true }).click();
      await page.getByRole("button", { name: "ไม่กัน", exact: true }).click();
      await next(page).click();
      await expect(page).toHaveURL(/\/app\/setup\/essentials$/);
      await page.getByRole("button", { name: "ข้ามไปก่อน", exact: true }).click();
    });

    await test.step("review: (2,400 − 600) ÷ 12 days = 150 baht/day", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/review$/);
      await caption(page, "1 · สรุปแผน: 1,800 ÷ 12 วัน = 150 บาท/วัน");
      await expect(page.getByTestId("review-bills-total")).toHaveText("−600 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("150");
      await snap("review 150 per day");
      await pause(page, 1800);
    });

    await test.step("go back and delete ค่าน้ำ 50 → (2,400 − 550) ÷ 12 = 154 baht/day", async () => {
      await caption(page, "1 · กลับไปลบบิลค่าน้ำ 50 บาท → งบต่อวันต้องคำนวณใหม่");
      await page.getByRole("button", { name: "กลับไปแก้ไข" }).click();
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await page.getByRole("button", { name: "แก้ไข ค่าน้ำ" }).click();
      await page.getByRole("dialog", { name: "แก้ไขบิล" }).getByRole("button", { name: "ลบบิลนี้" }).click();
      await expect(page.getByRole("button", { name: "แก้ไข ค่าน้ำ" })).toHaveCount(0);
      await expect(page.getByTestId("bills-total")).toHaveText("550 บาท");
      await pause(page);
      await next(page).click();
      await expect(page).toHaveURL(/\/app\/setup\/savings$/);
      await next(page).click(); // the earlier choices are kept in the draft
      await page.getByRole("button", { name: "ข้ามไปก่อน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/setup\/review$/);
      await caption(page, "1 · สรุปแผน: 1,850 ÷ 12 วัน = 154 บาท/วัน");
      await expect(page.getByTestId("review-bills-total")).toHaveText("−550 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("154");
      await snap("review 154 per day");
      await pause(page, 1800);
    });

    await test.step("save 10% (240 baht) and 80 baht/day essentials → (2,400 − 550 − 240) ÷ 12 = 134 baht/day", async () => {
      await caption(page, "1 · ตั้งเป้าออม 10% = 240 บาท");
      await page.getByRole("button", { name: "กลับไปแก้ไข" }).click();
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await next(page).click();
      await expect(page).toHaveURL(/\/app\/setup\/savings$/);
      await page.getByRole("button", { name: "10% (240 บาท)" }).click();
      await expect(page.getByRole("button", { name: "10% (240 บาท)" })).toHaveAttribute("aria-pressed", "true");
      await pause(page);
      await next(page).click();
      await expect(page).toHaveURL(/\/app\/setup\/essentials$/);
      await caption(page, "1 · ตั้งค่า 4/4 · ค่าจำเป็นต่อวัน 80 บาท (ใช้เตือนตอนลองซื้อ)");
      await page.getByLabel("ยอดต่อวัน (บาท)").filter({ visible: true }).pressSequentially("80");
      await page.getByRole("button", { name: "ดูสรุปแผน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/setup\/review$/);
      await caption(page, "1 · สรุปแผน: 1,610 ÷ 12 วัน = 134 บาท/วัน");
      await expect(page.getByTestId("review-savings")).toHaveText("−240 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("134");
      await expect(page.getByText("อีก 12 วัน จนถึงวันเงินเข้า")).toBeVisible();
      await snap("review 134 per day");
      await pause(page, 1800);
    });

    await test.step("start: exactly one cycle is created, signed with the LIFF ID token", async () => {
      await page.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      const created = backend.callsTo("POST", /^\/api\/cycle$/);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ hasAuth: true, status: 200 });
      expect(created[0].body).toMatchObject({ balance: 240000, payday: "2026-11-23" });
      expect((await me().plans()).plans.map((p) => p.title).sort()).toEqual(["ค่าหอ", "ค่าไฟ"].sort());
    });
  });

  // ---------------------------------------------------------------- 2
  await test.step("2 · Dashboard overview & navigation check", async () => {
    await test.step("summary numbers: 134/day, real 2,400, reserved 550, savings 240", async () => {
      await caption(page, "2 · หน้าสรุป: งบวันนี้ 134 บาท");
      await expectHero(page, { todayRemaining: "134", daily: "134", daysLeft: "12" });
      await pause(page);
      await expandMath(page);
      await caption(page, "2 · ดูวิธีคิด: เงินจริง − บิลที่กันไว้ − เงินออม");
      await expectHero(page, { balance: "2,400", reserved: "550", savings: "240" });
      await snap("home after onboarding");
      await pause(page, 1800);
    });

    // The hero's "ใช้ไปแต่ละวัน" chart tab only renders when dailySpend() has data, and the live client
    // still has it as notImplemented (lib/client/live.ts), so real users don't see that tab yet.

    await test.step("daily check-in on the points card: +1 point, once", async () => {
      await caption(page, "2 · รับแต้มฟรีประจำวัน +1 แต้ม");
      const before = (await me().points()).balance;
      await expect(page.getByTestId("summary-points")).toHaveText(`${before} แต้ม`);
      await page.getByRole("button", { name: "รับแต้มฟรี", exact: true }).click();
      await expect(page.getByTestId("summary-points")).toHaveText(`${before + 1} แต้ม`);
      await expect(page.getByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeVisible();
      await expect(page.getByRole("button", { name: "รับแต้มฟรี", exact: true })).toHaveCount(0);
      await snap("checked in");
      await pause(page);
    });

    // The "ใช้ไปกับอะไร" card needs categoryTotals(), not implemented in the live client yet, so it is hidden.
    await test.step("card: recent entries → full history", async () => {
      await caption(page, "2 · การ์ด: รายการล่าสุด");
      await page.getByRole("link", { name: "ดูทั้งหมด ›" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=list$/);
      await pause(page);
    });

    await test.step("bottom tab bar: every section, then the ＋ จด chooser", async () => {
      for (const [tab, url, label] of [
        ["แผนเงิน", /\/app\/plan(\?.*)?$/, "แผนเงิน"],
        ["สิทธิพิเศษ", /\/app\/perks$/, "สิทธิพิเศษ & แต้ม"],
        ["ตั้งค่า", /\/app\/settings$/, "ตั้งค่า"],
        ["สรุป", /\/app(\?.*)?$/, "สรุป"],
      ] as const) {
        await caption(page, `2 · เมนูล่าง: ${label}`);
        await gotoTab(page, tab);
        await expect(page).toHaveURL(url);
        await expect(nav(page).getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
        await expect(page.locator('main[aria-busy="true"]:visible')).toHaveCount(0, { timeout: 30_000 });
        await pause(page, 900);
      }
      await caption(page, "2 · ปุ่ม ＋ จด: จดรายจ่าย / จดรายรับ / ลองก่อนจ่าย");
      await nav(page).getByRole("button", { name: "จด", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "จะจดอะไร" });
      for (const option of ["จดรายจ่าย", "จดรายรับ", "ลองก่อนจ่าย"]) {
        await expect(sheet.getByRole("link", { name: option, exact: true })).toBeVisible();
      }
      await pause(page);
      await sheet.getByRole("button", { name: "ยกเลิก" }).click();
      await expect(sheet).toBeHidden();
    });
  });

  // ---------------------------------------------------------------- 3
  await test.step("3 · ลองก่อนจ่าย → กันไว้ → จ่ายจริง", async () => {
    await test.step("ลอง: try 140 baht → 122.50/day projected, real money untouched", async () => {
      await caption(page, "3 · ลองก่อนจ่าย: เสื้อช็อป 140 บาท");
      await openRecordChooser(page, "ลองก่อนจ่าย");
      await expect(page).toHaveURL(/\/app\/try$/);
      await tryItem(page, "เสื้อช็อป", 140);
      await caption(page, "3 · ถ้าซื้อ: เหลือ 122.50 บาท/วัน · เงินจริงยังไม่ถูกหัก");
      await expect(buyCard(page, "เสื้อช็อป")).toContainText(/\)\s*122\.50\s*บาท\/วัน/);
      await expect(skipCard(page)).toContainText(/ถ้ายังไม่ซื้อ\s*134\s*บาท\/วัน/);
      expect(backend.callsTo("POST", /^\/api\/(entries|plans)/), "a try must not write anything").toHaveLength(0);
      expect((await me().summary()).balance).toBe(240000);
      await snap("try 140 → 122.50 per day");
      await pause(page, 1800);
    });

    await test.step("กันไว้: keep it in the plan → reserved 690, real money still 2,400", async () => {
      await caption(page, "3 · กันไว้: เก็บไว้ในแผน → เงินที่กันไว้เพิ่ม 140");
      await page.getByRole("button", { name: "เลือกวิธีจัดการรายการนี้" }).click();
      await expect(page).toHaveURL(/\/app\/try\/decide$/);
      await expect(page.getByRole("radio", { name: /เก็บไว้ในแผน/ })).toBeChecked();
      await pause(page);
      await page.getByRole("button", { name: "เก็บไว้ในแผน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/try\/saved\?plan=/);
      await expect(page.getByRole("heading", { name: "บันทึกแล้ว" })).toBeVisible();
      await pause(page);
      await page.getByRole("link", { name: "กลับหน้าสรุป" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expectHero(page, { daily: "122.50", balance: "2,400", reserved: "690" });
      await snap("reserved 690");
      await pause(page, 1800);
    });

    await test.step("จ่ายจริง: pay it → real 2,260, reserved back to 550, deducted once", async () => {
      await caption(page, "3 · จ่ายจริง: แผนเงิน › รอจ่าย › จ่ายแล้ว");
      await gotoTab(page, "แผนเงิน");
      await page.getByRole("tab", { name: "รอจ่าย" }).click();
      const row = planRow(page, "เสื้อช็อป");
      await expect(row).toHaveAttribute("data-plan-status", "reserved");
      await pause(page);
      await row.getByRole("button", { name: "จ่ายแล้ว", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "จ่ายแล้ว ✓" })).toBeVisible();
      await expect(row).toHaveAttribute("data-plan-status", "paid");
      await pause(page);
      await home(page);
      await caption(page, "3 · เงินจริง 2,400 → 2,260 (หัก 140 ครั้งเดียว)");
      await expectHero(page, { daily: "122.50", balance: "2,260", reserved: "550" });
      const { entries } = await me().entries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ amount: 14000, source: "plan", note: "เสื้อช็อป" });
      await snap("paid: real 2,260");
      await pause(page, 1800);
    });
  });

  // ---------------------------------------------------------------- 4
  await test.step("4 · Expenses: double-tap guard, edit, delete, balance adjust", async () => {
    await test.step("record ข้าวกลางวัน 50 and triple-tap บันทึก on a slow network → one entry", async () => {
      backend.delay("POST", /^\/api\/entries$/, 1500);
      await caption(page, "4 · จดรายจ่าย: ข้าวกลางวัน 50 บาท");
      await openRecordChooser(page, "จดรายจ่าย");
      await recordExpense(page, 50, "ข้าวกลางวัน");
      const save = page.getByRole("button", { name: "บันทึก", exact: true }).filter({ visible: true });
      await expect(save).toBeEnabled();
      await pause(page);
      await caption(page, "4 · กดบันทึกรัว ๆ 3 ครั้ง → ปุ่มล็อก บันทึกครั้งเดียว");
      await save.evaluate((el) => {
        const b = el as HTMLButtonElement;
        b.click();
        b.click();
        b.click();
      });
      await expect(save).toBeDisabled();
      await expect(save).toHaveAttribute("aria-busy", "true");
      await snap("button locked while saving");
      await expect(page).toHaveURL(/\/app\/record\/done/);
      await expect(page.getByRole("heading", { name: "บันทึกรายการแล้ว ✓" })).toBeVisible();
      const posts = backend.callsTo("POST", /^\/api\/entries$/);
      expect(posts, "only one create request may reach the server").toHaveLength(1);
      expect(posts[0].idempotencyKey).toBeTruthy();
      await pause(page);
      await home(page);
      await expectHero(page, { balance: "2,210" });
      await pause(page);
    });

    await test.step("history: edit ข้าวกลางวัน 50 → 65, balance 2,195", async () => {
      await caption(page, "4 · ประวัติรายการ › แก้ข้าวกลางวัน 50 → 65 บาท");
      await openEntryFromHistory(page, "ข้าวกลางวัน");
      const amount = page.getByLabel("จำนวนเงิน (บาท)").filter({ visible: true });
      await amount.fill("");
      await amount.pressSequentially("65");
      await pause(page);
      await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=list$/);
      await expect(page.getByRole("link", { name: /ข้าวกลางวัน/ })).toContainText("−65 บาท");
      await pause(page);
      await home(page);
      await expectHero(page, { balance: "2,195" });
      await pause(page);
    });

    await test.step("record a test entry 30, then delete it: 2,165 → back to 2,195", async () => {
      await caption(page, "4 · จดรายการทดสอบ 30 บาท แล้วลบทิ้ง");
      await openRecordChooser(page, "จดรายจ่าย");
      await recordExpense(page, 30, "รายการทดสอบ");
      await page.getByRole("button", { name: "บันทึก", exact: true }).filter({ visible: true }).click();
      await expect(page).toHaveURL(/\/app\/record\/done/);
      await home(page);
      await expectHero(page, { balance: "2,165" });
      await pause(page);
      await openEntryFromHistory(page, "รายการทดสอบ");
      await page.getByRole("button", { name: "ลบรายการนี้" }).click();
      const sheet = page.getByRole("dialog", { name: "ยืนยันลบรายการนี้ไหม" });
      await expect(sheet).toContainText("รายการทดสอบ");
      await pause(page);
      await sheet.getByRole("button", { name: "ยืนยันลบรายการ" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=list$/);
      await expect(page.getByRole("link", { name: /รายการทดสอบ/ })).toHaveCount(0);
      await home(page);
      await caption(page, "4 · ลบแล้ว เงินกลับมา 2,195 บาท");
      await expectHero(page, { balance: "2,195" });
      await pause(page);
    });

    await test.step("adjust the balance to the real 2,150", async () => {
      await caption(page, "4 · ปรับยอดให้ตรงเงินจริง: 2,150 บาท");
      await page.getByRole("link", { name: "ปรับยอด ›" }).click();
      await expect(page).toHaveURL(/\/app\/balance\/adjust$/);
      await expect(page.getByText("ยอดในพอใช้ตอนนี้:")).toContainText("2,195 บาท");
      const real = page.getByLabel("เงินจริงที่มีตอนนี้ (บาท)").filter({ visible: true });
      await real.fill(""); // the field starts with the app's current figure
      await real.pressSequentially("2150");
      await pause(page);
      await page.getByRole("button", { name: "ปรับยอด", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/balance\/done$/);
      await pause(page);
      await home(page);
      await expectHero(page, { balance: "2,150", reserved: "550", savings: "240" });
      expect(backend.callsTo("POST", /^\/api\/cycle\/balance$/)).toHaveLength(1);
      await snap("adjusted to 2,150");
      await pause(page);
    });
  });

  // ---------------------------------------------------------------- 5
  await test.step("5 · Savings, points, rewards & perks", async () => {
    await test.step("savings target for this cycle: 240 baht", async () => {
      await caption(page, "5 · เงินออม · เงินเผื่อ: เป้าออมรอบนี้ 240 บาท");
      await page.getByRole("link", { name: "ดูเงินออม · เงินเผื่อ" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=savings$/);
      await expect(page.getByText("เป้าออมรอบนี้", { exact: true }).locator("..")).toContainText("240 บาท");
      await snap("savings tab");
      await pause(page, 1800);
    });

    await test.step("points: today's point already received; redeem a reward, then 'not enough points'", async () => {
      await caption(page, "5 · แต้มของฉัน: รับแต้มวันนี้แล้ว ✓");
      await gotoTab(page, "สิทธิพิเศษ");
      await expect(page).toHaveURL(/\/app\/perks$/);
      await pause(page);
      await page.getByRole("link", { name: "ดูของที่แลกได้ ›" }).click();
      await expect(page).toHaveURL(/\/app\/points$/);
      const start = (await me().points()).balance;
      await expect(page.getByTestId("points-balance")).toHaveText(String(start));
      await expect(page.getByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeVisible();
      await pause(page);

      const sticker = page.getByTestId("reward-reward-sticker");
      await caption(page, "5 · แลกของรางวัล: สติกเกอร์ 10 แต้ม");
      await sticker.getByRole("button", { name: "10 แต้ม" }).click();
      await expect(page.getByRole("heading", { name: "แลกสำเร็จ" })).toBeVisible();
      await expect(page.getByText(/^RW-[0-9A-Z]{4}$/)).toBeVisible();
      await snap("redeemed");
      await pause(page, 1800);
      await page.getByRole("button", { name: "กลับหน้าแต้ม" }).click();
      await expect(page.getByTestId("points-balance")).toHaveText(String(start - 10));

      await caption(page, "5 · แต้มไม่พอ → แลกไม่ได้ ไม่หักแต้ม");
      await sticker.getByRole("button", { name: "10 แต้ม" }).click();
      await expect(page.getByText("แต้มไม่พอ")).toBeVisible();
      await expect(page.getByTestId("points-balance")).toHaveText(String(start - 10));
      await pause(page);

      await caption(page, "5 · ประวัติแต้ม: +1 และ −10");
      await page.getByRole("link", { name: "ดูประวัติแต้ม ›" }).click();
      await expect(page).toHaveURL(/\/app\/points\/history$/);
      await expect(page.getByText("+1 แต้ม", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("−10 แต้ม", { exact: true })).toBeVisible();
      await snap("points history");
      await pause(page);
    });

    await test.step("perks: sponsor offers list", async () => {
      // Sponsor offers come from promos(), not implemented in the live client yet: the screen says so politely.
      await caption(page, "5 · สิทธิพิเศษจากผู้สนับสนุน (ยังไม่เปิดในระบบจริง)");
      await gotoTab(page, "สิทธิพิเศษ");
      await expect(page).toHaveURL(/\/app\/perks$/);
      await expect(page.getByText("ข้อเสนอจากผู้สนับสนุนจะแสดงที่นี่เมื่อระบบพร้อม")).toBeVisible();
      await page.mouse.wheel(0, 600);
      await snap("perks");
      await pause(page, 1500);
    });
  });

  // ---------------------------------------------------------------- 6
  await test.step("6 · Edge case & final summary", async () => {
    await test.step("try 5,000 baht: deficit warning, never a positive daily budget, nothing saved", async () => {
      await caption(page, "6 · ลองซื้อของ 5,000 บาท → ต้องเตือนเงินขาด");
      const before = await me().summary();
      const writesBefore = backend.calls.filter((c) => c.method !== "GET" && c.path !== "/api/simulate").length;
      await openRecordChooser(page, "ลองก่อนจ่าย");
      await tryItem(page, "โน้ตบุ๊กมือสอง", 5000);
      await expect(buyCard(page, "โน้ตบุ๊กมือสอง")).toContainText(/ขาดอีก [\d,.]+ บาท/);
      await expect(buyCard(page, "โน้ตบุ๊กมือสอง")).not.toContainText("บาท/วัน");
      await snap("try 5,000 → deficit");
      await pause(page, 2000);
      expect((await me().summary()).balance).toBe(before.balance);
      expect(backend.calls.filter((c) => c.method !== "GET" && c.path !== "/api/simulate").length, "a try must not write anything").toBe(writesBefore);
    });

    await test.step("don't buy → back to a clean dashboard", async () => {
      await skipCard(page).click();
      await page.getByRole("button", { name: "ไม่ซื้อ · กลับหน้าสรุป" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await caption(page, "จบเดโม · พอใช้ (Por-Chai)");
      await expectHero(page, { balance: "2,150", reserved: "550", savings: "240" });
      await expect(page.locator("body")).not.toContainText(/\bNaN\b|Infinity|undefined/);
      await snap("final dashboard");
      await pause(page, 3000);
    });
  });
});
