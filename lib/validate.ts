import { USER_CATEGORIES, type UserCategory } from "@/lib/api-types";
import { savingsFromPercent, setAsideFits } from "@/lib/calc/inputs";
import { HttpError } from "@/lib/http";

// Input checks for the API. Each failure is a 422 with a Thai message naming the field.

export interface NewEntry {
  amount: number;
  category: UserCategory;
  note: string | null;
  spentOn: string;
}

export type EntryPatch = Partial<NewEntry>;

export interface BalanceCheck {
  balance: number;
  asOf?: Date;
}

export const invalid = (message: string) => new HttpError(422, "invalid_input", message);
export const SET_ASIDE_OVER = "เงินออมรวมเงินเผื่อเกินเงินที่มี";

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  return body as Record<string, unknown>;
}

function amount(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) {
    throw invalid("ยอดเงินต้องเป็นจำนวนสตางค์ที่มากกว่า 0");
  }
  return v;
}

function category(v: unknown): UserCategory {
  if (!USER_CATEGORIES.includes(v as UserCategory)) {
    throw invalid("หมวดต้องเป็น อาหาร เดินทาง ของใช้ หรืออื่น ๆ");
  }
  return v as UserCategory;
}

function note(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.trim().length > 200) throw invalid("บันทึกต้องเป็นข้อความไม่เกิน 200 ตัวอักษร");
  return v.trim() || null;
}

// A real calendar date (2026-02-30 fails the round trip)
function isoDate(v: unknown): string {
  const ok =
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!ok) throw invalid("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD");
  return v as string;
}

function spentOn(v: unknown, today: string): string {
  const date = isoDate(v);
  if (date > today) throw invalid("วันที่จ่ายต้องไม่เป็นวันในอนาคต");
  return date;
}

// A past (or now) instant, e.g. when a balance was read
function pastTime(v: unknown, now: Date): Date {
  const t = typeof v === "string" ? new Date(v) : new Date(NaN);
  if (Number.isNaN(t.getTime()) || t > now) throw invalid("เวลาของยอดต้องเป็นเวลาที่ผ่านมาแล้ว");
  return t;
}

function nonNegative(v: unknown, message: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw invalid(message);
  return v;
}

export function parseNewEntry(body: unknown, today: string): NewEntry {
  const b = asObject(body);
  return {
    amount: amount(b.amount),
    category: category(b.category),
    note: note(b.note),
    spentOn: b.spentOn === undefined ? today : spentOn(b.spentOn, today),
  };
}

export function parseEntryPatch(body: unknown, today: string): EntryPatch {
  const b = asObject(body);
  const patch: EntryPatch = {};
  if ("amount" in b) patch.amount = amount(b.amount);
  if ("category" in b) patch.category = category(b.category);
  if ("note" in b) patch.note = note(b.note);
  if ("spentOn" in b) patch.spentOn = spentOn(b.spentOn, today);
  if (Object.keys(patch).length === 0) throw invalid("ข้อมูลที่ส่งมาไม่มีสิ่งที่จะแก้");
  return patch;
}

export function parseBalanceCheck(body: unknown, now: Date): BalanceCheck {
  const b = asObject(body);
  const balance = nonNegative(b.balance, "ยอดเงินต้องเป็นจำนวนสตางค์ ไม่ติดลบ");
  if (b.asOf === undefined) return { balance };
  return { balance, asOf: pastTime(b.asOf, now) };
}

const INCOME_SOURCES = ["family", "side_job", "other"] as const;
const INCOME_FREQUENCIES = ["weekly", "monthly", "irregular"] as const;
const BILL_STATUS = { unpaid: "reserved", paid: "paid", separate: "separate" } as const;
const MAX_ITEMS = 20;

export interface NewPlan {
  kind: "bill" | "purchase";
  title: string;
  amount: number;
  dueOn: string | null;
  status: "reserved" | "paid" | "separate";
}

export interface NewCycle {
  incomeSource: (typeof INCOME_SOURCES)[number];
  incomeFrequency: (typeof INCOME_FREQUENCIES)[number];
  payday: string;
  balance: number;
  balanceAsOf: Date | undefined; // undefined = database now()
  savingsAmount: number; // frozen at cycle start
  savingsPercent: number | null; // how the user chose it; null = own amount
  emergencyBuffer: number;
  essentials: { food: number; transport: number } | null; // null = not set, ask later
  plans: NewPlan[];
}

function list(v: unknown, what: string): Record<string, unknown>[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw invalid(`${what}ต้องเป็นรายการ`);
  if (v.length > MAX_ITEMS) throw invalid(`${what}ใส่ได้ไม่เกิน ${MAX_ITEMS} รายการ`);
  return v.map(asObject);
}

