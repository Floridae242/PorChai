/**
 * Por-Chai (พอใช้) · live PM demo: ONE Demo Account, ONE continuous journey across LINE OA chat + LIFF MINI App.
 *
 *   npm run demo:pm
 *
 * ★ Demo Account ชุดเดียว: ทุกตัวเลข/ชื่อ/เวลาที่ใช้ในเดโมอยู่ในก้อน `DEMO` และ `CHAT` ด้านล่างที่เดียว
 *   - LIFF (MINI App) และ LINE OA (DemoLineBot) ใช้ "ผู้ใช้คนเดียวกัน" + "backend ในหน่วยความจำตัวเดียวกัน"
 *     → จดในแชตแล้วไปโผล่ในแอป, ตั้งค่าในแอปแล้วบอทรู้, ขั้น 5 ต่อจากข้อมูลของขั้น 1-4 (ไม่แยกผู้ใช้อีกคนแล้ว)
 *   - ตัวเลขที่ต้องตรวจ (2,285 / 690 / 2,145 / 134 ...) คำนวณจาก DEMO/CHAT ไม่ได้พิมพ์ซ้ำเอง
 *     → อยากเปลี่ยนค่าเดโม แก้ที่ DEMO/CHAT ที่เดียว ทุก assert และ caption เปลี่ยนตาม
 *
 * ★ ความเร็ว (ค่าเริ่มต้น = ช้าให้เห็นการกด): DEMO_SLOWMO=300 (ms หน่วงทุก action) · DEMO_PACE=1.3 (ตัวคูณเวลาหยุดอ่าน)
 *   อยากเร็วขึ้น: DEMO_PACE=0.5 DEMO_SLOWMO=100 · เร็วสุด: DEMO_SLOWMO=0 (ไม่มีการหยุดเลย)
 *
 * ลำดับโฟลว์:
 *   1 · แชต: การ์ดต้อนรับ → «เริ่มตั้งค่า» เปิด MINI App
 *   2 · LIFF: ยินยอม → 1/4 รายได้ → 2/4 ยอดเงิน+บิล → 3/4 ออม → 4/4 ค่าจำเป็น → สรุป → เริ่มใช้ → กลับแชต
 *   3 · แชต: ริชเมนู · เช็กครบแล้ว · ข้าว 45 · พิมพ์มั่ว · 2 รายการ · แก้เป็น 65 · สลิป · ไหวไหม→เก็บไว้ในแผน
 *   4 · LIFF: เปิดแอปจากริชเมนู → ข้อมูลจากแชตมาครบ → จ่ายจริง → กดรัว 3 ครั้ง → ลบ → ออม/แลกแต้ม
 *   5 · บัญชีเดิม ใช้มา 1 สัปดาห์: ตั้งเตือนใน LIFF → 12:00 OA ทักเอง → [ใช่ จดเลย] → ไม่ทักซ้ำ → เปิดแอปดู
 *
 * Nothing reaches LINE, Supabase or Gemini; the clock is fixed at 2026-11-11 10:00 Asia/Bangkok.
 */
import type { Page } from "@playwright/test";
import { baht, dayFromToday, expandMath, expect, expectHero, makeUser, test } from "./helpers/liff-mock";
import { DemoLineBot, LINE_OA_PATH } from "./helpers/line-oa-bot";
import { MOCK_SLIP_PATH } from "./helpers/generate-mock-slip";

// ================================================================== Demo Account (แหล่งความจริงชุดเดียว)

const fmt = (n: number) => n.toLocaleString("en-US"); // รูปแบบตัวเลขเหมือนที่แอปแสดง เช่น 2,285

/** ค่าตั้งต้นของบัญชีเดโม — ใช้ทั้งตอนพิมพ์ในวิซาร์ด LIFF และตอนคำนวณตัวเลขที่ต้องเห็น */
const DEMO = {
  user: makeUser("A", "U_demo_account", "พอใช้ · Demo Account"),
  income: { source: "ทางบ้านส่งให้", frequency: "รายเดือน", payday: 23, daysLeft: 12 }, // วันนี้ 11 พ.ย. → 23 พ.ย. = 12 วัน
  balance: 5000, // งบต่อวัน ≈ 329 พอให้เงินไม่ติดลบตลอดเดโม (รวมขั้น 5)
  bills: [
    { title: "ค่าหอ", amount: 400 },
    { title: "ค่าน้ำ", amount: 50 },
    { title: "ค่าไฟ", amount: 150 },
  ],
  removedBill: "ค่าน้ำ", // บิลที่ลบทิ้งในขั้นตั้งค่า (โชว์ว่าแก้ได้)
  savings: 500, // 10% ของเงินที่มี
  savingsLabel: `10% (${fmt(500)} บาท)`,
  essentialsPerDay: 80,
  /** นิสัยที่ใช้ในขั้น 5: จด «ข้าวมันไก่ 50» ช่วงเที่ยงเมื่อ 1,2,3,5 วันก่อน */
  habit: { note: "ข้าวมันไก่", amount: 50, time: "12:00", pastDays: [1, 2, 3, 5] },
};

/** ยอดที่จดระหว่างเดโม (บาท) */
const CHAT = { rice: 45, riceEdited: 65, slip: 50, shirt: 140, tea: 30 };

