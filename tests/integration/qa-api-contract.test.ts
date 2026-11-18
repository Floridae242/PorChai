import { describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import type { VerifyResult } from "@/lib/line/id-token";
import { parseNewCycle, parseBalanceCheck, parseNewEntry, parseNewPlan, parseEntryPatch } from "@/lib/validate";
import { computeBudget, simulatePurchase, type BudgetInput } from "@/lib/calc/budget";
import { thaiDate, addDays } from "@/lib/calc/time";
import { baht } from "@/lib/calc/money";
import { createHmac } from "node:crypto";
import { verifySignature } from "@/lib/line/signature";
import { createMockApi } from "@/lib/client/mock";

// Helper for HTTP Request
function createReq(url: string, options: { method?: string; token?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    bodyStr = JSON.stringify(options.body);
  }
  return new Request(url, {
    method: options.method ?? "GET",
    headers,
    body: bodyStr,
  });
}

describe("Phase 3 QA API Contract & Integration Test Suite", () => {
  // A. /api/me & Auth tests
  describe("A. [TC-19 / Auth] /api/me and Token Verification Contract", () => {
    it("[TC-19-A1] missing token returns 401 unauthorized", async () => {
      const req = createReq("http://localhost/api/me");
      await expect(requireUser(req)).rejects.toThrowError(HttpError);
      try {
        await requireUser(req);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(401);
      }
    });

    it("[TC-19-A2] invalid or forged token returns 401", async () => {
      vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
      const req = createReq("http://localhost/api/me", { token: "forged_malicious_token" });
      const mockVerify = vi.fn(async (): Promise<VerifyResult> => ({ ok: false, reason: "invalid" }));
      try {
        await requireUser(req, { verify: mockVerify });
        expect.unreachable("should throw 401");
      } catch (err) {
        expect((err as HttpError).status).toBe(401);
      }
      vi.unstubAllEnvs();
    });

    it("[TC-19-A3] expired token (mock verifier returns invalid) returns 401", async () => {
      vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
      const req = createReq("http://localhost/api/me", { token: "expired_token_123" });
      const mockVerify = vi.fn(async (): Promise<VerifyResult> => ({ ok: false, reason: "invalid" }));
      try {
        await requireUser(req, { verify: mockVerify });
        expect.unreachable("should throw 401");
      } catch (err) {
        expect((err as HttpError).status).toBe(401);
      }
      vi.unstubAllEnvs();
    });
  });

  // B. POST /api/cycle validations
  describe("B. [TC-14 / TC-07] Cycle Creation & Validation Contract", () => {
    const today = "2026-11-16";
    const now = new Date("2026-11-16T10:00:00+07:00");

    it("[TC-14-B1] payday in the past or today is rejected (DR01 / R1)", () => {
      const body = {
        incomeSource: "family",
        incomeFrequency: "monthly",
        balance: 100000,
        payday: today, // today is invalid, must be in future
      };
      expect(() => parseNewCycle(body, today, now)).toThrow();
    });

    it("[TC-14-B2] balance < buffer + savings is rejected (over set aside)", () => {
      const body = {
        incomeSource: "family",
        incomeFrequency: "monthly",
        balance: 50000, // 500 THB
        emergencyBuffer: 40000, // 400 THB
        savingsAmount: 20000, // 200 THB (total 600 > 500)
        payday: "2026-11-20",
      };
      expect(() => parseNewCycle(body, today, now)).toThrow();
    });

    it("[TC-14-B3] negative, NaN, or empty values are rejected", () => {
      expect(() => parseNewCycle({ balance: -500 }, today, now)).toThrow();
      expect(() => parseNewCycle({ balance: "NaN" }, today, now)).toThrow();
      expect(() => parseNewCycle({}, today, now)).toThrow();
    });
  });

  // C. Balance checks
  describe("C. [TC-13 / R01] Balance Adjustment Contract", () => {
    it("[TC-13-C1] parses valid balance check with asOf timestamp", () => {
      const now = new Date("2026-11-16T12:00:00+07:00");
      const check = parseBalanceCheck({ balance: 85000, asOf: now.toISOString() }, now);
      expect(check.balance).toBe(85000);
      expect(check.asOf).toBeInstanceOf(Date);
    });

    it("[TC-13-C2] negative balance adjustment is rejected", () => {
      const now = new Date();
      expect(() => parseBalanceCheck({ balance: -100 }, now)).toThrow();
    });
  });

  // D. Summary calculations and Quarter Baht Invariant
  describe("D. [TC-04 / R3-quarter] Summary & Daily Budget Contract", () => {
    it("[TC-04-D1] dailyBudget is always an exact multiple of 25 satang (R3-quarter)", () => {
      // 700 THB, 3 days -> 233.25 THB = 23,325 satang
      const input: BudgetInput = {
        balance: baht(700),
        spentToday: 0,
        emergencyBuffer: 0,
        savings: 0,
        reserved: 0,
        essentialPerDay: null,
        today: "2026-11-16",
        payday: "2026-11-19", // 3 days left
      };
      const res = computeBudget(input);
      expect(res.kind).toBe("ok");
      if (res.kind === "ok") {
        expect(res.dailyBudget).toBe(23325);
        expect(res.dailyBudget % 25).toBe(0);
      }
    });

    it("[TC-06-D2] deficit / shortfall does not yield positive daily budget", () => {
      const input: BudgetInput = {
        balance: baht(500),
        spentToday: 0,
        emergencyBuffer: 0,
        savings: 0,
        reserved: baht(600), // bills 600 > 500
        essentialPerDay: null,
        today: "2026-11-16",
        payday: "2026-11-21",
      };
      const res = computeBudget(input);
      expect(res.kind).toBe("shortfall");
      if (res.kind === "shortfall") {
        expect(res.shortfall).toBe(baht(100));
      }
    });
  });

  // E. Plans State Machine
  describe("E. [TC-02 / TC-03 / TC-16] Plans State Machine Contract", () => {
    it("[TC-02-E1] plan creation with idempotency key", async () => {
      const mock = createMockApi();
      await mock.createCycle({
        balance: 100000,
        incomeSource: "family",
        incomeFrequency: "monthly",
        payday: "2026-11-23",
        bills: [],
      });

      const created = await mock.addPlan(
        { kind: "purchase", title: "Shirt", amount: 14000 },
        "key_plan_01",
      );
      expect(created.plan.id).toBeDefined();
      expect(created.plan.status).toBe("reserved");
    });

    it("[TC-03-E2] cannot pay an already cancelled plan (PR409)", async () => {
      const mock = createMockApi();
      await mock.createCycle({
        balance: 100000,
        incomeSource: "family",
        incomeFrequency: "monthly",
        payday: "2026-11-23",
        bills: [],
      });

      const created = await mock.addPlan(
        { kind: "purchase", title: "Shoes", amount: 25000 },
        "key_plan_02",
      );
      const cancelled = await mock.planAction(created.plan.id, "cancel");
      expect(cancelled.plan.status).toBe("cancelled");
      // attempting to pay cancelled plan must fail
      await expect(mock.planAction(created.plan.id, "pay")).rejects.toThrow();
    });

    it("[TC-16-E3] cancelling a reserved plan releases reserved money back to usable", async () => {
      const base: BudgetInput = {
        balance: baht(1000),
        spentToday: 0,
        emergencyBuffer: 0,
        savings: 0,
        reserved: baht(250), // 250 reserved
        essentialPerDay: null,
        today: "2026-11-16",
        payday: "2026-11-21", // 5 days -> (1000-250)/5 = 150/day
      };
      const before = computeBudget(base);
      expect(before).toMatchObject({ kind: "ok", usable: baht(750), dailyBudget: baht(150) });

      // cancel reservation -> reserved becomes 0
      const after = computeBudget({ ...base, reserved: 0 });
      expect(after).toMatchObject({ kind: "ok", usable: baht(1000), dailyBudget: baht(200) });
    });
  });

  // F. Entries contract
  describe("F. [TC-17 / TC-21] Expense Entries Contract", () => {
    it("[TC-17-F1] parseNewEntry rejects amount <= 0", () => {
      expect(() => parseNewEntry({ amount: 0, title: "Zero" }, "2026-11-16")).toThrow();
      expect(() => parseNewEntry({ amount: -50, title: "Negative" }, "2026-11-16")).toThrow();
    });

    it("[TC-21-F2] recording valid expense of 45 THB reduces budget", () => {
      // 2,400 THB - 45 THB = 2,355 THB actual balance remaining
      const base: BudgetInput = {
        balance: baht(2355),
        spentToday: baht(45),
        emergencyBuffer: 0,
        savings: 0,
        reserved: baht(600),
        essentialPerDay: null,
        today: "2026-11-16",
        payday: "2026-11-28", // 12 days left
      };
      const r = computeBudget(base);
      expect(r).toMatchObject({
        kind: "ok",
        dailyBudget: baht(150),
        todayRemaining: baht(105),
      });
    });
  });

  // H. Webhook Signatures & Idempotency
  describe("H. [TC-18] Webhook Signature & Deduplication Contract", () => {
    const secret = "test_line_channel_secret_abc";

    it("[TC-18-H1] rejects invalid or missing LINE webhook signature", () => {
      const body = JSON.stringify({ events: [] });
      expect(verifySignature(body, "bad_signature", secret)).toBe(false);
      expect(verifySignature(body, null, secret)).toBe(false);
    });

    it("[TC-18-H2] accepts valid HMAC-SHA256 signature calculated over exact body bytes", () => {
      const body = JSON.stringify({ events: [{ type: "message", webhookEventId: "evt_001" }] });
      const validSig = createHmac("sha256", secret).update(body).digest("base64");
      expect(verifySignature(body, validSig, secret)).toBe(true);
    });
  });

  // I. Timezone boundaries (Asia/Bangkok)
  describe("I. [P-22] Timezone & Day Rollover (Asia/Bangkok)", () => {
    it("[P-22-I1] 17:00 UTC corresponds to 00:00 (midnight next day) in Asia/Bangkok", () => {
      // 2026-11-16T17:00:00Z = 2026-11-17 00:00:00 GMT+7
      const utcMidnightThai = new Date("2026-11-16T17:00:00.000Z");
      expect(thaiDate(utcMidnightThai)).toBe("2026-11-17");

      // 2026-11-16T16:59:59Z = 2026-11-16 23:59:59 GMT+7
      const utcBeforeMidnight = new Date("2026-11-16T16:59:59.000Z");
      expect(thaiDate(utcBeforeMidnight)).toBe("2026-11-16");
    });
  });

  // J. Large Values & Scaled Cases
  describe("J. Large Values & Financial Limits Contract", () => {
    it("[J1] large balance 2,000,000 THB and 400 days does not overflow or produce NaN", () => {
      const input: BudgetInput = {
        balance: baht(2_000_000), // 200,000,000 satang
        spentToday: 0,
        emergencyBuffer: 0,
        savings: 0,
        reserved: 0,
        essentialPerDay: null,
        today: "2026-11-16",
        payday: addDays("2026-11-16", 400),
      };
      const res = computeBudget(input);
      expect(res.kind).toBe("ok");
      if (res.kind === "ok") {
        expect(res.dailyBudget).toBe(baht(5000)); // 2,000,000 / 400 = 5,000 THB
        expect(Number.isNaN(res.dailyBudget)).toBe(false);
      }
    });
  });
});
