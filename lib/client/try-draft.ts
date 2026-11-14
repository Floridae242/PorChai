import type { Satang } from "@/lib/calc/money";

// The item being tried, handed from C1 (input) to C2 (result) to C3 (decide). Lives in sessionStorage
// only until the user saves, pays, postpones or cancels. Read it after mount (never during render) so
// server and client markup match. There is no default: no draft means "go back to C1".
const KEY = "porchai.try_item.v1";

export interface TryItemDraft {
  title: string;
  amount: Satang;
  dueOn: string | null; // YYYY-MM-DD
  basis?: string; // card 23: basis of the simulate that showed the result; sent when saving the plan
}

export function saveTryDraft(item: TryItemDraft): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(item));
  } catch {
    // storage blocked: the next screen sends the user back to C1
  }
}

export function loadTryDraft(): TryItemDraft | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<TryItemDraft> | null;
    if (
      !d ||
      typeof d.title !== "string" ||
      typeof d.amount !== "number" ||
      !Number.isSafeInteger(d.amount) ||
      d.amount <= 0 ||
      (d.dueOn !== null && typeof d.dueOn !== "string")
    ) {
      return null;
    }
    return {
      title: d.title,
      amount: d.amount,
      dueOn: d.dueOn,
      ...(typeof d.basis === "string" && d.basis ? { basis: d.basis } : {}),
    };
  } catch {
    return null;
  }
}

export function clearTryDraft(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