// ตัวเลขที่คำนวณจาก DEMO/CHAT (ไม่พิมพ์ซ้ำด้วยมือ)
const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
const billsAll = sum(DEMO.bills); // 600
const billsKept = sum(DEMO.bills.filter((b) => b.title !== DEMO.removedBill)); // 550
const dailyBudget = Math.floor((DEMO.balance - billsKept - DEMO.savings) / DEMO.income.daysLeft); // 134
const balAfterChat = DEMO.balance - CHAT.riceEdited - CHAT.slip; // 2,285
const reservedAfterChat = billsKept + CHAT.shirt; // 690
const balAfterPay = balAfterChat - CHAT.shirt; // 2,145
const balAfterTea = balAfterPay - CHAT.tea; // 2,115
const TODAY_ISO = dayFromToday(0); // 2026-11-11

// ================================================================== pace (ปรับความเร็ว)

/** หน่วงทุกการกด/พิมพ์ของ Playwright (ms) — ค่าเริ่ม 300 ช้าพอให้เห็นการคลิก; ตั้ง DEMO_SLOWMO=0 เพื่อรันเร็วสุด */
const SLOW_MS = Number(process.env.DEMO_SLOWMO ?? 300);
const SLOWED = SLOW_MS > 0;
/** ตัวคูณเวลาหยุดทุกจุด: 1.3 = ช้า (ค่าเริ่ม) · 1 = พอพรีเซนต์ · 0.5 = เร็ว · DEMO_SLOWMO=0 → 0 (ไม่หยุด) */
const PACE = SLOWED ? Number(process.env.DEMO_PACE ?? 1.3) : 0;

// ตั้ง slowMo จากในสเปกเอง (หน่วงทุก action ของเบราว์เซอร์) — ไม่ต้องพึ่งค่าใน playwright.config
test.use({ launchOptions: { slowMo: SLOW_MS } });

// ---------------------------------------------------------------- presentation helpers

/** ป้ายคำบรรยายด้านบนจอ (คลิกทะลุได้, อยู่ใน closed shadow root จึงไม่ถูก assertion จับ) */
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
  // เวลาให้อ่านป้าย: สั้นลงจากเดิม (0.4 วิ + 20ms/ตัวอักษร สูงสุด 1.6 วิ) × PACE
  if (PACE) await page.waitForTimeout(Math.min(1600, 400 + text.length * 20) * PACE);
}

/** หยุดให้คนดูอ่านจอ (โหมดไม่หยุดจะข้าม) ค่าเริ่ม 0.5 วิ */
async function pause(page: Page, ms = 500) {
  if (PACE) await page.waitForTimeout(ms * PACE);
}

