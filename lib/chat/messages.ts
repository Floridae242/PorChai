import type { Summary, SimulateResponse } from "@/lib/api-types";
import type { Advice } from "@/lib/advice/advise";
import type { AskReason } from "@/lib/chat/parse";
import type { BudgetResult } from "@/lib/calc/budget";
import { appUrl } from "@/lib/liff/config";
import {
  text,
  type QuickReplyAction,
  type LineMessage,
} from "@/lib/line/reply";
import {
  flexActions,
  flexPrompt,
  flexReceipt,
  flexWelcome,
} from "@/lib/line/flex";

// OA cards share the same verified data and actions as the LIFF screens.

// Getters: the app's URL depends on runtime env (LIFF or MINI App)
const app = (label = "เปิดแอป"): QuickReplyAction => ({
  type: "uri",
  label,
  uri: appUrl(),
});

const CATEGORY = {
  food: "อาหาร",
  transport: "เดินทาง",
  supplies: "ของใช้",
  other: "อื่น ๆ",
  bills: "บิล",
} as const;

export const baht = (satang: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    satang / 100,
  );

export interface Draft {
  title: string;
  amount: number;
  category: keyof typeof CATEGORY;
  key: string; // the first message's webhookEventId: the spend is saved once under it
  dueOn?: string | null; // card 15: a question about tomorrow keeps a plan due then
}

// Postback data the confirm / try buttons carry back (LINE allows 300 characters)
export const draftData = (action: "pay" | "try" | "keep", d: Draft) =>
  JSON.stringify({
    a: action,
    t: d.title,
    m: d.amount,
    c: d.category,
    k: d.key,
    ...(d.dueOn && { d: d.dueOn }),
  });

const payButton = (d: Draft): QuickReplyAction => ({
  type: "postback",
  label: "ยืนยันจ่ายจริง",
  data: draftData("pay", d),
  displayText: "ยืนยันจ่ายจริง",
});

const ASK: Record<AskReason, string> = {
  no_amount: "จดรายจ่าย พิมพ์ชื่อกับยอดได้เลย เช่น «ข้าว 45» หรือกรอกเองในแอป",
  many_amounts:
    "เจอหลายยอดในข้อความเดียว ส่งทีละรายการนะ เช่น «ข้าว 50» แล้วค่อย «น้ำ 20»",
  approximate: "ขอยอดที่จ่ายจริงเป็นตัวเลขนะ เช่น «ข้าว 120» จะได้จดไม่ผิด",
  no_title: "ยอดนี้ค่าอะไร? พิมพ์ชื่อด้วย เช่น «ข้าว 50»",
  too_large: "ยอดนี้สูงมาก ถ้าถูกต้องกรอกเองในแอปได้เลย",
};

export const askMessage = (reason: AskReason): LineMessage =>
  flexPrompt(
    text(ASK[reason], [app("กรอกเองในแอป")]),
    "พิมพ์หาเราได้เลย",
    "กรอกเองในแอป",
    "/app/record/new",
  );

export const noCycleMessage = () =>
  flexPrompt(
    text("ยังไม่ได้ตั้งรอบเงิน ตั้งค่าในแอปก่อนเริ่มจดนะ", [app()]),
    "มาเริ่มแผนแรกกัน",
    "ตั้งรอบเงิน",
    "/app/setup/income",
  );

const line = (d: Pick<Draft, "title" | "amount" | "category">) =>
  `${d.title} ${baht(d.amount)} บาท (${CATEGORY[d.category]})`;

function budgetLine(b: BudgetResult, spentToday: number): string {
  if (b.kind === "payday-passed")
    return "ถึงวันเงินเข้าแล้ว เงินเข้าหรือยัง? ตั้งรอบใหม่ในแอปได้เลย";
  if (b.kind === "shortfall")
    return `ตอนนี้เงินไม่พอสำหรับบิล ออม และเงินเผื่อ ขาด ${baht(b.shortfall)} บาท`;
  if (b.todayRemaining < 0)
    return `เกินงบวันนี้ ${baht(-b.todayRemaining)} บาท (งบวันนี้ ${baht(b.dailyBudget)})`;
  return `วันนี้ใช้ได้อีก ${baht(b.todayRemaining)} บาท · ใช้ไปแล้ว ${baht(spentToday)} / ${baht(b.dailyBudget)}`;
}

// L2 / L6 after "ยืนยันจ่ายจริง". Once today is over budget, also how much tomorrow gets:
// the overspend comes off the days that are left.
export function recordedMessage(
  d: Draft,
  s: Summary,
  tomorrow: BudgetResult,
  entryId?: string,
) {
  const lines = [`จดแล้ว ✓ ${line(d)}`, budgetLine(s.budget, s.spentToday)];
  if (
    s.budget.kind === "ok" &&
    s.budget.todayRemaining < 0 &&
    tomorrow.kind === "ok"
  ) {
    lines.push(
      `พรุ่งนี้ใช้ได้ ${baht(tomorrow.dailyBudget)} บาท/วัน (เดิม ${baht(s.budget.dailyBudget)})`,
    );
  }
  return flexReceipt(text(lines.join("\n"), [app()]), {
    title: d.title,
    amount: baht(d.amount),
    category: CATEGORY[d.category],
    date: new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeZone: "Asia/Bangkok",
    }).format(new Date(`${s.today}T12:00:00+07:00`)),
    budget: lines.slice(1).join("\n"),
    balance: baht(s.balance),
    entryId,
  });
}

