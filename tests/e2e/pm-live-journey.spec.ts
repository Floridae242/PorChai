/**
 * Por-Chai (พอใช้) · live PM demo: ONE continuous journey across the LINE OA chat and the LIFF MINI App.
 *
 *   npm run demo:pm
 *
 * One command starts the dev server, opens one visible phone-sized window (project "chromium": headed,
 * slowMo 150 ms, no trace) and plays a brand-new user end to end, in four stages:
 *   1 · LINE OA แชต        welcome card → «เริ่มตั้งค่า ↗» opens the MINI App
 *   2 · ตั้งค่า LIFF 1/4–4/4  the whole setup wizard, then back to the chat (as liff.closeWindow would)
 *   3 · พิมพ์แชต & ส่งสลิป    rich menu, check-in, «ข้าว 45», gibberish, two items, edit to 65, a slip,
 *                          «… ไหวไหม» → เก็บไว้ในแผน
 *   4 · แดชบอร์ด LIFF       rich menu «เปิดแอป»: everything from the chat is there; pay the kept item,
 *                          double-tap guard, add/delete, savings, rewards, the ขาดอีก warning
 *   5 · แจ้งเตือนตามพฤติกรรม  a user one week in (logs «ข้าวมันไก่ 50» around noon): LIFF › ตั้งค่า › การเตือน
 *                          shows the habit the app found, reminders on at 12:00 + budget alert; at 12:00 the
 *                          OA pushes the reminder card (real findHabits/dueHabit rules), [ใช่ จดเลย] records it,
 *                          once a day only; the dashboard shows it
 *
 * Pace: the demo runs at presentation speed so the presenter can talk over it (slide 7's script): a title
 * card at each stage, a reading pause after every caption, slow typing. DEMO_PACE scales every pause
 * (default 1.8; 1 = brisker, 2.5 = slower). DEMO_SLOWMO=0 drops all pauses for the fast rehearsal.
 *
 * The chat is a stand-in for the LINE app (tests/e2e/helpers/line-oa-chat.html) answered by DemoLineBot
 * (tests/e2e/helpers/line-oa-bot.ts): the app's own parsers and LINE message builders, writing to the same
 * in-memory backend as the MINI App (tests/e2e/helpers/liff-mock.ts). Nothing reaches LINE, Supabase or Gemini;
 * the clock is fixed at 2026-11-11 10:00 Asia/Bangkok.
 *
 * Scripted differently from the brief, on purpose:
 *   - «ลอง 140» / «กันไว้ 140» are not commands: the real parser reads them as spends named "ลอง" / "กันไว้"
 *     and the real bot would SAVE them. The bot's own way is used instead: «เสื้อช็อป 140 ไหวไหม» → try card
 *     → [เก็บไว้ในแผน]. (Rich menu «ลองก่อนจ่าย» explains exactly this.)
 *   - «เช็กครบแล้ว» runs before the first spend: recording anything already earns today's point.
 *   - Setup step 1/4 is the income step and 2/4 the balance step in the real app.
 *   - Rich menu labels are the real ones: «จดรายรับ/จ่าย», «เปิดแอป».
 */
import type { Page } from "@playwright/test";
import { dayFromToday, expandMath, expect, expectHero, makeUser, test } from "./helpers/liff-mock";
import { DemoLineBot, LINE_OA_PATH } from "./helpers/line-oa-bot";
import { MOCK_SLIP_PATH } from "./helpers/generate-mock-slip";

const NEW_USER = makeUser("A", "U_new_user_demo", "ผู้ใช้ใหม่ (เดโม)");
/** Stage 5: someone who has used พอใช้ for a week (a brand-new user has no habit yet). */
const WEEK_USER = makeUser("B", "U_week_user_demo", "ผู้ใช้ 1 สัปดาห์ (เดโม)");
const SLOWED = Number(process.env.DEMO_SLOWMO ?? 150) > 0;
/** Multiplies every reading pause: 1.8 ≈ the pace of slide 7's script. */
const PACE = SLOWED ? Number(process.env.DEMO_PACE ?? 1.8) : 0;

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
  // Time to read the caption aloud before the next tap (about the speed of the slide script).
  if (PACE) await page.waitForTimeout(Math.min(2400, 500 + text.length * 28) * PACE);
}

/** A beat for the audience to read the screen (skipped in the fast rehearsal). */
async function pause(page: Page, ms = 800) {
  if (PACE) await page.waitForTimeout(ms * PACE);
}

/**
 * Full-screen title card between stages, worded like slide 7's steps so the presenter can say the line
 * while it shows. Closed shadow root + pointer-events:none: invisible to assertions and taps.
 */