/** การ์ดเต็มจอคั่นแต่ละขั้น (สั้นลง: ค้าง 1.6 วิ × PACE) */
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
           font-family:"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;animation:in .3s ease-out}
        .n{width:72px;height:72px;border-radius:50%;background:#FED24F;color:#12301B;font:800 34px/72px system-ui;}
        .t{font-size:28px;font-weight:700}.l{font-size:16px;opacity:.85;max-width:320px;line-height:1.5}
        .out{animation:out .3s ease-in forwards}
        @keyframes in{from{opacity:0;transform:scale(.97)}to{opacity:1}} @keyframes out{to{opacity:0}}
      </style><div class="c"><div class="n">${n}</div><div class="t">${title}</div><div class="l">${line}</div></div>`;
      document.body.appendChild(host);
      (window as unknown as { __pmStage?: () => void }).__pmStage = () => {
        root.querySelector(".c")!.classList.add("out");
        setTimeout(() => host.remove(), 300);
      };
    },
    { n, title, line },
  );
  await page.waitForTimeout(2200 * PACE);
  await page.evaluate(() => (window as unknown as { __pmStage?: () => void }).__pmStage?.());
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------- MINI App (LIFF) helpers

const nav = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });
const next = (page: Page) => page.getByRole("button", { name: "ถัดไป", exact: true });

/** กดแท็บในแถบเมนูล่าง */
async function gotoTab(page: Page, name: "สรุป" | "แผนเงิน" | "สิทธิพิเศษ" | "ตั้งค่า") {
  await nav(page).getByRole("link", { name, exact: true }).click();
}

/** กลับแดชบอร์ด + เปิด «ดูวิธีคิด» ให้เห็นยอดเงินจริง/กันไว้/ออม */
async function home(page: Page) {
  await gotoTab(page, "สรุป");
  await expect(page).toHaveURL(/\/app(\?.*)?$/);
  await expect(page.getByTestId("today-hero")).toBeVisible();
  await expandMath(page);
}

/** เปิดชีต «จะจดอะไร» แล้วเลือกตัวเลือก */
async function openRecordChooser(page: Page, option: "จดรายจ่าย" | "จดรายรับ" | "ลองก่อนจ่าย") {
  await nav(page).getByRole("button", { name: "จด", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "จะจดอะไร" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: option, exact: true }).click();
}

const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

/** เพิ่มบิลในขั้นตั้งค่า */
async function addBill(page: Page, title: string, amount: number) {
  await page.getByRole("button", { name: "+ เพิ่มบิล" }).click();
  const sheet = page.getByRole("dialog", { name: "เพิ่มบิล" });
  await sheet.getByLabel("ชื่อบิล").fill(title);
  await sheet.getByLabel("จำนวนเงิน (บาท)").fill(String(amount));
  await sheet.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(sheet).toBeHidden();
}

const planRow = (page: Page, title: string) => page.getByTestId("plan-row").filter({ hasText: title });
const saveButton = (page: Page) => page.getByRole("button", { name: "บันทึก", exact: true }).filter({ visible: true });

/** กรอกฟอร์มจดรายจ่าย (ยังไม่กดบันทึก) */
async function recordExpense(page: Page, amount: number, note: string) {
  await expect(page).toHaveURL(/\/app\/record\/new/);
  await field(page, "จำนวนเงิน (บาท)").fill(String(amount));
  await field(page, "ชื่อรายการ").fill(note);
}

/** เปิดรายการเก่าจากประวัติ */
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

/** เปิดหน้าแชต LINE ปลอม (โหลดประวัติแชตของ Demo Account) */
async function openChat(page: Page) {
  await page.goto(LINE_OA_PATH);
  await expect(page.locator("body[data-ready='1']")).toBeAttached();
}

/** รอบอทตอบเพิ่ม 1 บับเบิลจากจำนวนก่อนหน้า */
async function botAnswered(page: Page, before: number) {
  await expect(botRows(page)).toHaveCount(before + 1);
  await expect(page.getByLabel("กำลังพิมพ์")).toHaveCount(0);
}

/** พิมพ์ข้อความในแชต → ส่ง → รอบอทตอบ (พิมพ์ทีละตัว 90ms แล้วรอสักครู่ก่อนกดส่ง) */
async function sendChat(page: Page, message: string) {
  const before = await botRows(page).count();
  const box = page.getByLabel("พิมพ์ข้อความ");
  await box.click();
  await box.pressSequentially(message, { delay: PACE ? 90 : 0 });
  await pause(page, 700); // ให้คนดูเห็นข้อความที่พิมพ์ก่อนกดส่ง
  await page.getByRole("button", { name: "ส่ง", exact: true }).click();
  await botAnswered(page, before);
}

/** กดปุ่มในการ์ดของบอท แล้วรอคำตอบใหม่ */
async function tapInChat(page: Page, scope: ReturnType<typeof lastBot>, label: string) {
  const before = await botRows(page).count();
  await pause(page, 600); // เว้นก่อนกดปุ่มในการ์ด
  await scope.getByRole("button", { name: label, exact: true }).click();
  await botAnswered(page, before);
}

async function openRichMenu(page: Page) {
  const toggle = page.getByRole("button", { name: /^เมนูพอใช้/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(richMenu(page)).toBeVisible();
}

/** กดปุ่มริชเมนู คืนจำนวนบับเบิลบอทก่อนกด (ผู้เรียกไปรอ botAnswered เอง) */
async function tapRichMenu(page: Page, label: string) {
  const before = await botRows(page).count();
  await openRichMenu(page);
  await pause(page, 600); // เว้นก่อนกดปุ่มริชเมนู
  await richMenu(page).getByRole("button", { name: label, exact: true }).click();
  return before;
}

// ================================================================== the journey

test("Complete First-Time User Journey & All Features Demo", async ({ page, loginAs, backend, snap }) => {
  // ★ Demo Account: ผู้ใช้คนเดียว บัญชีเดียว backend เดียว
  const me = () => backend.as(DEMO.user); // อ่าน/เขียนข้อมูลฝั่ง server ของ Demo Account (ไว้ assert/seed)
  await loginAs(DEMO.user, { consented: false }); // ฉีด LIFF ปลอมของ Demo Account; ยังไม่ยินยอม → จะเจอหน้า consent จริง
  const bot = new DemoLineBot(backend, DEMO.user); // บอท LINE OA ของ "ผู้ใช้คนเดียวกัน" ใช้ backend ตัวเดียวกับ LIFF
  await bot.install(page); // ผูกหน้าแชตปลอม /__line-oa เข้ากับ page

  // ---------------------------------------------------------------- 1
  await test.step("1 · LINE OA chat: welcome card → «เริ่มตั้งค่า» opens the MINI App", async () => {
    bot.follow(); // ผู้ใช้เพิ่งแอดเพื่อน → บอทส่งการ์ดต้อนรับ
    await openChat(page);
    await stageCard(page, 1, "แอดเพื่อน LINE OA", "พอใช้ทักทายด้วยการ์ดต้อนรับ แล้วกด «เริ่มตั้งค่า» เพื่อเปิด MINI App");
    await caption(page, "1 · LINE OA แชต · ข้อความต้อนรับ");
    const welcome = lastBot(page);
    await expect(welcome).toContainText("ตั้งค่าเสร็จแล้วค่อยพิมพ์จดได้เลยครับ");
    await expect(richMenu(page)).toBeVisible();
    await snap("LINE OA welcome");
    await pause(page);
    await welcome.getByRole("button", { name: "เริ่มตั้งค่า ↗" }).click(); // ปุ่มเป็นลิงก์เปิด MINI App
    await expect(page).toHaveURL(/\/app\/consent$/);
  });

  // ---------------------------------------------------------------- 2
  await test.step("2 · LIFF setup 1/4–4/4: ตั้งค่า Demo Account แล้วกลับแชต", async () => {
    await test.step("consent: ยินยอมก่อนเริ่ม", async () => {
      await stageCard(page, 2, "ตั้งค่าใน LIFF", `4 ขั้น · งบต่อวัน ${fmt(dailyBudget)} บาท`);
      await caption(page, "2 · LIFF · ขอความยินยอม");
      const start = page.getByRole("button", { name: "ยอมรับและเริ่ม" });
      await expect(start).toBeDisabled(); // ยังไม่ติ๊ก → ปุ่มล็อก
      const agree = page.getByRole("checkbox", { name: "ฉันเข้าใจและยินยอม" });
      // เปิดจากแชตด้วยการโหลดทั้งหน้า: ติ๊กก่อน React hydrate อาจหาย → ติ๊กซ้ำจนแอปรับ (uncheck ก่อนถ้าติ๊กค้าง)
      await expect(async () => {
        if (await agree.isChecked()) await agree.uncheck();
        await agree.check();
        await expect(start).toBeEnabled({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await start.click();
    });

    await test.step("1/4 income: ไม่เลือก → error แล้วเลือกรายเดือน", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/income$/);
      await caption(page, "2 · 1/4 รายได้");
      await next(page).click(); // ยังไม่เลือก → ต้องเตือน
      await expect(page.getByText("กรุณาเลือกแหล่งเงินและความถี่ที่เงินเข้า")).toBeVisible();
      await page.getByRole("button", { name: DEMO.income.source, exact: true }).click();
      await page.getByRole("button", { name: DEMO.income.frequency, exact: true }).click();
      await page.getByRole("button", { name: `วันที่ ${DEMO.income.payday}`, exact: true }).click();
      await expect(page.getByText(`อีก ${DEMO.income.daysLeft} วัน`)).toBeVisible();
      await next(page).click();
    });

    await test.step("2/4 balance: ว่าง/ติดลบ → error, ใส่ยอดเงิน + บิล, ลบบิลหนึ่งรายการ", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/balance$/);
      await caption(page, `2 · 2/4 เงินที่มี ${fmt(DEMO.balance)} + บิล`);
      await next(page).click(); // ว่าง
      await expect(page.getByText("กรุณากรอกจำนวนเงิน")).toBeVisible();
      const balance = field(page, "เงินที่มีตอนนี้ (บาท)");
      await balance.fill("-500"); // ติดลบ
      await next(page).click();
      await expect(page.getByText("ใส่จำนวนเงินตั้งแต่ 0 ขึ้นไป")).toBeVisible();
      await balance.fill(String(DEMO.balance));
      for (const b of DEMO.bills) await addBill(page, b.title, b.amount);
      await expect(page.getByTestId("bills-total")).toHaveText(`${billsAll} บาท`);
      await snap("balance with bills");
      await caption(page, `2 · ลบบิล${DEMO.removedBill} → เหลือ ${billsKept} บาท`);
      await page.getByRole("button", { name: `แก้ไข ${DEMO.removedBill}` }).click();
      await page.getByRole("dialog", { name: "แก้ไขบิล" }).getByRole("button", { name: "ลบบิลนี้" }).click();
      await expect(page.getByRole("button", { name: `แก้ไข ${DEMO.removedBill}` })).toHaveCount(0);
      await expect(page.getByTestId("bills-total")).toHaveText(`${billsKept} บาท`);
      await next(page).click();
    });

    await test.step("3/4 savings: ไม่เลือก → error แล้วเลือกเป้าออม", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/savings$/);
      await caption(page, `2 · 3/4 เป้าออม ${fmt(DEMO.savings)} บาท`);
      await next(page).click(); // ยังไม่เลือก
      await expect(page.getByText(/กรุณาเลือกเป้าออมและเงินเผื่อ/)).toBeVisible();
      await page.getByRole("button", { name: DEMO.savingsLabel, exact: true }).click();
      await expect(page.getByRole("button", { name: DEMO.savingsLabel })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "ไม่กัน", exact: true }).click(); // เงินเผื่อ: ไม่กัน
      await next(page).click();
    });

    await test.step("4/4 essentials → review", async () => {
      await expect(page).toHaveURL(/\/app\/setup\/essentials$/);
      await caption(page, `2 · 4/4 ค่าจำเป็น ${DEMO.essentialsPerDay} บาท/วัน`);
      await field(page, "ยอดต่อวัน (บาท)").fill(String(DEMO.essentialsPerDay));
      await page.getByRole("button", { name: "ดูสรุปแผน", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/setup\/review$/);
      await caption(page, `2 · สรุปแผน: งบ ${fmt(dailyBudget)} บาท/วัน`);
      await expect(page.getByTestId("review-bills-total")).toHaveText(`−${billsKept} บาท`);
      await expect(page.getByTestId("review-savings")).toHaveText(`−${fmt(DEMO.savings)} บาท`);
      await expect(page.getByTestId("review-daily-budget")).toHaveText(fmt(dailyBudget));
      await snap("setup review");
      await pause(page);
    });

    await test.step("start: สร้างรอบเงิน 1 ครั้ง แล้วปิด MINI App กลับแชต", async () => {
      await page.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }).click(); // POST /api/cycle
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expectHero(page, { todayRemaining: fmt(dailyBudget), daily: fmt(dailyBudget), daysLeft: String(DEMO.income.daysLeft) });
      const created = backend.callsTo("POST", /^\/api\/cycle$/);
      expect(created).toHaveLength(1); // ไม่สร้างรอบซ้ำ
      expect(created[0]).toMatchObject({ hasAuth: true, status: 200 });
      expect(created[0].body).toMatchObject({ balance: baht(DEMO.balance), payday: dayFromToday(DEMO.income.daysLeft) });
      await caption(page, `2 · ตั้งค่าเสร็จ · งบวันนี้ ${fmt(dailyBudget)} บาท`);
      await pause(page);
      await openChat(page); // จำลอง liff.closeWindow → กลับแชตเดิมของ Demo Account
    });
  });

  // ---------------------------------------------------------------- 3
  await test.step("3 · LINE OA chat: rich menu, chat commands, a slip, try → keep", async () => {
    const entries = async () => (await me().entries()).entries.filter((e) => !(e as { cancelled?: boolean }).cancelled);

    await test.step("rich menu «จดรายรับ/จ่าย» → how to record", async () => {
      await stageCard(page, 3, "พิมพ์แชต & ส่งสลิป", `ข้าว ${CHAT.rice} · พิมพ์มั่ว · 2 รายการ · แก้เป็น ${CHAT.riceEdited} · ส่งสลิป · «ไหวไหม» → เก็บไว้ในแผน`);
      await caption(page, "3 · ริชเมนู «จดรายรับ/จ่าย»");
      const before = await tapRichMenu(page, "จดรายรับ/จ่าย");
      await botAnswered(page, before);
      await expect(page.getByTestId("chat-user").last()).toHaveText(/วิธีจดรายรับ\/จ่าย/);
      await expect(lastBot(page)).toContainText(`ข้าว ${CHAT.rice}`);
    });

    await test.step("«เช็กครบแล้ว» → +1 point", async () => {
      await caption(page, "3 · พิมพ์ «เช็กครบแล้ว» → รับแต้มวันนี้ +1");
      const start = (await me().points()).balance;
      await sendChat(page, "เช็กครบแล้ว");
      await expect(lastBot(page)).toContainText(`รับ 1 แต้มแล้ว · มี ${start + 1} แต้มครับ`);
      expect((await me().points()).balance).toBe(start + 1);
    });

    await test.step(`«ข้าว ${CHAT.rice}» → recorded card, today ${dailyBudget} → ${dailyBudget - CHAT.rice}`, async () => {
      await caption(page, `3 · พิมพ์ «ข้าว ${CHAT.rice}» → จดแล้ว`);
      await sendChat(page, `ข้าว ${CHAT.rice}`);
      const card = lastBot(page);
      await expect(card).toContainText("ข้าว");
      await expect(card).toContainText(String(CHAT.rice));
      await expect(card).toContainText(fmt(dailyBudget - CHAT.rice)); // เหลือใช้วันนี้
      expect((await entries()).map((e) => [e.note, e.amount])).toEqual([["ข้าว", baht(CHAT.rice)]]);
      await snap("chat: recorded rice");
      await pause(page);
    });

    await test.step("gibberish «asdfghjkl» → polite fallback, nothing saved", async () => {
      await caption(page, "3 · พิมพ์มั่ว → บอทตอบสุภาพ ไม่จดอะไร");
      await sendChat(page, "asdfghjkl");
      await expect(lastBot(page)).toContainText("พอใช้ยังตอบข้อความนี้ไม่ได้");
      expect(await entries()).toHaveLength(1);
    });

    await test.step("«ข้าว 45 น้ำ 20» → asks to confirm both; ไม่ใช่ → nothing saved", async () => {
      await caption(page, "3 · 2 รายการในข้อความเดียว → ถามยืนยันก่อน ไม่เดาเอง");
      await sendChat(page, "ข้าว 45 น้ำ 20");
      const card = lastBot(page);
      await expect(card.getByRole("button", { name: "จดทั้งหมด", exact: true })).toBeVisible();
      await expect(card).toContainText("น้ำ");
      expect(await entries()).toHaveLength(1); // ยังไม่จดจนกว่าจะกด
      await snap("chat: two items asked");
      await tapInChat(page, card, "ไม่ใช่");
      await expect(lastBot(page)).toContainText("ไม่จด");
      expect(await entries()).toHaveLength(1);
    });

    await test.step(`[แก้] on the ข้าว card → «${CHAT.riceEdited}» → edited, today ${dailyBudget - CHAT.riceEdited}`, async () => {
      await caption(page, `3 · กด [แก้] บนการ์ดข้าว → พิมพ์ยอดใหม่ ${CHAT.riceEdited}`);
      const riceCard = botRows(page).filter({ hasText: "จดแล้ว" }).filter({ hasText: "ข้าว" }).last();
      await riceCard.scrollIntoViewIfNeeded();
      await tapInChat(page, riceCard, "แก้");
      await expect(lastBot(page)).toContainText("พิมพ์ยอดใหม่ของ ข้าว");
      await sendChat(page, String(CHAT.riceEdited)); // บอทกำลังรอยอดใหม่ → แก้รายการเดิม ไม่จดใหม่
      const card = lastBot(page);
      await expect(card).toContainText("แก้แล้ว ✓");
      await expect(card).toContainText(String(CHAT.riceEdited));
      expect((await entries()).map((e) => [e.note, e.amount])).toEqual([["ข้าว", baht(CHAT.riceEdited)]]);
      await snap("chat: edited");
    });

    await test.step("send a slip → OCR draft card → [บันทึก] → recorded", async () => {
      await caption(page, "3 · ส่งสลิปในแชต → อ่านยอดอัตโนมัติ");
      const before = await botRows(page).count();
      const chooser = page.waitForEvent("filechooser"); // ต้องรอก่อนคลิก
      await page.getByRole("button", { name: "ส่งรูป" }).click();
      await (await chooser).setFiles(MOCK_SLIP_PATH);
      await botAnswered(page, before);
      await expect(page.getByTestId("chat-user").last().locator("img")).toBeVisible();
      const draft = lastBot(page);
      await expect(draft).toContainText("ร้านเบอร์เกอร์");
      await expect(draft).toContainText(String(CHAT.slip));
      expect(await entries(), "a slip is only a draft until it is confirmed").toHaveLength(1);
      await snap("chat: slip draft");
      await tapInChat(page, draft, "บันทึก");
      await expect(lastBot(page)).toContainText("ร้านเบอร์เกอร์");
      expect((await entries()).map((e) => [e.note, e.amount]).sort()).toEqual(
        [["ข้าว", baht(CHAT.riceEdited)], ["ร้านเบอร์เกอร์", baht(CHAT.slip)]].sort(),
      );
    });

    await test.step("rich menu «ลองก่อนจ่าย» → «เสื้อช็อป 140 ไหวไหม» → try card → เก็บไว้ในแผน", async () => {
      await caption(page, "3 · ริชเมนู «ลองก่อนจ่าย»");
      const before = await tapRichMenu(page, "ลองก่อนจ่าย");
      await botAnswered(page, before);
      await expect(lastBot(page)).toContainText("ไหวไหม");
      const moneyBefore = (await me().summary()).balance;
      await caption(page, `3 · ลองก่อนจ่าย: «เสื้อช็อป ${CHAT.shirt} ไหวไหม»`);
      await sendChat(page, `เสื้อช็อป ${CHAT.shirt} ไหวไหม`);
      const card = lastBot(page);
      await expect(card).toContainText("เสื้อช็อป");
      await expect(card.getByRole("button", { name: "เก็บไว้ในแผน", exact: true })).toBeVisible();
      expect((await me().summary()).balance, "a try never touches real money").toBe(moneyBefore);
      await snap("chat: try card");
      await tapInChat(page, card, "เก็บไว้ในแผน"); // สร้างแผนสถานะ reserved (กันไว้)
      await expect(lastBot(page)).toContainText("เก็บไว้ในแผนแล้ว ✓");
      const kept = (await me().plans()).plans.find((p) => p.title === "เสื้อช็อป");
      expect(kept).toMatchObject({ amount: baht(CHAT.shirt), status: "reserved" });
      expect((await me().summary()).balance).toBe(moneyBefore); // กันไว้ ≠ จ่าย
    });

    await test.step("rich menu «วันนี้ใช้ได้» → today's card", async () => {
      await caption(page, "3 · ริชเมนู «วันนี้ใช้ได้»");
      const before = await tapRichMenu(page, "วันนี้ใช้ได้");
      await botAnswered(page, before);
      await snap("chat: today card");
    });
  });

  // ---------------------------------------------------------------- 4
  await test.step("4 · LIFF dashboard: ข้อมูลเดียวกับแชต แล้วโฟลว์ที่เหลือ", async () => {
    await test.step("rich menu «เปิดแอป» → dashboard shows the chat's work", async () => {
      await stageCard(page, 4, "แดชบอร์ด LIFF & แลกแต้ม", "ทุกอย่างจากแชตมาครบ · จ่ายจริง · กดรัวไม่จดซ้ำ · แลกแต้ม");
      await caption(page, "4 · ริชเมนู «เปิดแอป» → แดชบอร์ด LIFF");
      await openRichMenu(page);
      await richMenu(page).getByRole("button", { name: "เปิดแอป", exact: true }).click();
      await expect(page).toHaveURL(/\/app(\?.*)?$/);
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await caption(page, `4 · ข้อมูลจากแชตมาครบ: ${fmt(DEMO.balance)} − ${CHAT.riceEdited} − ${CHAT.slip} = ${fmt(balAfterChat)} · กันไว้ ${fmt(reservedAfterChat)}`);
      await expectHero(page, { balance: fmt(balAfterChat), reserved: fmt(reservedAfterChat), savings: fmt(DEMO.savings) });
      const recent = (title: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await expect(recent("ข้าว")).toContainText(`−฿${CHAT.riceEdited}`);
      await expect(recent("ข้าว")).toContainText("จดจาก LINE");
      await expect(recent("ร้านเบอร์เกอร์")).toContainText(`−฿${CHAT.slip}`);
      await expect(page.getByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeVisible();
      await snap("dashboard synced from chat");
      await pause(page);
    });

    await test.step("จ่ายจริง: pay the kept เสื้อช็อป → deducted once", async () => {
      await caption(page, "4 · จ่ายจริง: แผนเงิน › รอจ่าย › เสื้อช็อป › จ่ายแล้ว");
      await gotoTab(page, "แผนเงิน");
      await page.getByRole("tab", { name: "รอจ่าย" }).click();
      const row = planRow(page, "เสื้อช็อป");
      await expect(row).toHaveAttribute("data-plan-status", "reserved");
      await row.getByRole("button", { name: "จ่ายแล้ว", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "จ่ายแล้ว ✓" })).toBeVisible();
      await expect(row).toHaveAttribute("data-plan-status", "paid");
      await home(page);
      await caption(page, `4 · เงินจริง ${fmt(balAfterChat)} → ${fmt(balAfterPay)} (หัก ${CHAT.shirt} ครั้งเดียว)`);
      await expectHero(page, { balance: fmt(balAfterPay), reserved: fmt(billsKept) });
      const shirts = (await me().entries()).entries.filter((e) => e.note === "เสื้อช็อป");
      expect(shirts).toHaveLength(1);
      expect(shirts[0]).toMatchObject({ amount: baht(CHAT.shirt), source: "plan" });
    });

    await test.step("record ชานม with a triple tap on a slow network → one entry; then delete it", async () => {
      backend.delay("POST", /^\/api\/entries$/, 1500); // เน็ตช้า 1.5 วิ ให้มีเวลากดซ้ำ
      await caption(page, `4 · จดรายจ่าย ชานม ${CHAT.tea} · กดบันทึกรัว ๆ 3 ครั้ง`);
      const postsBefore = backend.callsTo("POST", /^\/api\/entries$/).length;
      await openRecordChooser(page, "จดรายจ่าย");
      await recordExpense(page, CHAT.tea, "ชานม");
      const save = saveButton(page);
      await expect(save).toBeEnabled();
      await save.evaluate((el) => {
        const b = el as HTMLButtonElement;
        b.click();
        b.click();
        b.click();
      });
      await expect(save).toBeDisabled(); // ปุ่มล็อกระหว่างบันทึก
      await expect(save).toHaveAttribute("aria-busy", "true");
      await snap("button locked while saving");
      await expect(page).toHaveURL(/\/app\/record\/done/);
      expect(backend.callsTo("POST", /^\/api\/entries$/).length - postsBefore, "one create request only").toBe(1);
      await home(page);
      await expectHero(page, { balance: fmt(balAfterTea) });

      await caption(page, `4 · ลบรายการชานม → เงินกลับมา ${fmt(balAfterPay)}`);
      await openEntryFromHistory(page, "ชานม");
      await page.getByRole("button", { name: "ลบรายการนี้" }).click();
      const sheet = page.getByRole("dialog", { name: "ยืนยันลบรายการนี้ไหม" });
      await expect(sheet).toContainText("ชานม");
      await sheet.getByRole("button", { name: "ยืนยันลบรายการ" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=list$/);
      await expect(page.getByRole("link", { name: /ชานม/ })).toHaveCount(0);
      await home(page);
      await expectHero(page, { balance: fmt(balAfterPay) });
    });

    await test.step("savings target and rewards: redeem, then 'not enough points'", async () => {
      await caption(page, `4 · เงินออม · เป้าออม ${fmt(DEMO.savings)} บาท`);
      await page.getByRole("link", { name: "ดูเงินออม · เงินเผื่อ" }).click();
      await expect(page).toHaveURL(/\/app\/plan\?tab=savings$/);
      await expect(page.getByText("เป้าออมรอบนี้", { exact: true }).locator("..")).toContainText(`${fmt(DEMO.savings)} บาท`);

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
      await page.getByRole("button", { name: "กลับหน้าแต้ม" }).click();
      await expect(page.getByTestId("points-balance")).toHaveText(String(points - 10));
      await caption(page, "4 · แต้มไม่พอ → แลกไม่ได้ ไม่หักแต้ม");
      await sticker.getByRole("button", { name: "10 แต้ม" }).click();
      await expect(page.getByText("แต้มไม่พอ")).toBeVisible();
      await expect(page.getByTestId("points-balance")).toHaveText(String(points - 10));
    });
  });

  // ---------------------------------------------------------------- 5
  // ★ ต่อเนื่องจาก Demo Account เดิม: ไม่สร้างผู้ใช้ใหม่/บอทใหม่ ใช้ `bot` และ `me()` ตัวเดิม
  await test.step("5 · Behaviour-based reminders (บัญชีเดิม ใช้มา 1 สัปดาห์)", async () => {
    await test.step(`ประวัติ «${DEMO.habit.note} ${DEMO.habit.amount}» เมื่อ ${DEMO.habit.pastDays.join(", ")} วันก่อน (เขียนลงบัญชีเดิม)`, async () => {
      await stageCard(page, 5, "แจ้งเตือนตามพฤติกรรม", `บัญชีเดิมใช้มา 1 สัปดาห์ จด «${DEMO.habit.note} ${DEMO.habit.amount}» ตอนเที่ยงเกือบทุกวัน · พอใช้จำได้และทักเตือนเอง`);
      for (const daysAgo of DEMO.habit.pastDays) {
        await me().addEntry(
          { amount: baht(DEMO.habit.amount), category: "food", note: DEMO.habit.note, spentOn: dayFromToday(-daysAgo) },
          `history-${daysAgo}`,
        );
      }
      await page.goto("/app"); // โหลดใหม่ให้แอปอ่านประวัติ (LIFF ยังเป็นผู้ใช้เดิม)
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await caption(page, `5 · บัญชีเดิม · จด${DEMO.habit.note}ตอนเที่ยงเกือบทุกวัน`);
    });

    await test.step("LIFF › ตั้งค่า › การเตือน: เจอรายการประจำ แล้วเปิดเตือน", async () => {
      await caption(page, "5 · LIFF › ตั้งค่า › การเตือน");
      await gotoTab(page, "ตั้งค่า");
      await page.getByRole("link", { name: /^การเตือน/ }).click();
      await expect(page).toHaveURL(/\/app\/settings\/notifications$/);
      const habit = page.locator("li").filter({ hasText: DEMO.habit.note });
      await expect(habit).toContainText(`~${DEMO.habit.amount} บาท`);
      await expect(habit).toContainText(`ถามตอน ${DEMO.habit.time}`);
      await snap("habit found");
      await caption(page, `5 · เปิด «เตือนรายการประจำ» เวลา ${DEMO.habit.time} แล้วบันทึก`);
      const on = page.getByRole("switch", { name: /เตือนรายการประจำ/ });
      await expect(on).not.toBeChecked();
      await on.check();
      await field(page, "เวลาเตือน").fill(DEMO.habit.time);
      await page.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(page.getByText("บันทึกการตั้งค่าแล้ว")).toBeVisible();
      expect(await me().reminderSettings()).toMatchObject({ enabled: true, time: DEMO.habit.time, pausedUntil: null });
    });

    await test.step("LIFF › สรุปรายวัน และเตือนงบ: เปิดทั้งคู่", async () => {
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
      expect(await me().notificationPreferences()).toMatchObject({ daily: true, budget: true });
      await snap("notification preferences");
    });

    await test.step("11:45 nothing; 12:00 the OA pushes the reminder card by itself", async () => {
      expect(await bot.runReminderCron("11:45"), "not before the user's time").toBeNull();
      const log = await bot.runReminderCron(DEMO.habit.time); // cron ของบอทตัวเดิม อ่านการตั้งค่าที่เพิ่งบันทึกใน LIFF
      expect(log).toMatchObject({ label: DEMO.habit.note, amount: baht(DEMO.habit.amount), category: "food" });
      await openChat(page); // แชตเดิม มีการ์ดเตือนที่เพิ่ง push เข้ามาต่อท้าย
      await caption(page, `5 · ${DEMO.habit.time} น. · พอใช้ทักมาเอง: ถึงเวลา${DEMO.habit.note}แล้ว จดเลยไหม?`);
      const card = lastBot(page);
      await expect(card).toContainText(DEMO.habit.note);
      await expect(card).toContainText(String(DEMO.habit.amount));
      await expect(card.getByRole("button", { name: "ใช่ จดเลย", exact: true })).toBeVisible();
      await expect(page.getByLabel("ปุ่มตอบกลับด่วน").getByRole("button", { name: "ตั้งค่าการเตือน" })).toBeVisible();
      await snap("reminder card");
      await pause(page);
    });

    await test.step("[ใช่ จดเลย] → recorded once; no second reminder today", async () => {
      await caption(page, "5 · กด [ใช่ จดเลย] → จดให้ทันที ไม่ต้องพิมพ์");
      const before = (await me().entries()).entries.length;
      await tapInChat(page, botRows(page).last(), "ใช่ จดเลย");
      await expect(lastBot(page)).toContainText(DEMO.habit.note);
      const todays = (await me().entries()).entries.filter((e) => e.spentOn === TODAY_ISO && e.note === DEMO.habit.note);
      expect(todays).toHaveLength(1);
      expect(todays[0]).toMatchObject({ amount: baht(DEMO.habit.amount), source: "reminder" });
      expect((await me().entries()).entries).toHaveLength(before + 1);
      expect(await bot.runReminderCron("12:15"), "reminded once a day only").toBeNull();
      await caption(page, "5 · เตือนวันละครั้งเท่านั้น · จดแล้วจะไม่ทักซ้ำ");
      await snap("reminder recorded");
    });

    await test.step("rich menu «เปิดแอป» → the dashboard has it", async () => {
      await openRichMenu(page);
      await richMenu(page).getByRole("button", { name: "เปิดแอป", exact: true }).click();
      await expect(page.getByTestId("today-hero")).toBeVisible();
      await expandMath(page);
      await expect(
        page.locator("article").filter({ has: page.getByRole("heading", { name: DEMO.habit.note, exact: true }) }).first(),
      ).toContainText(`−฿${DEMO.habit.amount}`);
      await caption(page, "จบเดโม · พอใช้ (Por-Chai) · เพราะการวางแผนการเงินที่ดีคือจุดเริ่มต้นของชีวิตที่สบายใจ");
      await expect(page.locator("body")).not.toContainText(/\bNaN\b|Infinity|undefined/);
      await snap("final dashboard");
      await pause(page, 1000);
    });
  });
});