function planTitle(v: unknown): string {
  if (typeof v !== "string" || !v.trim() || v.trim().length > 100) throw invalid("ชื่อรายการต้องมี 1–100 ตัวอักษร");
  return v.trim();
}

// W4–W9 setup. Savings and buffer are set aside from the start, so together they cannot exceed the money on hand (card 19).
export function parseNewCycle(body: unknown, today: string, now: Date): NewCycle {
  const b = asObject(body);
  if (!INCOME_SOURCES.includes(b.incomeSource as NewCycle["incomeSource"])) {
    throw invalid("แหล่งเงินต้องเป็น เงินจากบ้าน/ทุน งานพิเศษ หรืออื่น ๆ");
  }
  if (!INCOME_FREQUENCIES.includes(b.incomeFrequency as NewCycle["incomeFrequency"])) {
    throw invalid("ความถี่เงินเข้าต้องเป็น รายสัปดาห์ รายเดือน หรือไม่แน่นอน");
  }
  const payday = isoDate(b.payday);
  if (payday <= today) throw invalid("วันเงินเข้าต้องเป็นวันหลังวันนี้");
  const balance = nonNegative(b.balance, "ยอดเงินต้องเป็นจำนวนสตางค์ ไม่ติดลบ");

  if (b.savingsPercent !== undefined && b.savingsAmount !== undefined) {
    throw invalid("เป้าออมเลือกได้แบบเดียว: เปอร์เซ็นต์ หรือจำนวนบาท");
  }
  let savingsPercent: number | null = null;
  let savingsAmount = 0;
  if (b.savingsPercent !== undefined) {
    const pct = b.savingsPercent;
    if (typeof pct !== "number" || !Number.isInteger(pct) || pct < 1 || pct > 100) {
      throw invalid("เป้าออมเป็นเปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100");
    }
    savingsPercent = pct;
    savingsAmount = savingsFromPercent(balance, pct);
  } else if (b.savingsAmount !== undefined) {
    savingsAmount = nonNegative(b.savingsAmount, "เป้าออมต้องเป็นจำนวนสตางค์ ไม่ติดลบ");
  }

  const emergencyBuffer =
    b.emergencyBuffer === undefined ? 0 : nonNegative(b.emergencyBuffer, "เงินเผื่อต้องเป็นจำนวนสตางค์ ไม่ติดลบ");
  if (!setAsideFits(balance, savingsAmount, emergencyBuffer)) throw invalid(SET_ASIDE_OVER);

  const essentials = b.essentials === undefined || b.essentials === null ? null : parseEssentials(b.essentials);

  const bills: NewPlan[] = list(b.bills, "บิล").map((x) => {
    const status = x.status === undefined ? "unpaid" : x.status;
    if (!(typeof status === "string" && Object.hasOwn(BILL_STATUS, status))) {
      throw invalid("สถานะบิลต้องเป็น ยังไม่จ่าย จ่ายแล้ว หรือจ่ายแยก");
    }
    return {
      kind: "bill",
      title: planTitle(x.title),
      amount: amount(x.amount),
      dueOn: x.dueOn === undefined || x.dueOn === null ? null : isoDate(x.dueOn),
      status: BILL_STATUS[status as keyof typeof BILL_STATUS],
    };
  });
  const items: NewPlan[] = list(b.flexibleItems, "รายการที่เลื่อนได้").map((x) => ({
    kind: "purchase",
    title: planTitle(x.title),
    amount: amount(x.amount),
    dueOn: x.dueOn === undefined || x.dueOn === null ? null : isoDate(x.dueOn),
    status: "reserved",
  }));

  return {
    incomeSource: b.incomeSource as NewCycle["incomeSource"],
    incomeFrequency: b.incomeFrequency as NewCycle["incomeFrequency"],
    payday,
    balance,
    balanceAsOf: b.balanceAsOf === undefined ? undefined : pastTime(b.balanceAsOf, now),
    savingsAmount,
    savingsPercent,
    emergencyBuffer,
    essentials,
    plans: [...bills, ...items],
  };
}

// POST /api/plans — W15 "เก็บไว้ในแผน" (reserved) or "เลื่อนไปรอบหน้า" (postponed)
export interface PlanRequest {
  kind: "bill" | "purchase";
  title: string;
  amount: number;
  dueOn: string | null;
  category: UserCategory | null; // purchases only; null = 'other' when paid
  status: "reserved" | "postponed";
}

const PLAN_KINDS = ["purchase", "bill"] as const;
const NEW_PLAN_STATUS = ["reserved", "postponed"] as const;

