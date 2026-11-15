import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { userIdForLine } from "@/lib/db/users";
import { thaiDate, addDays } from "@/lib/calc/time";
import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string) =>
    token === "bad"
      ? { ok: false, reason: "invalid" }
      : { ok: true, lineUserId: token },
  ),
}));
const db = getDb(),
  users: string[] = [],
  token = `bill-api-${crypto.randomUUID()}`,
  other = `other-${crypto.randomUUID()}`;
const today = () => thaiDate(new Date());
function request(
  method: string,
  body?: unknown,
  bearer: string | undefined = token,
  key = "bill-key",
) {
  return new Request("http://localhost/api/bills", {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : { ...{} }),
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(async () => {
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  const id = await userIdForLine(token);
  users.push(id);
  expect(
    (
      await db
        .from("cycles")
        .insert({
          user_id: id,
          start_balance: 500000,
          payday: addDays(today(), 14),
        })
    ).error,
  ).toBeNull();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (users.length)
    expect(
      (await db.from("users").delete().in("id", users.splice(0))).error,
    ).toBeNull();
});
const data = () => ({
  title: "ค่าเน็ต",
  amount: 39900,
  startsOn: today(),
  repeat: "once",
  notify: false,
});
describe("authenticated bill calendar API", () => {
  it("POST then GET returns only owned schedules; repeat request is idempotent", async () => {
    const b = await userIdForLine(other);
    users.push(b);
    const a = await POST(request("POST", { ...data(), userId: b }));
    expect(a.status).toBe(200);
    const s = await a.json();
    expect((await (await POST(request("POST", data()))).json()).id).toBe(s.id);
    expect((await (await GET(request("GET"))).json()).schedules).toHaveLength(
      1,
    );
    expect(
      (await (await GET(request("GET", undefined, other))).json()).schedules,
    ).toEqual([]);
  });
  it("no valid identity cannot create or list bills", async () => {
    for (const bearer of ["", "bad"]) {
      expect((await POST(request("POST", data(), bearer))).status).toBe(401);
      expect((await GET(request("GET", undefined, bearer))).status).toBe(401);
    }
  });
  it.each([
    { amount: 0 },
    { amount: 10000001 },
    { repeat: "weekly" },
    { notify: "true" },
    { startsOn: "2026-02-30" },
  ])("rejects malformed input %j", async (bad) =>
    expect((await POST(request("POST", { ...data(), ...bad }))).status).toBe(
      422,
    ),
  );
  it("PATCH checks ownership; disabling notifications does not create an expense", async () => {
    const s = await (await POST(request("POST", data()))).json(),
      b = await userIdForLine(other);
    users.push(b);
    expect(
      (
        await PATCH(request("PATCH", { notify: true }, other), {
          params: Promise.resolve({ id: s.id }),
        })
      ).status,
    ).toBe(404);
    const result = await PATCH(request("PATCH", { notify: true }), {
      params: Promise.resolve({ id: s.id }),
    });
    expect(result.status).toBe(200);
    expect((await result.json()).notify).toBe(true);
    expect(
      (await db.from("entries").select("id").eq("user_id", users[0])).data,
    ).toEqual([]);
  });
  it("rejects missing idempotency and unknown update payload", async () => {
    expect((await POST(request("POST", data(), token, ""))).status).toBe(400);
    expect(
      (
        await PATCH(request("PATCH", { amount: 1 }), {
          params: Promise.resolve({ id: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(422);
  });
});
