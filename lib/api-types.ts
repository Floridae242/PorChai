// Request/response shapes shared by the API and the LIFF screens.
// Money is integer satang everywhere (100 = 1 baht); dates are YYYY-MM-DD in Thai time.
import type { BudgetResult } from "@/lib/calc/budget";

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

export interface EntryResponse {
  entry: Entry;
  summary: Summary;
}

export interface EntriesResponse {
  entries: Entry[];
}
