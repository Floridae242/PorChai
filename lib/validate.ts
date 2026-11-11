import { USER_CATEGORIES, type UserCategory } from "@/lib/api-types";
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

const invalid = (message: string) => new HttpError(422, "invalid_input", message);

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

// A real calendar date (2026-02-30 fails the round trip), not after today
function spentOn(v: unknown, today: string): string {
  const ok =
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!ok) throw invalid("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD");
  if (v > today) throw invalid("วันที่จ่ายต้องไม่เป็นวันในอนาคต");
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
  if (typeof b.balance !== "number" || !Number.isSafeInteger(b.balance) || b.balance < 0) {
    throw invalid("ยอดเงินต้องเป็นจำนวนสตางค์ ไม่ติดลบ");
  }
  if (b.asOf === undefined) return { balance: b.balance };
  const asOf = typeof b.asOf === "string" ? new Date(b.asOf) : new Date(NaN);
  if (Number.isNaN(asOf.getTime()) || asOf > now) throw invalid("เวลาของยอดต้องเป็นเวลาที่ผ่านมาแล้ว");
  return { balance: b.balance, asOf };
}
