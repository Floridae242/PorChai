// Request/response shapes shared by the API and the LIFF screens.
// Money is integer satang everywhere (100 = 1 baht); dates are YYYY-MM-DD in Thai time.
import type { BudgetResult, Missing, TrialVerdict } from "@/lib/calc/budget";

export const USER_CATEGORIES = ["food", "transport", "supplies", "other"] as const;
export type UserCategory = (typeof USER_CATEGORIES)[number];
// 'bills' only appears on entries created by paying a bill
export type Category = UserCategory | "bills";

export interface Entry {
  id: string;
  amount: number;
  category: Category;
  note: string | null;
  spentOn: string;
  source: "chat" | "form" | "plan" | "reminder" | "ocr";
  createdAt: string;
}

export interface Summary {
  today: string;
  payday: string;
  balance: number; // money on hand now
  balanceAsOf: string; // when the user last told us the balance (cycle start or ปรับยอด)
  spentToday: number;
  savings: number;
  emergencyBuffer: number;
  reserved: number; // unpaid bills + plans due by payday
  essentialPerDay: number | null; // null = not set yet: ask before showing spare / purchase limit
  budget: BudgetResult;
}

// POST /api/cycle — W4–W9 setup (see docs/frontend-api.md 3.1)
export interface NewCycleRequest {
  incomeSource: "family" | "side_job" | "other";
  incomeFrequency: "weekly" | "monthly" | "irregular";
  payday: string; // after today
  balance: number;
  balanceAsOf?: string; // ISO; default now
  bills?: { title: string; amount: number; dueOn?: string | null; status?: "unpaid" | "paid" | "separate" }[];
  savingsPercent?: number; // 1–100 of balance; or savingsAmount, not both
  savingsAmount?: number;
  emergencyBuffer?: number;
  essentials?: { food: number; transport: number }; // leave out = not set (ask later)
  flexibleItems?: { title: string; amount: number; dueOn?: string | null }[];
}

// POST /api/entries — also send header `Idempotency-Key` (same key = same spend, saved once)
export interface NewEntryRequest {
  amount: number;
  category: UserCategory;
  note?: string | null;
  spentOn?: string; // default today; never in the future
}

// PATCH /api/entries/:id — any subset of the fields above
export type EditEntryRequest = Partial<NewEntryRequest>;

// POST /api/cycle/balance — "ปรับยอด": the real balance, optionally when it was true
export interface BalanceCheckRequest {
  balance: number;
  asOf?: string; // ISO time; default now
}

// A bill or something to buy. reserved = held back (W15 "เก็บไว้ในแผน") · postponed = next cycle
// ("เลื่อนไปรอบหน้า") · paid = spent once, entryId is that spend · separate = bill paid from other money
export type PlanStatus = "reserved" | "postponed" | "paid" | "cancelled" | "separate";

export interface Plan {
  id: string;
  kind: "bill" | "purchase";
  title: string;
  amount: number;
  dueOn: string | null;
  category: UserCategory | null; // purchases: the category its spend gets when paid (null = other)
  status: PlanStatus;
  entryId: string | null;
  heldThisCycle: boolean; // counted in summary.reserved right now
  createdAt: string;
}

// POST /api/plans — also send header `Idempotency-Key` (double tap = one plan)
export interface NewPlanRequest {
  title: string;
  amount: number;
  kind?: "purchase" | "bill"; // default purchase
  category?: UserCategory; // purchases only
  dueOn?: string | null;
  status?: "reserved" | "postponed"; // default reserved
}

// POST /api/plans/:id/pay — body optional
export interface PayPlanRequest {
  category?: UserCategory; // overrides the plan's; ignored for a bill
}

export interface PlanResponse {
  plan: Plan;
  summary: Summary;
}

export interface PlansResponse {
  plans: Plan[];
}

export interface EntryResponse {
  entry: Entry;
  summary: Summary;
}

export interface EntriesResponse {
  entries: Entry[];
}

// POST /api/simulate — W11–W14 "ลองก่อนจ่าย": nothing is saved
export interface SimulateRequest {
  amount?: number; // the item to try; leave out to only try postponing
  dueOn?: string | null; // after payday = next cycle, changes nothing now (W8)
  postponePlanIds?: string[]; // held plans to try postponing (card 14 / 15 / 23)
  essentials?: { food: number; transport: number }; // just answered, for this try only
  emergencyBuffer?: number; // card 19: try a new buffer (summary screen before confirming)
}

export interface SimulateResponse {
  verdict: TrialVerdict; // ok · essentials_short (W14) · shortfall · ask
  needs: Missing[]; // ask these first: "essentials" (W7) · "payday" (has the money come?)
  before: BudgetResult | null; // null while asking
  after: BudgetResult | null;
  overLimitBy: number | null; // W14 "เกินวงเงิน 100"
  countsThisCycle: boolean; // false = the item is due after payday
  checks: {
    bills: number; // unpaid bills held this cycle
    billsCovered: boolean;
    essentialPerDay: number;
    essentialsCovered: boolean; // W12 "ค่าจำเป็น 70/วัน ยังพอ"
    savings: number; // never touched by a try
    emergencyBuffer: number;
    otherPlans: number; // other held purchases this cycle
  } | null;
}

// PUT /api/cycle/essentials — W7 food + transport a day (also answers needs: ["essentials"])
export interface EssentialsRequest {
  food: number;
  transport: number;
}

// PUT /api/cycle/buffer — card 19: the new buffer, and the one the summary screen showed
export interface BufferRequest {
  amount: number; // the new buffer, not how much to take off (a double tap sets it once)
  previous: number; // summary.emergencyBuffer as shown; changed meanwhile → 409 stale
}
