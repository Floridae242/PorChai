import type { NewCycleRequest } from "@/lib/api-types";
import { computeBudget, type BudgetResult } from "@/lib/calc/budget";
import { reservedTotal, savingsFromPercent } from "@/lib/calc/inputs";
import type { Satang } from "@/lib/calc/money";
import { addDays } from "@/lib/calc/time";
import { CYCLE_DAYS, DEFAULT_CYCLE, DEFAULT_TODAY } from "./mock-fixtures";

export type BillStatus = "unpaid" | "paid" | "separate";

export interface DraftBill {
  id: string;
  title: string;
  amount: Satang;
  status: BillStatus;
}

export interface SetupDraft {
  incomeSource: "family" | "side_job" | "other";
  incomeFrequency: "monthly" | "weekly" | "irregular";
  payday: string;
  balance: Satang;
  bills: DraftBill[];
  savingsMode: "percent" | "amount" | "none";
  savingsPercent: number;
  savingsAmount: Satang;
  emergencyBuffer: Satang;
  essentialPerDay: Satang | null;
  essentialNote: string;
  savedStep: string | null;
}

export const SETUP_DRAFT_KEY = "porchai.setup_draft.v1";

export function createDefaultSetupDraft(today: string = DEFAULT_TODAY): SetupDraft {
  return {
    incomeSource: "family",
    incomeFrequency: "monthly",
    payday: addDays(today, CYCLE_DAYS),
    balance: DEFAULT_CYCLE.balance,
    bills: DEFAULT_CYCLE.bills.map((b, idx) => ({
      id: `draft-bill-${idx + 1}`,
      title: b.title,
      amount: b.amount,
      status: "unpaid",
    })),
    savingsMode: "percent",
    savingsPercent: 10,
    savingsAmount: DEFAULT_CYCLE.savings,
    emergencyBuffer: DEFAULT_CYCLE.emergencyBuffer,
    essentialPerDay: DEFAULT_CYCLE.essentialPerDay,
    essentialNote: "ค่าข้าว + ค่ารถ",
    savedStep: null,
  };
}

export function loadSetupDraft(today: string = DEFAULT_TODAY): SetupDraft {
  const fallback = createDefaultSetupDraft(today);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(SETUP_DRAFT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SetupDraft>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
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

export interface SetupPreview {
  unpaidBillsTotal: Satang;
  savingsSatang: Satang;
  percentOptions: { p10: Satang; p20: Satang; p30: Satang };
  budget: BudgetResult;
}

export function previewSetupDraft(draft: SetupDraft, today: string = DEFAULT_TODAY): SetupPreview {
  const unpaidBillsTotal = reservedTotal(
    draft.bills.map((b) => ({
      amount: b.amount,
      status: b.status === "unpaid" ? "reserved" : b.status,
      dueOn: null,
    })),
    draft.payday,
  );
  const savingsSatang =
    draft.savingsMode === "none"
      ? 0
      : draft.savingsMode === "percent"
        ? savingsFromPercent(draft.balance, draft.savingsPercent)
        : draft.savingsAmount;

  const budget = computeBudget({
    balance: draft.balance,
    spentToday: 0,
    emergencyBuffer: draft.emergencyBuffer,
    savings: savingsSatang,
    reserved: unpaidBillsTotal,
    essentialPerDay: draft.essentialPerDay,
    today,
    payday: draft.payday,
  });

  return {
    unpaidBillsTotal,
    savingsSatang,
    percentOptions: {
      p10: savingsFromPercent(draft.balance, 10),
      p20: savingsFromPercent(draft.balance, 20),
      p30: savingsFromPercent(draft.balance, 30),
    },
    budget,
  };
}

export function draftToNewCycleRequest(draft: SetupDraft): NewCycleRequest {
  const req: NewCycleRequest = {
    incomeSource: draft.incomeSource,
    incomeFrequency: draft.incomeFrequency,
    payday: draft.payday,
    balance: draft.balance,
    bills: draft.bills.map((b) => ({
      title: b.title,
      amount: b.amount,
      status: b.status,
    })),
    emergencyBuffer: draft.emergencyBuffer,
  };
  if (draft.savingsMode === "percent" && draft.savingsPercent > 0) {
    req.savingsPercent = draft.savingsPercent;
  } else if (draft.savingsMode === "amount" && draft.savingsAmount > 0) {
    req.savingsAmount = draft.savingsAmount;
  }
  if (draft.essentialPerDay !== null && draft.essentialPerDay > 0) {
    req.essentials = { food: draft.essentialPerDay, transport: 0 };
  }
  return req;
}