export function parseNewPlan(body: unknown): PlanRequest {
  const b = asObject(body);
  const kind = b.kind === undefined ? "purchase" : b.kind;
  if (!PLAN_KINDS.includes(kind as PlanRequest["kind"])) throw invalid("ชนิดแผนต้องเป็น ของที่จะซื้อ หรือบิล");
  const status = b.status === undefined ? "reserved" : b.status;
  if (!NEW_PLAN_STATUS.includes(status as PlanRequest["status"])) {
    throw invalid("สถานะแผนใหม่ต้องเป็น เก็บไว้ในแผน หรือเลื่อนไปรอบหน้า");
  }
  const hasCategory = b.category !== undefined && b.category !== null;
  if (kind === "bill" && hasCategory) throw invalid("บิลจ่ายเข้าหมวดบิลเสมอ ไม่ต้องเลือกหมวด");
  return {
    kind: kind as PlanRequest["kind"],
    title: planTitle(b.title),
    amount: amount(b.amount),
    dueOn: b.dueOn === undefined || b.dueOn === null ? null : isoDate(b.dueOn),
    category: hasCategory ? category(b.category) : null,
    status: status as PlanRequest["status"],
  };
}

// POST /api/plans/:id/pay — the category for a purchase (a bill always goes to 'bills')
export function parsePayPlan(body: unknown): { category: UserCategory | null } {
  const b = asObject(body);
  return { category: b.category === undefined || b.category === null ? null : category(b.category) };
}

export interface Essentials {
  food: number;
  transport: number;
}

// W7 food + transport a day: both or neither (PUT /api/cycle/essentials, setup, a try)
export function parseEssentials(body: unknown): Essentials {
  const e = asObject(body);
  if (e.food === undefined || e.transport === undefined) throw invalid("ค่ากินและค่าเดินทางต่อวันต้องใส่ทั้งคู่");
  return {
    food: nonNegative(e.food, "ค่ากินต่อวันต้องเป็นจำนวนสตางค์ ไม่ติดลบ"),
    transport: nonNegative(e.transport, "ค่าเดินทางต่อวันต้องเป็นจำนวนสตางค์ ไม่ติดลบ"),
  };
}

// POST /api/simulate — try an item and/or postponing held plans; nothing is saved
export interface Trial {
  amount: number; // 0 = no item, only postponing
  dueOn: string | null;
  postponePlanIds: string[];
  essentials: Essentials | null; // answered for this try only (null = use the cycle's)
  emergencyBuffer: number | null; // card 19: try a new buffer (null = keep the cycle's)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTrial(body: unknown): Trial {
  const b = asObject(body);
  const ids = b.postponePlanIds === undefined ? [] : b.postponePlanIds;
  if (!Array.isArray(ids)) throw invalid("แผนที่จะลองเลื่อนต้องเป็นรายการ");
  if (ids.length > MAX_ITEMS) throw invalid(`แผนที่จะลองเลื่อนใส่ได้ไม่เกิน ${MAX_ITEMS} รายการ`);
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) throw invalid("รหัสแผนที่จะลองเลื่อนไม่ถูกต้อง");
  if (b.amount === undefined && ids.length === 0 && b.emergencyBuffer === undefined) {
    throw invalid("ใส่ราคาของที่จะลอง แผนที่จะลองเลื่อน หรือเงินเผื่อที่จะลอง");
  }
  return {
    amount: b.amount === undefined ? 0 : amount(b.amount),
    dueOn: b.dueOn === undefined || b.dueOn === null ? null : isoDate(b.dueOn),
    postponePlanIds: [...new Set(ids as string[])],
    essentials: b.essentials === undefined || b.essentials === null ? null : parseEssentials(b.essentials),
    emergencyBuffer:
      b.emergencyBuffer === undefined || b.emergencyBuffer === null
        ? null
        : nonNegative(b.emergencyBuffer, "เงินเผื่อต้องเป็นจำนวนสตางค์ ไม่ติดลบ"),
  };
}

// PUT /api/cycle/buffer — card 19. `previous` is the buffer the summary screen showed,
// so a change made meanwhile on another screen is never silently overwritten.
export interface BufferChange {
  amount: number;
  previous: number;
}

export function parseBufferChange(body: unknown): BufferChange {
  const b = asObject(body);
  return {
    amount: nonNegative(b.amount, "เงินเผื่อต้องเป็นจำนวนสตางค์ ไม่ติดลบ"),
    previous: nonNegative(b.previous, "ต้องส่งค่าเดิมของเงินเผื่อที่เห็นบนหน้าจอ"),
  };
}
