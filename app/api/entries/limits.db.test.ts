import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { addDays, thaiDate } from "@/lib/calc/time";
import type { VerifyResult } from "@/lib/line/id-token";
import { POST as addEntry } from "./route";
import { PATCH as editEntry } from "./[id]/route";
import { POST as addIncome } from "../income/route";

// 16 Nov exploratory run: the API took 1e15 satang and an entry dated 1999. The amount stops where the chat
// stops (100,000 baht) and a date stays inside the current cycle.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const line = `U_lim_${run}`;
const today = () => thaiDate(new Date());

function req(path: string, init: { method?: string; body?: unknown; key?: string } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${line}` };
  if (init.key) headers["Idempotency-Key"] = init.key;
  return new Request(`http://localhost${path}`, { method: init.method ?? "POST", headers, body: JSON.stringify(init.body) });
}

// A cycle that started 3 days ago
async function cycle(): Promise<string> {
  const user = await db.from("users").insert({ line_user_id: line }).select("id").single();
  expect(user.error).toBeNull();
  const started = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { error } = await db.from("cycles").insert({
    user_id: user.data!.id, start_balance: 240000, payday: addDays(today(), 12), emergency_buffer: 0,
    started_at: started, start_balance_at: started,
  });
  expect(error).toBeNull();
  return user.data!.id;
}

beforeEach(() => {
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await db.from("users").delete().eq("line_user_id", line);
});

const post = (body: unknown, key: string) => addEntry(req("/api/entries", { body, key }));

describe("an entry's date stays in the current cycle", () => {
  it("from the cycle's first day to today", async () => {
    await cycle();
    expect((await post({ amount: 100, category: "food", spentOn: addDays(today(), -3) }, "k1")).status).toBe(201);
    expect((await post({ amount: 100, category: "food", spentOn: today() }, "k2")).status).toBe(201);
  });

  it("before the cycle started is refused, saving nothing", async () => {
    const id = await cycle();
    for (const [spentOn, key] of [[addDays(today(), -4), "b1"], ["1999-01-01", "b2"]]) {
      const res = await post({ amount: 100, category: "food", spentOn }, key);
      expect(res.status).toBe(422);
      expect((await res.json()).error.message).toContain("รอบเงินนี้");
    }
    expect((await db.from("entries").select("id").eq("user_id", id)).data).toEqual([]);
  });

  it("an edit cannot move it before the cycle either", async () => {
    await cycle();
    const created = await (await post({ amount: 100, category: "food" }, "e1")).json();
    const res = await editEntry(req(`/api/entries/${created.entry.id}`, { method: "PATCH", body: { spentOn: addDays(today(), -60) } }), {
      params: Promise.resolve({ id: created.entry.id }),
    });
    expect(res.status).toBe(422);
    expect((await db.from("entries").select("spent_on").eq("id", created.entry.id).single()).data!.spent_on).toBe(today());
  });

  it("income received before the cycle started is refused", async () => {
    await cycle();
    const res = await addIncome(req("/api/income", { body: { amount: 100, receivedOn: "1999-01-01" }, key: "i1" }));
    expect(res.status).toBe(422);
  });
});

describe("amounts stop where the chat stops", () => {
  it("an entry or income over 100,000 baht is refused", async () => {
    await cycle();
    expect((await post({ amount: 1e15, category: "food" }, "m1")).status).toBe(422);
    expect((await addIncome(req("/api/income", { body: { amount: 1e12 }, key: "m2" }))).status).toBe(422);
    expect((await post({ amount: 10_000_000, category: "other" }, "m3")).status).toBe(201);
  });
});
