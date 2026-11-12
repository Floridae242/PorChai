// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearAllClaimedCodes, clearClaimedCode, loadClaimedCode, saveClaimedCode } from "./claimed-code";

beforeEach(() => window.sessionStorage.clear());

describe("claimed-code", () => {
  it("is empty until saved, per promo id, and round-trips", () => {
    expect(loadClaimedCode("a")).toBeNull();
    saveClaimedCode("a", { code: "PC-AAAA", expiresAt: "2026-12-01" });
    expect(loadClaimedCode("a")).toEqual({ code: "PC-AAAA", expiresAt: "2026-12-01" });
    expect(loadClaimedCode("b")).toBeNull();
  });

  it("rejects tampered or unreadable data", () => {
    window.sessionStorage.setItem("porchai.claimed_code.v1.a", JSON.stringify({ code: "", expiresAt: "x" }));
    expect(loadClaimedCode("a")).toBeNull();
    window.sessionStorage.setItem("porchai.claimed_code.v1.a", "{oops");
    expect(loadClaimedCode("a")).toBeNull();
  });

  it("clears one or all claims", () => {
    saveClaimedCode("a", { code: "PC-AAAA", expiresAt: "x" });
    saveClaimedCode("b", { code: "PC-BBBB", expiresAt: "x" });
    window.sessionStorage.setItem("other", "keep");
    clearClaimedCode("a");
    expect(loadClaimedCode("a")).toBeNull();
    expect(loadClaimedCode("b")).not.toBeNull();
    clearAllClaimedCodes();
    expect(loadClaimedCode("b")).toBeNull();
    expect(window.sessionStorage.getItem("other")).toBe("keep");
  });
});
