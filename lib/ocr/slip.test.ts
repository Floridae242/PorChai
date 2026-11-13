import { describe, expect, it } from "vitest";
import { slipFrom } from "@/lib/ocr/slip";

// OCR (layer 4): the AI reads a slip; the code keeps only what is sane. Nothing here records anything —
// the user confirms the draft card first (user's choice 13 Nov).

const TODAY = "2026-11-13";
const read = (o: object) => slipFrom(o, TODAY);

describe("slipFrom — guards on what the AI read", () => {
  it("a clear payment slip: ร้าน · ยอด · วันที่", () => {
    expect(read({ is_slip: true, kind: "expense", merchant: "ร้านข้าวมันไก่", amount_baht: 45, candidates_baht: [], date: "2026-11-13" })).toEqual({
      kind: "expense",
      merchant: "ร้านข้าวมันไก่",
      amount: 4500,
      candidates: [],
      date: "2026-11-13",
    });
  });

  it("not a slip, no amount, or nonsense → null (the bot asks to type it)", () => {
    expect(read({ is_slip: false, kind: "expense", merchant: "x", amount_baht: 45, date: TODAY })).toBeNull();
    expect(read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: null, candidates_baht: [], date: TODAY })).toBeNull();
    expect(read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: -5, candidates_baht: [], date: TODAY })).toBeNull();
    expect(read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: 200000, candidates_baht: [], date: TODAY })).toBeNull();
    expect(slipFrom(null, TODAY)).toBeNull();
    expect(slipFrom("text", TODAY)).toBeNull();
  });

  it("satang are kept exactly: 1,234.50 → 123450", () => {
    expect(read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: 1234.5, candidates_baht: [], date: TODAY })?.amount).toBe(123450);
  });

  it("several amounts (subtotal, total, change): the best guess first, the others as choices — no duplicates, no nonsense", () => {
    const r = read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: 120, candidates_baht: [120, 100, -1, 20, 100, 9999999], date: TODAY });
    expect(r).toMatchObject({ amount: 12000, candidates: [12000, 10000, 2000] });
  });

  it("no main amount but choices: the first choice, the user picks", () => {
    expect(read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: null, candidates_baht: [80, 100], date: TODAY })).toMatchObject({
      amount: 8000,
      candidates: [8000, 10000],
    });
  });

  it("a date in the future, too old or unreadable is today (the user sees it on the card)", () => {
    for (const date of ["2026-11-14", "2026-09-01", "13/11/2569", null, "2026-02-30"]) {
      expect(read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: 45, candidates_baht: [], date })?.date, String(date)).toBe(TODAY);
    }
    expect(read({ is_slip: true, kind: "expense", merchant: "x", amount_baht: 45, candidates_baht: [], date: "2026-11-01" })?.date).toBe("2026-11-01");
  });

  it("kind: expense / income / transfer; anything else is unknown (the card asks)", () => {
    for (const kind of ["expense", "income", "transfer"]) expect(read({ is_slip: true, kind, merchant: "x", amount_baht: 45, date: TODAY })?.kind).toBe(kind);
    expect(read({ is_slip: true, kind: "refund", merchant: "x", amount_baht: 45, date: TODAY })?.kind).toBe("unknown");
  });

  it("the merchant is short, and a placeholder when missing", () => {
    expect(read({ is_slip: true, kind: "expense", merchant: "ก".repeat(80), amount_baht: 45, date: TODAY })?.merchant).toHaveLength(40);
    expect(read({ is_slip: true, kind: "expense", merchant: "  ", amount_baht: 45, date: TODAY })?.merchant).toBe("สลิป");
  });
});
