import type { NewCycleRequest } from "@/lib/api-types";
import { computeBudget, type BudgetResult } from "@/lib/calc/budget";
import { reservedTotal, savingsFromPercent } from "@/lib/calc/inputs";
import type { Satang } from "@/lib/calc/money";
import { essentialsFromDaily } from "./essentials";

export type BillStatus = "unpaid" | "paid" | "separate";

export interface DraftBill {
  id: string;
  title: string;
  amount: Satang;
  status: BillStatus;
}

// Every field starts EMPTY (null / "" / []): a new user sees no invented numbers, and nothing is
// pre-selected. null means "not answered yet", never a default.
export interface SetupDraft {
  incomeSource: "family" | "side_job" | "other" | null;
  incomeFrequency: "monthly" | "weekly" | "irregular" | null;
  payday: string; // YYYY-MM-DD, "" = not chosen
  balance: Satang | null;
  bills: DraftBill[];
  savingsMode: "percent" | "amount" | "none" | null;
  savingsPercent: number | null;
  savingsAmount: Satang | null;
  emergencyBuffer: Satang | null;
  essentialPerDay: Satang | null; // optional: null = the user has not said
  essentialNote: string;
  savedStep: string | null;
}

export const SETUP_DRAFT_KEY = "porchai.setup_draft.v1";

export function createEmptySetupDraft(): SetupDraft {
  return {
    incomeSource: null,
    incomeFrequency: null,
    payday: "",
    balance: null,
    bills: [],
    savingsMode: null,
    savingsPercent: null,
    savingsAmount: null,
    emergencyBuffer: null,
    essentialPerDay: null,
    essentialNote: "",
    savedStep: null,
  };
}

// Browser only: call from an effect after mount, never from a state initializer (hydration).
export function loadSetupDraft(): SetupDraft {
  const empty = createEmptySetupDraft();
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(SETUP_DRAFT_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SetupDraft>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export function saveSetupDraft(draft: SetupDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETUP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage errors
  }
}

export function clearSetupDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SETUP_DRAFT_KEY);
  } catch {
    // ignore storage errors
  }
}

// Thai names of what the review (A4) still needs; empty = complete enough to compute.
export function missingDraftFields(draft: SetupDraft): string[] {
  const missing: string[] = [];
  if (draft.incomeSource === null || draft.incomeFrequency === null) missing.push("แหล่งเงินและความถี่ที่เงินเข้า");
  if (!draft.payday) missing.push("วันเงินเข้า");
  if (draft.balance === null) missing.push("เงินที่มีตอนนี้");
  if (
    draft.savingsMode === null ||
    (draft.savingsMode === "percent" && draft.savingsPercent === null) ||
    (draft.savingsMode === "amount" && draft.savingsAmount === null)
  ) {
    missing.push("เป้าออม");
  }
  if (draft.emergencyBuffer === null) missing.push("เงินเผื่อ");
  return missing;
}

// Bills held back this cycle (only "unpaid" ones count).
export function unpaidBillsTotal(draft: SetupDraft): Satang {
  return reservedTotal(
    draft.bills.map((b) => ({
      amount: b.amount,
      status: b.status === "unpaid" ? "reserved" : b.status,
      dueOn: null,
    })),
    draft.payday,
  );
}

export function savingsSatangOf(draft: SetupDraft): Satang {
  if (draft.savingsMode === "percent" && draft.savingsPercent !== null && draft.balance !== null) {
    return savingsFromPercent(draft.balance, draft.savingsPercent);
  }
  if (draft.savingsMode === "amount") return draft.savingsAmount ?? 0;
  return 0;
}

// 10/20/30 % of the balance for the savings chips; null until a balance is known.
export function percentOptionsOf(balance: Satang | null): { p10: Satang; p20: Satang; p30: Satang } | null {
  if (balance === null) return null;
  return {
    p10: savingsFromPercent(balance, 10),
    p20: savingsFromPercent(balance, 20),
    p30: savingsFromPercent(balance, 30),
  };
}

export interface SetupPreview {
  unpaidBillsTotal: Satang;
  savingsSatang: Satang;
  budget: BudgetResult;
}

// null while the draft is incomplete: never a number built from invented values.
export function previewSetupDraft(draft: SetupDraft, today: string): SetupPreview | null {
  if (missingDraftFields(draft).length > 0 || draft.balance === null || draft.emergencyBuffer === null) {
    return null;
  }
  const billsTotal = unpaidBillsTotal(draft);
  const savingsSatang = savingsSatangOf(draft);
  const budget = computeBudget({
    balance: draft.balance,
    spentToday: 0,
    emergencyBuffer: draft.emergencyBuffer,
    savings: savingsSatang,
    reserved: billsTotal,
    essentialPerDay: draft.essentialPerDay,
    today,
    payday: draft.payday,
  });
  return { unpaidBillsTotal: billsTotal, savingsSatang, budget };
}

// Callers must check missingDraftFields(draft) is empty first.
export function draftToNewCycleRequest(draft: SetupDraft): NewCycleRequest {
  if (
    missingDraftFields(draft).length > 0 ||
    draft.incomeSource === null ||
    draft.incomeFrequency === null ||
    draft.balance === null
  ) {
    throw new Error("setup draft is incomplete");
  }
  const req: NewCycleRequest = {
    incomeSource: draft.incomeSource,
    incomeFrequency: draft.incomeFrequency,
    payday: draft.payday,
    balance: draft.balance,
    bills: draft.bills.map((b) => ({ title: b.title, amount: b.amount, status: b.status })),
    emergencyBuffer: draft.emergencyBuffer ?? 0,
  };
  if (draft.savingsMode === "percent" && draft.savingsPercent) {
    req.savingsPercent = draft.savingsPercent;
  } else if (draft.savingsMode === "amount" && draft.savingsAmount) {
    req.savingsAmount = draft.savingsAmount;
  }
  if (draft.essentialPerDay !== null && draft.essentialPerDay > 0) {
    req.essentials = essentialsFromDaily(draft.essentialPerDay); // backend gap #2: see essentials.ts
  }
  return req;
}
