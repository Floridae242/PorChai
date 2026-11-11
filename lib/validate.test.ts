import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http";
import { parseBalanceCheck, parseEntryPatch, parseNewEntry } from "@/lib/validate";

const TODAY = "2026-11-11";
const NOW = new Date("2026-11-11T05:00:00Z");

function rejects(fn: () => unknown, field: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(422);
    expect((err as HttpError).message).toContain(field);
    return;
  }
  throw new Error("expected a 422");
}

describe("parseNewEntry", () => {
  it("accepts rice 45 and defaults the date to today", () => {
    expect(parseNewEntry({ amount: 4500, category: "food", note: " ข้าว " }, TODAY)).toEqual({
      amount: 4500,
      category: "food",
      note: "ข้าว",
      spentOn: TODAY,
    });
  });

  it("keeps an earlier date", () => {
    expect(parseNewEntry({ amount: 100, category: "other", spentOn: "2026-11-09" }, TODAY).spentOn).toBe(
      "2026-11-09",
    );
  });

  it.each([0, -100, 45.5, "4500", null, Number.MAX_SAFE_INTEGER + 1])("rejects amount %s", (amount) => {
    rejects(() => parseNewEntry({ amount, category: "food" }, TODAY), "ยอด");
  });

  it.each(["bills", "fun", undefined])("rejects category %s (users pick one of four)", (category) => {
    rejects(() => parseNewEntry({ amount: 100, category }, TODAY), "หมวด");
  });

  it.each(["2026-11-12", "2026-13-01", "2026-02-30", "11/11/2026"])("rejects spentOn %s", (spentOn) => {
    rejects(() => parseNewEntry({ amount: 100, category: "food", spentOn }, TODAY), "วันที่");
  });

  it("rejects a note over 200 characters", () => {
    rejects(() => parseNewEntry({ amount: 100, category: "food", note: "ก".repeat(201) }, TODAY), "บันทึก");
  });

  it("rejects a body that is not an object", () => {
    rejects(() => parseNewEntry([1, 2], TODAY), "ข้อมูล");
  });
});

describe("parseEntryPatch", () => {
  it("keeps only the fields sent", () => {
    expect(parseEntryPatch({ amount: 5000 }, TODAY)).toEqual({ amount: 5000 });
    expect(parseEntryPatch({ note: null }, TODAY)).toEqual({ note: null });
  });

  it("rejects an empty change", () => {
    rejects(() => parseEntryPatch({}, TODAY), "ข้อมูล");
  });

  it("applies the same rules as a new entry", () => {
    rejects(() => parseEntryPatch({ category: "bills" }, TODAY), "หมวด");
    rejects(() => parseEntryPatch({ spentOn: "2026-11-12" }, TODAY), "วันที่");
  });
});

describe("parseBalanceCheck", () => {
  it("accepts a balance with no time (the server uses now)", () => {
    expect(parseBalanceCheck({ balance: 200000 }, NOW)).toEqual({ balance: 200000 });
  });

  it("accepts a past time", () => {
    expect(parseBalanceCheck({ balance: 0, asOf: "2026-11-11T01:10:00Z" }, NOW)).toEqual({
      balance: 0,
      asOf: new Date("2026-11-11T01:10:00Z"),
    });
  });

  it("rejects a negative balance", () => {
    rejects(() => parseBalanceCheck({ balance: -1 }, NOW), "ยอด");
  });

  it("rejects a time in the future or not a time", () => {
    rejects(() => parseBalanceCheck({ balance: 100, asOf: "2026-11-11T06:00:00Z" }, NOW), "เวลา");
    rejects(() => parseBalanceCheck({ balance: 100, asOf: "เมื่อเช้า" }, NOW), "เวลา");
  });
});
