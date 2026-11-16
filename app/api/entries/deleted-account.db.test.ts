import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { addDays, thaiDate } from "@/lib/calc/time";
import type { VerifyResult } from "@/lib/line/id-token";

// 16 Nov exploratory run: «ลบข้อมูลของฉัน» while the app was saving gave 500. The cycle was read, then the
// account went before the insert: that is «no cycle», not a server error.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));
const gone = { id: "00000000-0000-0000-0000-000000000000" };
vi.mock("@/lib/db/budget", async (orig) => {
  const real = await orig<typeof import("@/lib/db/budget")>();
  return {
    ...real,
    // The cycle as read just before the account was deleted
    requireActiveCycle: vi.fn(async () => ({ ...gone, started_at: new Date(0).toISOString() })),
  };
});

const { POST: addEntry } = await import("./route");
const { POST: addIncome } = await import("../income/route");

const db = getDb();
const line = `U_gone_${Math.random().toString(36).slice(2, 10)}`;
const today = () => thaiDate(new Date());

const req = (path: string, body: unknown, key: string) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { Authorization: `Bearer ${line}`, "Idempotency-Key": key }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await db.from("users").delete().eq("line_user_id", line);
});

describe("saving while the account is being deleted", () => {
  it("an entry or income answers 409 no_cycle, not 500", async () => {
    for (const res of [
      await addEntry(req("/api/entries", { amount: 100, category: "food", spentOn: today() }, "g1")),
      await addIncome(req("/api/income", { amount: 100, receivedOn: addDays(today(), 0) }, "g2")),
    ]) {
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("no_cycle");
    }
  });
});
