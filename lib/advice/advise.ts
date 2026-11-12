import type { SimulateResponse, UserCategory } from "@/lib/api-types";
import type { BudgetResult, TrialVerdict } from "@/lib/calc/budget";
import { addDays, thaiDate } from "@/lib/calc/time";
import { categoryOf } from "@/lib/chat/parse";
import { generate } from "@/lib/ai/gemini";
import { formatBaht } from "@/lib/format/money";
import { listPlans } from "@/lib/db/plans";
import { simulate } from "@/lib/db/simulate";
import { FORBIDDEN, numbersIn, onlyKnownNumbers, readQuestion, type Day, type Question } from "@/lib/advice/question";

// Card 15: «พรุ่งนี้กินชาบู 300 บาทไหวไหม». The AI reads the question and words the answer; every number
// comes from the one calculator (card 14 tries), and an answer with any other number is replaced by
// the template. Nothing is saved: confirming is a separate step (card 57 / 09 buttons).

export type AdviceVerdict = "enough" | "tight" | "short" | "ask"; // เงินพอ · เงินตึง · เงินไม่พอ · ข้อมูลไม่ครบ
export type AdviceNeed = "amount" | "essentials" | "payday";

export type AdviceOption =
  | { kind: "spend_less"; maxAmount: number } // ลดงบ: the most it can cost and still leave the essentials
  | { kind: "postpone"; plans: { id: string; title: string; amount: number }[]; after: BudgetResult; verdict: AdviceVerdict }
  | { kind: "use_buffer"; buffer: number; after: BudgetResult; verdict: AdviceVerdict }; // only if the user allows

export interface Advice {
  verdict: AdviceVerdict;
  needs: AdviceNeed[];
  item: string | null;
  amount: number | null;
  category: UserCategory;
  dueOn: string | null;
  countsThisCycle: boolean;
  before: BudgetResult | null;
  after: BudgetResult | null;
  options: AdviceOption[];
  explanation: string;
  byAI: boolean; // false = the template (AI off, failed, or wrote a number of its own)
  basis: string | null;
}

const VERDICT: Record<TrialVerdict, AdviceVerdict> = {
  ok: "enough",
  essentials_short: "tight",
  shortfall: "short",
  ask: "ask",
};
const RANK: Record<AdviceVerdict, number> = { short: 0, tight: 1, enough: 2, ask: -1 };
const DAY_OFFSET: Record<Day, number> = { today: 0, tomorrow: 1, day_after_tomorrow: 2 };
const DAY_LABEL: Record<Day, string> = { today: "วันนี้", tomorrow: "พรุ่งนี้", day_after_tomorrow: "มะรืน" };

const baht = (satang: number) => Math.round(satang) / 100;
const fmt = (satang: number) => formatBaht(Math.round(satang)); // same as the screens: 61.50

// The AI reads the question (card 15), but only what is written counts: its amount is used only when it is
// the one price written in the question, and the day comes from the words (วันนี้ / พรุ่งนี้ / มะรืน).
// So a misread can make the bot ask, never change a number.
async function read(question: string): Promise<Question> {
  const rules = readQuestion(question);
  const raw = await generate({
    system:
      "แยกข้อมูลจากคำถามเรื่องการใช้เงินของนักศึกษา ตอบเป็น JSON เท่านั้น item = สิ่งที่จะซื้อหรือกินแบบสั้น " +
      "amount_baht = ราคาที่เขียนเป็นตัวเลขในคำถาม (ถ้าไม่มี มีหลายราคา หรือเป็นราคาประมาณ ให้เป็น null)",
    input: question,
    schema: {
      type: "object",
      properties: { item: { type: "string" }, amount_baht: { type: ["number", "null"] } },
      required: ["item", "amount_baht"],
    },
    maxOutputTokens: 100,
  });
  let ai: { item?: unknown; amount_baht?: unknown } | null = null;
  try {
    ai = raw ? JSON.parse(raw) : null;
  } catch {
    ai = null;
  }
  if (!ai || typeof ai !== "object") return rules; // AI off, failed or unreadable: the rules' reading stands
  // The AI and the written price must agree; if not (or it saw no clear price) the bot asks
  const agrees = rules.amount !== null && ai.amount_baht === rules.amount / 100;
  return {
    item: typeof ai.item === "string" && ai.item.trim() ? ai.item.trim().slice(0, 40) : rules.item,
    amount: agrees ? rules.amount : null,
    day: rules.day,
  };
}

function tryWith(userId: string, amount: number, dueOn: string | null, extra: Partial<Parameters<typeof simulate>[1]> = {}) {
  return simulate(userId, {
    amount,
    dueOn,
    postponePlanIds: [],
    essentials: null,
    emergencyBuffer: null,
    payday: null,
    balance: null,
    ...extra,
  });
}

