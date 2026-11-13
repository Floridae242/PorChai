import type { UserCategory } from "@/lib/api-types";

// Draft handed from D1 (new record) to D2 (link to plan). Lives in sessionStorage only until the
// record is saved. Read it after mount (never during render) so server and client markup match.
const KEY = "porchai.pending_record.v1";

export interface PendingRecordDraft {
  type: "expense" | "income";
  amount: number; // satang
  note: string;
  category: UserCategory;
  spentOn: string; // YYYY-MM-DD
}

export function savePendingRecord(draft: PendingRecordDraft): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // storage blocked: D2 will send the user back to D1
  }
}

export function loadPendingRecord(): PendingRecordDraft | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PendingRecordDraft> | null;
    if (
      !d ||
      (d.type !== "expense" && d.type !== "income") ||
      typeof d.amount !== "number" ||
      !Number.isSafeInteger(d.amount) ||
      d.amount <= 0 ||
      typeof d.note !== "string" ||
      typeof d.category !== "string" ||
      typeof d.spentOn !== "string"
    ) {
      return null;
    }
    return d as PendingRecordDraft;
  } catch {
    return null;
  }
}

export function clearPendingRecord(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