// L6: over what is left today — held until the user says it was really paid
export const holdMessage = (d: Draft, todayRemaining: number): LineMessage =>
  flexActions(
    text(
      `${baht(d.amount)} บาท สูงกว่างบที่เหลือวันนี้ (${baht(todayRemaining)} บาท)\nจ่ายไปแล้ว หรืออยากลองก่อนซื้อ?`,
      [
        payButton(d),
        {
          type: "postback",
          label: "ลองก่อนซื้อ",
          data: draftData("try", d),
          displayText: "ลองก่อนซื้อ",
        },
      ],
    ),
    "ค่อย ๆ คิด ก่อนจ่าย",
  );

export const alreadyMessage = (d: Draft): LineMessage =>
  flexActions(
    text(`รายการนี้จดไว้แล้ว ✓ ${line(d)}`, [app()]),
    "รายการนี้จดไว้แล้ว",
    "budgetOk",
  );

// L6 "ลองก่อนซื้อ": the card 14 try, nothing saved
export function tryMessage(d: Draft, r: SimulateResponse): LineMessage {
  if (r.verdict === "ask") {
    const why = r.needs.includes("payday")
      ? "ถึงวันเงินเข้าแล้ว ตั้งรอบใหม่ก่อน"
      : "ยังไม่รู้ค่ากินค่ารถต่อวัน ตั้งในแอปก่อนนะ";
    return flexActions(
      text(`ลองก่อนซื้อ: ${line(d)}\n${why}`, [app()]),
      "ลองก่อนซื้อ",
    );
  }
  const lines = [`ลองก่อนซื้อ: ${line(d)}`];
  if (r.before?.kind === "ok")
    lines.push(`ไม่ซื้อ → วันละ ${baht(r.before.dailyBudget)} บาท`);
  if (r.after?.kind === "ok")
    lines.push(`ซื้อ → เหลือวันละ ${baht(r.after.dailyBudget)} บาท`);
  if (r.verdict === "ok") lines.push("ค่ากินค่ารถยังพอทุกวัน");
  if (r.verdict === "essentials_short" && r.after?.kind === "ok") {
    lines.push(
      `ค่ากินค่ารถไม่พอ ขาดวันละ ${baht(r.after.essentialShortPerDay ?? 0)} บาท`,
    );
  }
  if (r.verdict === "shortfall" && r.after?.kind === "shortfall")
    lines.push(`เงินไม่พอ ขาด ${baht(r.after.shortfall)} บาท`);
  lines.push("ออมและเงินเผื่อไม่ถูกแตะ");
  return flexActions(
    text(lines.join("\n"), [payButton(d), app()]),
    "ลองแล้ว เป็นแบบนี้",
  );
}

const keepButton = (d: Draft): QuickReplyAction => ({
  type: "postback",
  label: "เก็บไว้ในแผน",
  data: draftData("keep", d),
  displayText: "เก็บไว้ในแผน",
});

// Card 15: the answer first, confirming is a button (today: pay or keep; another day: keep)
export function adviceMessage(a: Advice, key: string): LineMessage {
  if (a.verdict === "ask" || a.amount === null)
    return flexActions(text(a.explanation, [app()]), "ช่วยคิดก่อนจ่าย");
  const d: Draft = {
    title: a.item ?? "รายการ",
    amount: a.amount,
    category: a.category,
    key,
    dueOn: a.dueOn,
  };
  return flexActions(
    text(
      a.explanation,
      a.dueOn === null
        ? [payButton(d), keepButton(d), app()]
        : [keepButton(d), app()],
    ),
    "ช่วยคิดก่อนจ่าย",
  );
}

// L8: kept in the plan — held back, not spent
export function keptMessage(d: Draft, s: Summary): LineMessage {
  const daily =
    s.budget.kind === "ok"
      ? `\nตอนนี้ใช้ได้วันละ ${baht(s.budget.dailyBudget)} บาท`
      : "";
  return flexActions(
    text(
      `เก็บไว้ในแผนแล้ว ✓ ${line(d)}\nยังไม่หักเงินจริง กดจ่ายแล้วในแอปเมื่อจ่ายจริง${daily}`,
      [app()],
    ),
    "เก็บไว้ในแผนแล้ว",
    "saveCoins",
  );
}

// Someone adds the OA as a friend
export const welcomeMessage = () =>
  flexWelcome(
    text(
      "สวัสดีครับ ยินดีต้อนรับสู่พอใช้ 🌱\nจดรายจ่าย พิมพ์ได้เลย เช่น «ข้าว 45»\nถามก่อนจ่าย เช่น «พรุ่งนี้กินชาบู 300 ไหวไหม»\nเริ่มจากตั้งรอบเงินในแอปก่อนนะ",
      [app()],
    ),
  );