export async function advise(userId: string, question: string, now = new Date()): Promise<Advice> {
  const q = await read(question);
  const category = categoryOf(q.item ?? "");
  const blank = { item: q.item, amount: q.amount, category, before: null, after: null, options: [], basis: null };
  if (q.amount === null) {
    return { ...blank, verdict: "ask", needs: ["amount"], dueOn: null, countsThisCycle: true, explanation: ASK.amount, byAI: false };
  }

  const dueOn = q.day === "today" ? null : addDays(thaiDate(now), DAY_OFFSET[q.day]);
  const base = await tryWith(userId, q.amount, dueOn);
  if (base.verdict === "ask") {
    const needs = base.needs as AdviceNeed[];
    return { ...blank, verdict: "ask", needs, dueOn, countsThisCycle: base.countsThisCycle, explanation: ASK[needs[0]], byAI: false, basis: base.basis };
  }

  const verdict = VERDICT[base.verdict];
  const options = verdict === "enough" ? [] : await optionsFor(userId, q.amount, dueOn, base, verdict);
  const facts = factsOf(q, verdict, base, options);
  const { explanation, byAI } = await explain(facts);
  return {
    ...blank,
    verdict,
    needs: [],
    dueOn,
    countsThisCycle: base.countsThisCycle,
    before: base.before,
    after: base.after,
    options,
    explanation,
    byAI,
    basis: base.basis,
  };
}

// ลดงบ / เลื่อนรายการที่เลื่อนได้ / ขอใช้เงินเผื่อ — never cutting food or transport (card 15)
async function optionsFor(
  userId: string,
  amount: number,
  dueOn: string | null,
  base: SimulateResponse,
  verdict: AdviceVerdict,
): Promise<AdviceOption[]> {
  const options: AdviceOption[] = [];
  if (base.before?.kind === "ok" && (base.before.maxPurchase ?? 0) > 0) {
    options.push({ kind: "spend_less", maxAmount: base.before.maxPurchase! });
  }
  const postponable = (await listPlans(userId)).filter((p) => p.kind === "purchase" && p.heldThisCycle);
  if (postponable.length > 0) {
    const r = await tryWith(userId, amount, dueOn, { postponePlanIds: postponable.map((p) => p.id) });
    const v = VERDICT[r.verdict];
    if (r.after && RANK[v] > RANK[verdict]) {
      options.push({
        kind: "postpone",
        plans: postponable.map((p) => ({ id: p.id, title: p.title, amount: p.amount })),
        after: r.after,
        verdict: v,
      });
    }
  }
  const buffer = base.checks?.emergencyBuffer ?? 0;
  if (buffer > 0) {
    const r = await tryWith(userId, amount, dueOn, { emergencyBuffer: 0 });
    const v = VERDICT[r.verdict];
    if (r.after && RANK[v] > RANK[verdict]) options.push({ kind: "use_buffer", buffer, after: r.after, verdict: v });
  }
  return options;
}

// Everything the answer may say, in baht. The AI gets only this — no LINE id, name or history.
export interface Facts {
  verdict: AdviceVerdict;
  item: string;
  amount: number;
  when: string;
  nextCycle: boolean;
  dailyBefore: number | null;
  dailyAfter: number | null;
  essentialPerDay: number | null;
  shortPerDay: number | null;
  shortfall: number | null;
  options: (
    | { kind: "spend_less"; max: number }
    | { kind: "postpone"; titles: string[]; total: number; dailyAfter: number | null }
    | { kind: "use_buffer"; buffer: number; dailyAfter: number | null }
  )[];
}

const daily = (b: BudgetResult | null) => (b?.kind === "ok" ? baht(b.dailyBudget) : null);

function factsOf(q: Question, verdict: AdviceVerdict, r: SimulateResponse, options: AdviceOption[]): Facts {
  return {
    verdict,
    item: q.item ?? "รายการนี้",
    amount: baht(q.amount!),
    when: DAY_LABEL[q.day],
    nextCycle: !r.countsThisCycle,
    dailyBefore: daily(r.before),
    dailyAfter: daily(r.after),
    essentialPerDay: r.checks ? baht(r.checks.essentialPerDay) : null,
    shortPerDay: r.after?.kind === "ok" ? baht(r.after.essentialShortPerDay ?? 0) : null,
    shortfall: r.after?.kind === "shortfall" ? baht(r.after.shortfall) : null,
    options: options.map((o) =>
      o.kind === "spend_less"
        ? { kind: o.kind, max: baht(o.maxAmount) }
        : o.kind === "postpone"
          ? { kind: o.kind, titles: o.plans.map((p) => p.title), total: baht(o.plans.reduce((s, p) => s + p.amount, 0)), dailyAfter: daily(o.after) }
          : { kind: o.kind, buffer: baht(o.buffer), dailyAfter: daily(o.after) },
    ),
  };
}

