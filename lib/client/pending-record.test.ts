// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingRecord, loadPendingRecord, savePendingRecord } from "./pending-record";

const draft = { type: "expense", amount: 4500, note: "ข้าว", category: "food", spentOn: "2026-11-12" } as const;
const KEY = "porchai.pending_record.v1";

describe("pending record draft", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("round-trips and clears", () => {
    expect(loadPendingRecord()).toBeNull();
    savePendingRecord(draft);
    expect(loadPendingRecord()).toEqual(draft);
    clearPendingRecord();
    expect(loadPendingRecord()).toBeNull();
  });

  it("rejects malformed or tampered data", () => {
    window.sessionStorage.setItem(KEY, "{not json");
    expect(loadPendingRecord()).toBeNull();
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, amount: -5 }));
    expect(loadPendingRecord()).toBeNull();
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, amount: 1.5 }));
    expect(loadPendingRecord()).toBeNull();
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, type: "other" }));
    expect(loadPendingRecord()).toBeNull();
  });
});