async function stageCard(page: Page, n: number, title: string, line: string) {
  if (!PACE) return;
  await page.evaluate(
    ({ n, title, line }) => {
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none";
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>
        .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
           background:linear-gradient(180deg,#0E2A17 0%,#1F4D2B 45%,#3F7F35 100%);color:#fff;text-align:center;padding:24px;
           font-family:"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;animation:in .45s ease-out}
        .n{width:72px;height:72px;border-radius:50%;background:#FED24F;color:#12301B;font:800 34px/72px system-ui;}
        .t{font-size:28px;font-weight:700}.l{font-size:16px;opacity:.85;max-width:320px;line-height:1.5}
        .out{animation:out .45s ease-in forwards}
        @keyframes in{from{opacity:0;transform:scale(.97)}to{opacity:1}} @keyframes out{to{opacity:0}}
      </style><div class="c"><div class="n">${n}</div><div class="t">${title}</div><div class="l">${line}</div></div>`;
      document.body.appendChild(host);
      (window as unknown as { __pmStage?: () => void }).__pmStage = () => {
        root.querySelector(".c")!.classList.add("out");
        setTimeout(() => host.remove(), 450);
      };
    },
    { n, title, line },
  );
  await page.waitForTimeout(2600 * PACE);
  await page.evaluate(() => (window as unknown as { __pmStage?: () => void }).__pmStage?.());
  await page.waitForTimeout(450);
}

// ---------------------------------------------------------------- MINI App helpers

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

const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

async function addBill(page: Page, title: string, amount: number) {
  await page.getByRole("button", { name: "+ เพิ่มบิล" }).click();
  const sheet = page.getByRole("dialog", { name: "เพิ่มบิล" });
  await sheet.getByLabel("ชื่อบิล").pressSequentially(title);
  await sheet.getByLabel("จำนวนเงิน (บาท)").pressSequentially(String(amount));
  await sheet.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function tryItem(page: Page, title: string, price: number) {
  await field(page, "ชื่อของที่จะซื้อ (ไม่บังคับ)").pressSequentially(title);
  await field(page, "ราคา (บาท)").pressSequentially(String(price));
  await page.getByRole("button", { name: "ดูผลกระทบต่องบ" }).click();
  await expect(page).toHaveURL(/\/app\/try\/result$/);
}

const buyCard = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^ถ้าซื้อ ${title}`) });
const skipCard = (page: Page) => page.getByRole("button", { name: /^ถ้ายังไม่ซื้อ/ });
const planRow = (page: Page, title: string) => page.getByTestId("plan-row").filter({ hasText: title });
const saveButton = (page: Page) => page.getByRole("button", { name: "บันทึก", exact: true }).filter({ visible: true });

async function recordExpense(page: Page, amount: number, note: string) {
  await expect(page).toHaveURL(/\/app\/record\/new/);
  await field(page, "จำนวนเงิน (บาท)").pressSequentially(String(amount));
  await field(page, "ชื่อรายการ").pressSequentially(note);
}

async function openEntryFromHistory(page: Page, note: string) {
  await page.goto("/app/plan?tab=list");
  await page.getByRole("link", { name: new RegExp(note) }).click();
  await expect(page).toHaveURL(/\/app\/record\/[^/?]+$/);
  await expect(field(page, "จำนวนเงิน (บาท)")).not.toHaveValue("");
}

// ---------------------------------------------------------------- LINE OA chat helpers

const botRows = (page: Page) => page.getByTestId("chat-bot");
const lastBot = (page: Page) => botRows(page).last();
const richMenu = (page: Page) => page.getByRole("navigation", { name: "ริชเมนู" });

async function openChat(page: Page) {
  await page.goto(LINE_OA_PATH);
  await expect(page.locator("body[data-ready='1']")).toBeAttached();
}

/** Waits until the bot has answered once more than `before`. */
async function botAnswered(page: Page, before: number) {
  await expect(botRows(page)).toHaveCount(before + 1);
  await expect(page.getByLabel("กำลังพิมพ์")).toHaveCount(0);
}

async function sendChat(page: Page, message: string) {
  const before = await botRows(page).count();
  const box = page.getByLabel("พิมพ์ข้อความ");
  await box.click();
  await box.pressSequentially(message, { delay: PACE ? 110 : 0 });
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await botAnswered(page, before);
}

async function tapInChat(page: Page, scope: ReturnType<typeof lastBot>, label: string) {
  const before = await botRows(page).count();
  await scope.getByRole("button", { name: label, exact: true }).click();
  await botAnswered(page, before);
}

async function openRichMenu(page: Page) {
  const toggle = page.getByRole("button", { name: /^เมนูพอใช้/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(richMenu(page)).toBeVisible();
}

async function tapRichMenu(page: Page, label: string) {
  const before = await botRows(page).count();
  await openRichMenu(page);
  await richMenu(page).getByRole("button", { name: label, exact: true }).click();
  return before;
}

// ================================================================== the journey

test("Complete First-Time User Journey & All Features Demo", async ({ page, loginAs, backend, snap }) => {
  const me = () => backend.as(NEW_USER);
  await loginAs(NEW_USER, { consented: false });
  const bot = new DemoLineBot(backend, NEW_USER);
  let weekBot: DemoLineBot | null = null; // stage 5: the one-week user's chat
  await bot.install(page);

  // ---------------------------------------------------------------- 1
  await test.step("1 · LINE OA chat: welcome card → «เริ่มตั้งค่า» opens the MINI App", async () => {
    bot.follow(); // the user has just added พอใช้ as a friend
    await openChat(page);
    await stageCard(page, 1, "แอดเพื่อน LINE OA", "พอใช้ทักทายด้วยการ์ดต้อนรับ แล้วกด «เริ่มตั้งค่า» เพื่อเปิด MINI App");
    await caption(page, "1 · LINE OA แชต · ข้อความต้อนรับ");
    const welcome = lastBot(page);
    await expect(welcome).toContainText("ตั้งค่าเสร็จแล้วค่อยพิมพ์จดได้เลยครับ");
    await expect(richMenu(page)).toBeVisible();
    await snap("LINE OA welcome");
    await pause(page, 1500);
    await caption(page, "1 · กด «เริ่มตั้งค่า» → เปิด MINI App");
    await welcome.getByRole("button", { name: "เริ่มตั้งค่า ↗" }).click();
    await expect(page).toHaveURL(/\/app\/consent$/);
  });

  // ---------------------------------------------------------------- 2
  await test.step("2 · LIFF setup 1/4–4/4, then back to the chat", async () => {
    await test.step("consent: start stays locked until ticked", async () => {
      await stageCard(page, 2, "ตั้งค่าใน LIFF", "4 ขั้น · ลองกรอกผิดให้ดู · งบต่อวัน 150 → 154 → 134 บาท");
      await caption(page, "2 · ตั้งค่า LIFF · ขอความยินยอม");
      const start = page.getByRole("button", { name: "ยอมรับและเริ่ม" });
      await expect(start).toBeDisabled();
      await pause(page);
      // Opened by a full page load from the chat: a tick that lands before React hydrates is dropped,
      // so tick again until the app has it (the real LINE in-app browser has the same race).
      const agree = page.getByRole("checkbox", { name: "ฉันเข้าใจและยินยอม" });
      await expect(async () => {
        if (await agree.isChecked()) await agree.uncheck();
        await agree.check();
        await expect(start).toBeEnabled({ timeout: 1500 });
      }).toPass({ timeout: 20_000 });
      await start.click();
    });

    await test.step("1/4 income: empty → error; weekly, irregular, then monthly on the 23rd (12 days)", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/income$/);
      await caption(page, "2 · ตั้งค่า LIFF 1/4 · ยังไม่เลือก → ต้องเตือน");
      await next(page).click();
      await expect(page.getByText("กรุณาเลือกแหล่งเงินและความถี่ที่เงินเข้า")).toBeVisible();
      await pause(page);
      await page.getByRole("button", { name: "ทางบ้านส่งให้", exact: true }).click();
      await caption(page, "2 · ตั้งค่า LIFF 1/4 · ความถี่ที่เงินเข้า: รายสัปดาห์");
      await page.getByRole("button", { name: "รายสัปดาห์", exact: true }).click();
      await expect(page.getByText("เงินเข้าทุกวันอะไร")).toBeVisible();
      await pause(page, 1000);
      await caption(page, "2 · ตั้งค่า LIFF 1/4 · ความถี่ที่เงินเข้า: ไม่แน่นอน");
      await page.getByRole("button", { name: "ไม่แน่นอน", exact: true }).click();
      await expect(page.getByText("กะว่าจะใช้ก้อนนี้ถึงวันที่เท่าไหร่")).toBeVisible();
      await pause(page, 1000);
      await caption(page, "2 · ตั้งค่า LIFF 1/4 · รายเดือน วันที่ 23 = อีก 12 วัน");
      await page.getByRole("button", { name: "รายเดือน", exact: true }).click();
      await page.getByRole("button", { name: "วันที่ 23", exact: true }).click();
      await expect(page.getByText("อีก 12 วัน")).toBeVisible();
      await pause(page);
      await next(page).click();
    });

    await test.step("2/4 balance: empty and negative refused, then 2,400 + bills 400 / 50 / 150", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await caption(page, "2 · ตั้งค่า LIFF 2/4 · ยอดเงินว่าง / ติดลบ → ต้องเตือน");
      await next(page).click();
      await expect(page.getByText("กรุณากรอกจำนวนเงิน")).toBeVisible();
      const balance = field(page, "เงินที่มีตอนนี้ (บาท)");
      await balance.pressSequentially("-500");
      await next(page).click();
      await expect(page.getByText("ใส่จำนวนเงินตั้งแต่ 0 ขึ้นไป")).toBeVisible();
      await pause(page);
      await caption(page, "2 · ตั้งค่า LIFF 2/4 · เงินที่มี 2,400 + บิล 3 รายการ");
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

    await test.step("3/4 savings: empty → error, then none for now; 4/4 skip → review 150/day", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/savings$/);
      await caption(page, "2 · ตั้งค่า LIFF 3/4 · ยังไม่เลือก → ต้องเตือน");
      await next(page).click();
      await expect(page.getByText(/กรุณาเลือกเป้าออมและเงินเผื่อ/)).toBeVisible();
      await pause(page);
      await page.getByRole("button", { name: "ยังไม่ตั้ง", exact: true }).click();
      await page.getByRole("button", { name: "ไม่กัน", exact: true }).click();
      await next(page).click();
      await expect(page).toHaveURL(/\/app\/setup\/essentials$/);
      await page.getByRole("button", { name: "ข้ามไปก่อน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/setup\/review$/);
      await caption(page, "2 · สรุปแผน: (2,400 − 600) ÷ 12 วัน = 150 บาท/วัน");
      await expect(page.getByTestId("review-bills-total")).toHaveText("−600 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("150");
      await snap("review 150 per day");
      await pause(page, 1500);
    });

    await test.step("delete ค่าน้ำ 50 → (2,400 − 550) ÷ 12 = 154/day", async () => {
      await caption(page, "2 · ลบบิลค่าน้ำ 50 บาท → คำนวณใหม่");
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
      await caption(page, "2 · สรุปแผน: 1,850 ÷ 12 วัน = 154 บาท/วัน");
      await expect(page.getByTestId("review-bills-total")).toHaveText("−550 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("154");
      await snap("review 154 per day");
      await pause(page, 1500);
    });

    await test.step("save 10% = 240 baht, essentials 80/day → (2,400 − 550 − 240) ÷ 12 = 134/day", async () => {
      await caption(page, "2 · ตั้งค่า LIFF 3/4 · เป้าออม 10% = 240 บาท");
      await page.getByRole("button", { name: "กลับไปแก้ไข" }).click();
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await next(page).click();
      await expect(page).toHaveURL(/\/app\/setup\/savings$/);
      await page.getByRole("button", { name: "10% (240 บาท)" }).click();
      await expect(page.getByRole("button", { name: "10% (240 บาท)" })).toHaveAttribute("aria-pressed", "true");
      await pause(page);
      await next(page).click();
      await expect(page).toHaveURL(/\/app\/setup\/essentials$/);
      await caption(page, "2 · ตั้งค่า LIFF 4/4 · ค่าจำเป็นต่อวัน 80 บาท");
      await field(page, "ยอดต่อวัน (บาท)").pressSequentially("80");
      await page.getByRole("button", { name: "ดูสรุปแผน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/setup\/review$/);
      await caption(page, "2 · สรุปแผน: 1,610 ÷ 12 วัน = 134 บาท/วัน");
      await expect(page.getByTestId("review-savings")).toHaveText("−240 บาท");
      await expect(page.getByTestId("review-daily-budget")).toHaveText("134");
      await snap("review 134 per day");
      await pause(page, 1500);
    });

    await test.step("start: one cycle, then the MINI App closes back to the chat", async () => {
      await page.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await caption(page, "2 · ตั้งค่าเสร็จ · งบวันนี้ 134 บาท");
      await expectHero(page, { todayRemaining: "134", daily: "134", daysLeft: "12" });
      const created = backend.callsTo("POST", /^\/api\/cycle$/);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ hasAuth: true, status: 200 });
      expect(created[0].body).toMatchObject({ balance: 240000, payday: "2026-11-23" });
      await pause(page, 1200);
      // In LINE the user closes the MINI App (liff.closeWindow) and lands back in the same chat.
      await openChat(page);
      await caption(page, "2 · ปิด MINI App → กลับมาที่แชต");
      await pause(page);
    });
  });

  // ---------------------------------------------------------------- 3
  await test.step("3 · LINE OA chat: rich menu, chat commands, a slip, try → keep", async () => {
    const entries = async () => (await me().entries()).entries.filter((e) => !(e as { cancelled?: boolean }).cancelled);

    await test.step("rich menu «จดรายรับ/จ่าย» → how to record", async () => {
      await stageCard(page, 3, "พิมพ์แชต & ส่งสลิป", "ข้าว 45 · พิมพ์มั่ว · 2 รายการ · แก้เป็น 65 · ส่งสลิป · «ไหวไหม» → เก็บไว้ในแผน");
      await caption(page, "3 · ริชเมนู «จดรายรับ/จ่าย»");
      const before = await tapRichMenu(page, "จดรายรับ/จ่าย");
      await botAnswered(page, before);
      await expect(page.getByTestId("chat-user").last()).toHaveText(/วิธีจดรายรับ\/จ่าย/);
      await expect(lastBot(page)).toContainText("ข้าว 45");
      await pause(page, 1500);
    });

    await test.step("«เช็กครบแล้ว» → +1 point", async () => {
      await caption(page, "3 · พิมพ์ «เช็กครบแล้ว» → รับแต้มวันนี้ +1");
      const start = (await me().points()).balance;
      await sendChat(page, "เช็กครบแล้ว");
      await expect(lastBot(page)).toContainText(`รับ 1 แต้มแล้ว · มี ${start + 1} แต้มครับ`);
      expect((await me().points()).balance).toBe(start + 1);
      await pause(page, 1200);
    });

    await test.step("«ข้าว 45» → recorded card, today 134 → 89", async () => {
      await caption(page, "3 · พิมพ์ «ข้าว 45» → จดแล้ว");
      await sendChat(page, "ข้าว 45");
      const card = lastBot(page);
      await expect(card).toContainText("ข้าว");
      await expect(card).toContainText("45");
      await expect(card).toContainText("89");
      expect((await entries()).map((e) => [e.note, e.amount])).toEqual([["ข้าว", 4500]]);
      await snap("chat: recorded ข้าว 45");
      await pause(page, 1500);
    });

    await test.step("gibberish «asdfghjkl» → polite fallback, nothing saved", async () => {
      await caption(page, "3 · พิมพ์มั่ว «asdfghjkl» → บอทตอบสุภาพ ไม่จดอะไร");
      await sendChat(page, "asdfghjkl");
      await expect(lastBot(page)).toContainText("พอใช้ยังตอบข้อความนี้ไม่ได้");
      expect(await entries()).toHaveLength(1);
      await pause(page, 1200);
    });

    await test.step("«ข้าว 45 น้ำ 20» → asks to confirm both, nothing saved until tapped; ไม่ใช่", async () => {
      await caption(page, "3 · «ข้าว 45 น้ำ 20» → ถามยืนยันก่อน ไม่เดาเอง");
      await sendChat(page, "ข้าว 45 น้ำ 20");
      const card = lastBot(page);
      await expect(card.getByRole("button", { name: "จดทั้งหมด", exact: true })).toBeVisible();
      await expect(card).toContainText("น้ำ");
      expect(await entries()).toHaveLength(1);
      await snap("chat: two items asked");
      await pause(page, 1500);
      await tapInChat(page, card, "ไม่ใช่");
      await expect(lastBot(page)).toContainText("ไม่จด");
      expect(await entries()).toHaveLength(1);
      await pause(page);
    });

    await test.step("[แก้] on the ข้าว card → «65» → edited, today 69", async () => {
      await caption(page, "3 · กด [แก้] บนการ์ดข้าว → พิมพ์ยอดใหม่ 65");
      const riceCard = botRows(page).filter({ hasText: "จดแล้ว" }).filter({ hasText: "ข้าว" }).last();
      await riceCard.scrollIntoViewIfNeeded();
      await tapInChat(page, riceCard, "แก้");
      await expect(lastBot(page)).toContainText("พิมพ์ยอดใหม่ของ ข้าว");
      await sendChat(page, "65");
      const card = lastBot(page);
      await expect(card).toContainText("แก้แล้ว ✓");
      await expect(card).toContainText("65");
      expect((await entries()).map((e) => [e.note, e.amount])).toEqual([["ข้าว", 6500]]);
      await snap("chat: edited to 65");
      await pause(page, 1500);
    });

    await test.step("send a slip → OCR draft card → [บันทึก] → recorded 50", async () => {
      await caption(page, "3 · ส่งสลิปในแชต → อ่านยอดอัตโนมัติ");
      const before = await botRows(page).count();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "ส่งรูป" }).click();
      await (await chooser).setFiles(MOCK_SLIP_PATH);
      await botAnswered(page, before);
      await expect(page.getByTestId("chat-user").last().locator("img")).toBeVisible();
      const draft = lastBot(page);
      await expect(draft).toContainText("ร้านเบอร์เกอร์");
      await expect(draft).toContainText("50");
      expect(await entries(), "a slip is only a draft until it is confirmed").toHaveLength(1);
      await snap("chat: slip draft");
      await pause(page, 1500);
      await caption(page, "3 · กด [บันทึก] → จดรายจ่ายจากสลิป");
      await tapInChat(page, draft, "บันทึก");
      await expect(lastBot(page)).toContainText("ร้านเบอร์เกอร์");
      expect((await entries()).map((e) => [e.note, e.amount]).sort()).toEqual([["ข้าว", 6500], ["ร้านเบอร์เกอร์", 5000]].sort());
      await pause(page, 1500);
    });

    await test.step("rich menu «ลองก่อนจ่าย» → «เสื้อช็อป 140 ไหวไหม» → try card, real money untouched", async () => {
      await caption(page, "3 · ริชเมนู «ลองก่อนจ่าย»");
      const before = await tapRichMenu(page, "ลองก่อนจ่าย");
      await botAnswered(page, before);
      await expect(lastBot(page)).toContainText("ไหวไหม");
      await pause(page);
      await caption(page, "3 · ลองก่อนจ่าย: «เสื้อช็อป 140 ไหวไหม»");
      const moneyBefore = (await me().summary()).balance;
      await sendChat(page, "เสื้อช็อป 140 ไหวไหม");
      const card = lastBot(page);
      await expect(card).toContainText("เสื้อช็อป");
      await expect(card.getByRole("button", { name: "เก็บไว้ในแผน", exact: true })).toBeVisible();
      expect((await me().summary()).balance, "a try never touches real money").toBe(moneyBefore);
      await snap("chat: try 140");
      await pause(page, 1500);

      await caption(page, "3 · กันไว้: กด [เก็บไว้ในแผน]");
      await tapInChat(page, card, "เก็บไว้ในแผน");
      await expect(lastBot(page)).toContainText("เก็บไว้ในแผนแล้ว ✓");
      const kept = (await me().plans()).plans.find((p) => p.title === "เสื้อช็อป");
      expect(kept).toMatchObject({ amount: 14000, status: "reserved" });
      expect((await me().summary()).balance).toBe(moneyBefore);
      await pause(page, 1500);
    });

    await test.step("rich menu «วันนี้ใช้ได้» → today's card", async () => {
      await caption(page, "3 · ริชเมนู «วันนี้ใช้ได้»");
      const before = await tapRichMenu(page, "วันนี้ใช้ได้");
      await botAnswered(page, before);
      await snap("chat: today card");
      await pause(page, 1500);
    });
  });

  // ---------------------------------------------------------------- 4
  await test.step("4 · LIFF dashboard: synced from the chat, then the remaining flows", async () => {
    await test.step("rich menu «เปิดแอป» → dashboard shows the chat's work", async () => {
      await stageCard(page, 4, "แดชบอร์ด LIFF & แลกแต้ม", "ทุกอย่างจากแชตมาครบ · จ่ายจริง · กดรัวไม่จดซ้ำ · แลกแต้ม · เตือนเงินขาด");
      await caption(page, "4 · ริชเมนู «เปิดแอป» → แดชบอร์ด LIFF");
      await openRichMenu(page);
      await richMenu(page).getByRole("button", { name: "เปิดแอป", exact: true }).click();
      await expect(page).toHaveURL(/\/app(\?.*)?$/);
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await caption(page, "4 · ข้อมูลจากแชตมาครบ: 2,400 − 65 − 50 = 2,285 · กันไว้ 690");
      await expectHero(page, { balance: "2,285", reserved: "690", savings: "240" });
      const recent = (title: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await expect(recent("ข้าว")).toContainText("−฿65");
      await expect(recent("ข้าว")).toContainText("จดจาก LINE");
      await expect(recent("ร้านเบอร์เกอร์")).toContainText("−฿50");
      await expect(page.getByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeVisible();
      await snap("dashboard synced from chat");
      await pause(page, 2000);
    });

    await test.step("จ่ายจริง: pay the kept เสื้อช็อป → real 2,145, reserved 550, deducted once", async () => {
      await caption(page, "4 · จ่ายจริง: แผนเงิน › รอจ่าย › เสื้อช็อป › จ่ายแล้ว");
      await gotoTab(page, "แผนเงิน");
      await page.getByRole("tab", { name: "รอจ่าย" }).click();
      const row = planRow(page, "เสื้อช็อป");
      await expect(row).toHaveAttribute("data-plan-status", "reserved");
      await pause(page);
      await row.getByRole("button", { name: "จ่ายแล้ว", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "จ่ายแล้ว ✓" })).toBeVisible();
      await expect(row).toHaveAttribute("data-plan-status", "paid");
      await home(page);
      await caption(page, "4 · เงินจริง 2,285 → 2,145 (หัก 140 ครั้งเดียว)");
      await expectHero(page, { balance: "2,145", reserved: "550" });
      const shirts = (await me().entries()).entries.filter((e) => e.note === "เสื้อช็อป");
      expect(shirts).toHaveLength(1);
      expect(shirts[0]).toMatchObject({ amount: 14000, source: "plan" });
      await pause(page, 1500);
    });

    await test.step("record ชานม 30 with a triple tap on a slow network → one entry; then delete it", async () => {
      backend.delay("POST", /^\/api\/entries$/, 1500);
      await caption(page, "4 · จดรายจ่าย ชานม 30 · กดบันทึกรัว ๆ 3 ครั้ง");
      const postsBefore = backend.callsTo("POST", /^\/api\/entries$/).length;
      await openRecordChooser(page, "จดรายจ่าย");
      await recordExpense(page, 30, "ชานม");
      const save = saveButton(page);
      await expect(save).toBeEnabled();
      await pause(page);
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
      expect(backend.callsTo("POST", /^\/api\/entries$/).length - postsBefore, "one create request only").toBe(1);
      await home(page);
      await expectHero(page, { balance: "2,115" });
      await pause(page);

      await caption(page, "4 · ลบรายการชานม → เงินกลับมา 2,145");
      await openEntryFromHistory(page, "ชานม");
      await page.getByRole("button", { name: "ลบรายการนี้" }).click();
      const sheet = page.getByRole("dialog", { name: "ยืนยันลบรายการนี้ไหม" });
      await expect(sheet).toContainText("ชานม");
      await pause(page);
      await sheet.getByRole("button", { name: "ยืนยันลบรายการ" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=list$/);
      await expect(page.getByRole("link", { name: /ชานม/ })).toHaveCount(0);
      await home(page);
      await expectHero(page, { balance: "2,145" });
      await pause(page);
    });

    await test.step("savings target 240 and rewards: redeem, then 'not enough points'", async () => {
      await caption(page, "4 · เงินออม · เงินเผื่อ: เป้าออม 240 บาท");
      await page.getByRole("link", { name: "ดูเงินออม · เงินเผื่อ" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=savings$/);
      await expect(page.getByText("เป้าออมรอบนี้", { exact: true }).locator("..")).toContainText("240 บาท");
      await pause(page, 1200);

      await caption(page, "4 · แต้มจากแชต (+1) อยู่ในแอป · แลกของรางวัล");
      await gotoTab(page, "สิทธิพิเศษ");
      await page.getByRole("link", { name: "ดูของที่แลกได้ ›" }).click();
      await expect(page).toHaveURL(/\/app\/points$/);
      const points = (await me().points()).balance;
      await expect(page.getByTestId("points-balance")).toHaveText(String(points));
      await expect(page.getByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeVisible();
      const sticker = page.getByTestId("reward-reward-sticker");
      await sticker.getByRole("button", { name: "10 แต้ม" }).click();
      await expect(page.getByRole("heading", { name: "แลกสำเร็จ" })).toBeVisible();
      await expect(page.getByText(/^RW-[0-9A-Z]{4}$/)).toBeVisible();
      await snap("redeemed");
      await pause(page, 1500);
      await page.getByRole("button", { name: "กลับหน้าแต้ม" }).click();
      await expect(page.getByTestId("points-balance")).toHaveText(String(points - 10));
      await caption(page, "4 · แต้มไม่พอ → แลกไม่ได้ ไม่หักแต้ม");
      await sticker.getByRole("button", { name: "10 แต้ม" }).click();
      await expect(page.getByText("แต้มไม่พอ")).toBeVisible();
      await expect(page.getByTestId("points-balance")).toHaveText(String(points - 10));
      await pause(page, 1200);
    });

    await test.step("try 5,000 baht: 'ขาดอีก' warning, nothing saved", async () => {
      await caption(page, "4 · ลองซื้อของ 5,000 บาท → เตือนเงินขาด");
      const before = await me().summary();
      const writesBefore = backend.calls.filter((c) => c.method !== "GET" && c.path !== "/api/simulate").length;
      await openRecordChooser(page, "ลองก่อนจ่าย");
      await tryItem(page, "โน้ตบุ๊กมือสอง", 5000);
      await expect(buyCard(page, "โน้ตบุ๊กมือสอง")).toContainText(/ขาดอีก [\d,.]+ บาท/);
      await expect(buyCard(page, "โน้ตบุ๊กมือสอง")).not.toContainText("บาท/วัน");
      await snap("try 5,000 → deficit");
      await pause(page, 1800);
      expect((await me().summary()).balance).toBe(before.balance);
      expect(backend.calls.filter((c) => c.method !== "GET" && c.path !== "/api/simulate").length, "a try must not write anything").toBe(writesBefore);
    });

    await test.step("don't buy → clean final dashboard", async () => {
      await skipCard(page).click();
      await page.getByRole("button", { name: "ไม่ซื้อ · กลับหน้าสรุป" }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await caption(page, "4 · แดชบอร์ดเรียบร้อย: เงินจริง 2,145 · กันไว้ 550 · ออม 240");
      await expectHero(page, { balance: "2,145", reserved: "550", savings: "240" });
      await expect(page.locator("body")).not.toContainText(/\bNaN\b|Infinity|undefined/);
      await snap("stage 4 final dashboard");
      await pause(page, 1500);
    });
  });

  // ---------------------------------------------------------------- 5
  await test.step("5 · Behaviour-based reminders: LIFF settings + LINE OA push at the usual time", async () => {
    const week = () => backend.as(WEEK_USER);

    await test.step("a user one week in: «ข้าวมันไก่ 50» logged around noon on 4 of the last 7 days", async () => {
      await stageCard(page, 5, "แจ้งเตือนตามพฤติกรรม", "ผู้ใช้ที่ใช้มา 1 สัปดาห์ จด «ข้าวมันไก่ 50» ตอนเที่ยงเกือบทุกวัน · พอใช้จำได้และทักเตือนเอง");
      // The account and its past week, written straight to the backend (as if logged on those days at ~12:00).
      await loginAs(WEEK_USER);
      await backend.seedCycle(WEEK_USER, { balance: 1800, paydayInDays: 12, bills: [{ title: "ค่าหอ", amount: 400 }], essentialsPerDay: 80 });
      for (const daysAgo of [1, 2, 3, 5]) {
        await week().addEntry({ amount: 5000, category: "food", note: "ข้าวมันไก่", spentOn: dayFromToday(-daysAgo) }, `history-${daysAgo}`);
      }
      // The LINE app now shows this user's chat with พอใช้.
      await bot.uninstall(page);
      weekBot = new DemoLineBot(backend, WEEK_USER);
      await weekBot.install(page);
      await page.goto("/app");
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await caption(page, "5 · ผู้ใช้อีกคนที่ใช้มา 1 สัปดาห์ · จดข้าวมันไก่ตอนเที่ยงเกือบทุกวัน");
      await pause(page, 1200);
    });

    await test.step("LIFF › ตั้งค่า › การเตือน: the habit the app found, reminders on at 12:00", async () => {
      await caption(page, "5 · LIFF › ตั้งค่า › การเตือน");
      await gotoTab(page, "ตั้งค่า");
      await page.getByRole("link", { name: /^การเตือน/ }).click();
      await expect(page).toHaveURL(/\/app\/settings\/notifications$/);
      const habit = page.locator("li").filter({ hasText: "ข้าวมันไก่" });
      await expect(habit).toContainText("~50 บาท");
      await expect(habit).toContainText("ถามตอน 12:00");
      await caption(page, "5 · ระบบเจอรายการประจำเอง: ข้าวมันไก่ ~50 บาท ตอน 12:00");
      await snap("habit found");
      await pause(page, 1500);

      await caption(page, "5 · เปิด «เตือนรายการประจำ» เวลา 12:00 แล้วบันทึก");
      const on = page.getByRole("switch", { name: /เตือนรายการประจำ/ });
      await expect(on).not.toBeChecked();
      await on.check();
      await field(page, "เวลาเตือน").fill("12:00");
      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(page.getByText("บันทึกการตั้งค่าแล้ว")).toBeVisible();
      expect(await week().reminderSettings()).toMatchObject({ enabled: true, time: "12:00", pausedUntil: null });
      await pause(page);
    });

    await test.step("LIFF › สรุปรายวัน รายเดือน และเตือนงบ: daily summary + over-budget alert on", async () => {
      await caption(page, "5 · เปิดสรุปรายวัน และเตือนเมื่อใช้เกินงบวันนี้");
      await page.getByRole("link", { name: "สรุปรายวัน รายเดือน และเตือนงบ" }).click();
      await expect(page).toHaveURL(/\/app\/notifications$/);
      for (const name of [/สรุปรายวัน/, /เตือนงบวันนี้/]) {
        const box = page.getByRole("checkbox", { name });
        if (!(await box.isChecked())) await box.check();
        await expect(box).toBeChecked();
      }
      await page.getByRole("button", { name: "บันทึกการแจ้งเตือน" }).click();
      await expect(page.getByRole("status").filter({ hasText: "บันทึกแล้ว" })).toBeVisible();
      expect(await week().notificationPreferences()).toMatchObject({ daily: true, budget: true });
      await snap("notification preferences");
      await pause(page);
    });

    await test.step("11:45 nothing; 12:00 the OA pushes the reminder card by itself", async () => {
      expect(await weekBot!.runReminderCron("11:45"), "not before the user's time").toBeNull();
      const log = await weekBot!.runReminderCron("12:00");
      expect(log).toMatchObject({ label: "ข้าวมันไก่", amount: 5000, category: "food" });
      await openChat(page);
      await caption(page, "5 · 12:00 น. · พอใช้ทักมาเอง: ถึงเวลาข้าวมันไก่แล้ว จดเลยไหม?");
      const card = lastBot(page);
      await expect(card).toContainText("ข้าวมันไก่");
      await expect(card).toContainText("50");
      await expect(card.getByRole("button", { name: "ใช่ จดเลย", exact: true })).toBeVisible();
      await expect(page.getByLabel("ปุ่มตอบกลับด่วน").getByRole("button", { name: "ตั้งค่าการเตือน" })).toBeVisible();
      await snap("reminder card");
      await pause(page, 1800);
    });

    await test.step("[ใช่ จดเลย] → recorded once; no second reminder today", async () => {
      await caption(page, "5 · กด [ใช่ จดเลย] → จดให้ทันที ไม่ต้องพิมพ์");
      const before = (await week().entries()).entries.length;
      await tapInChat(page, botRows(page).last(), "ใช่ จดเลย");
      await expect(lastBot(page)).toContainText("ข้าวมันไก่");
      const today = (await week().entries()).entries.filter((e) => e.spentOn === "2026-11-11");
      expect(today).toHaveLength(1);
      expect(today[0]).toMatchObject({ note: "ข้าวมันไก่", amount: 5000, source: "reminder" });
      expect((await week().entries()).entries).toHaveLength(before + 1);
      expect(await weekBot!.runReminderCron("12:15"), "reminded once a day only").toBeNull();
      await caption(page, "5 · เตือนวันละครั้งเท่านั้น · จดแล้วจะไม่ทักซ้ำ");
      await snap("reminder recorded");
      await pause(page, 1500);
    });

    await test.step("rich menu «เปิดแอป» → the dashboard has it", async () => {
      await openRichMenu(page);
      await richMenu(page).getByRole("button", { name: "เปิดแอป", exact: true }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "ข้าวมันไก่", exact: true }) }).first()).toContainText("−฿50");
      await caption(page, "จบเดโม · พอใช้ (Por-Chai) · เพราะการวางแผนการเงินที่ดีคือจุดเริ่มต้นของชีวิตที่สบายใจ");
      await expect(page.locator("body")).not.toContainText(/\bNaN\b|Infinity|undefined/);
      await snap("final dashboard");
      await pause(page, 2500);
    });
  });
});