function knownNumbers(f: Facts): number[] {
  const n = [f.amount, f.dailyBefore, f.dailyAfter, f.essentialPerDay, f.shortPerDay, f.shortfall];
  for (const o of f.options) {
    if (o.kind === "spend_less") n.push(o.max);
    else if (o.kind === "postpone") n.push(o.total, o.dailyAfter);
    else n.push(o.buffer, o.dailyAfter);
  }
  return n.filter((x): x is number => x !== null);
}

// The AI words it; the answer is used only if it keeps to the given numbers, says the shortfall when
// there is one, and never suggests cutting food or transport. Otherwise the template.
async function explain(f: Facts): Promise<{ explanation: string; byAI: boolean }> {
  const template = templateFor(f);
  const text = await generate({
    system:
      "คุณคือ 'พอใช้' ผู้ช่วยเงินของนักศึกษา เป็นผู้ชาย ตอบภาษาไทย เป็นกันเอง สุภาพ ลงท้ายด้วย ครับ ห้ามใช้ ค่ะ คะ จ้า ไม่เกิน 5 บรรทัด จากข้อมูล JSON ที่ให้เท่านั้น " +
      "verdict: enough=ไหว, tight=ตึง (จ่ายได้แต่ค่ากินค่ารถต่อวันไม่พอ), short=ไม่พอ (บอกยอดที่ขาด). " +
      "ใช้เฉพาะตัวเลขที่อยู่ในข้อมูล ห้ามคำนวณหรือปัดเลขเอง ห้ามแนะนำให้ลดค่ากินหรือค่าเดินทาง ห้ามแนะนำใช้เงินออม " +
      "ทางเลือกใช้เงินเผื่อต้องบอกว่าต้องให้ผู้ใช้อนุญาตก่อน ไม่ต้องใส่หัวข้อหรือ markdown",
    input: JSON.stringify(f),
    maxOutputTokens: 300,
  });
  const ok =
    text !== null &&
    text.length <= 600 &&
    onlyKnownNumbers(text, knownNumbers(f)) &&
    !FORBIDDEN.test(text) &&
    (f.shortfall === null || numbersIn(text).includes(f.shortfall));
  return ok ? { explanation: text.trim(), byAI: true } : { explanation: template, byAI: false };
}

const ASK: Record<AdviceNeed, string> = {
  amount: "อยากซื้ออะไร ราคาเท่าไร? ถามแบบนี้ได้เลย «พรุ่งนี้กินชาบู 300 ไหวไหม»",
  essentials: "ยังไม่รู้ค่ากินค่ารถต่อวัน ตั้งในแอปก่อน แล้วถามใหม่ได้เลย จะได้ตอบไม่ผิด",
  payday: "ถึงวันเงินเข้าแล้ว เงินเข้าหรือยัง? ตั้งรอบใหม่ในแอปก่อน แล้วถามใหม่ได้เลย",
};

const n = (x: number | null) => (x === null ? "-" : fmt(x * 100));

export function templateFor(f: Facts): string {
  const head = `${f.item} ${n(f.amount)} บาท (${f.when})`;
  const lines: string[] = [];
  if (f.nextCycle) lines.push(`ไหว ✓ ${head}\nวันนั้นเงินเข้าแล้ว นับในรอบหน้า งบรอบนี้ไม่เปลี่ยน`);
  else if (f.verdict === "enough") {
    lines.push(`ไหว ✓ ${head}`, `งบต่อวันจาก ${n(f.dailyBefore)} เหลือ ${n(f.dailyAfter)} บาท ค่ากินค่ารถ ${n(f.essentialPerDay)}/วัน ยังพอทุกวัน`);
  } else if (f.verdict === "tight") {
    lines.push(`ตึงหน่อย ⚠ ${head}`, `ถ้าจ่าย งบต่อวันเหลือ ${n(f.dailyAfter)} บาท ต่ำกว่าค่ากินค่ารถ ${n(f.essentialPerDay)}/วัน (ขาดวันละ ${n(f.shortPerDay)})`);
  } else {
    lines.push(`ไม่พอ ✗ ${head}`, `ขาด ${n(f.shortfall)} บาท (ไม่นับเงินที่จะเข้าทีหลัง)`);
  }
  if (f.options.length > 0) lines.push("ทางเลือก:");
  for (const o of f.options) {
    if (o.kind === "spend_less") lines.push(`• ลดงบ: ไม่เกิน ${n(o.max)} บาท ค่ากินค่ารถยังพอทุกวัน`);
    if (o.kind === "postpone") lines.push(`• เลื่อน ${o.titles.join(", ")} (${n(o.total)} บาท) ไปรอบหน้า: งบวันละ ${n(o.dailyAfter)}`);
    if (o.kind === "use_buffer") lines.push(`• ถ้าอนุญาตใช้เงินเผื่อ ${n(o.buffer)} บาท: งบวันละ ${n(o.dailyAfter)}`);
  }
  if (!f.nextCycle) lines.push("ออมและเงินเผื่อยังไม่ถูกแตะ จนกว่าจะยืนยัน");
  return lines.join("\n");
}
