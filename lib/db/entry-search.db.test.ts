import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "./client";
const db = getDb(),
  users: string[] = [];
afterEach(async () => {
  if (users.length)
    expect(
      (await db.from("users").delete().in("id", users.splice(0))).error,
    ).toBeNull();
});
describe("private entry search RPC", () => {
  it("searches only the owner's uncancelled rows and returns complete totals with a bounded list", async () => {
    for (let i = 0; i < 2; i++) {
      const u = await db
        .from("users")
        .insert({ line_user_id: `search-${crypto.randomUUID()}` })
        .select("id")
        .single();
      expect(u.error).toBeNull();
      users.push(u.data!.id);
      const c = await db
        .from("cycles")
        .insert({
          user_id: u.data!.id,
          start_balance: 1000000,
          payday: "2026-12-01",
        })
        .select("id")
        .single();
      expect(c.error).toBeNull();
      expect(
        (
          await db.from("entries").insert(
            Array.from({ length: i === 0 ? 105 : 1 }, (_, n) => ({
              user_id: u.data!.id,
              cycle_id: c.data!.id,
              amount: 100,
              note: "ข้าว 100%",
              category: "food",
              spent_on: "2026-11-15",
              source: "form",
              idempotency_key: `s${n}`,
            })),
          )
        ).error,
      ).toBeNull();
    }
    const r = await db.rpc("entry_search", {
      p_user: users[0],
      p_query: "100%",
      p_from: "2026-11-01",
      p_until: "2026-12-01",
    });
    expect(r.error).toBeNull();
    expect(r.data.count).toBe(105);
    expect(r.data.total).toBe(10500);
    expect(r.data.entries).toHaveLength(50);
    const literal = await db.rpc("entry_search", {
      p_user: users[0],
      p_query: "_%' OR true --",
      p_from: "2026-11-01",
      p_until: "2026-12-01",
    });
    expect(literal.error).toBeNull();
    expect(literal.data.count).toBe(0);
    const cycle = await db.from("cycles").select("id").eq("user_id",users[0]).single();
    expect(cycle.error).toBeNull();
    expect((await db.from("entries").insert({user_id:users[0],cycle_id:cycle.data!.id,amount:2500,note:"อาหารในแผน",category:"food",spent_on:"2026-11-15",source:"plan",idempotency_key:"planned-food"})).error).toBeNull();
    const planned=await db.rpc("entry_search",{p_user:users[0],p_query:"อาหารในแผน",p_from:"2026-11-01",p_until:"2026-12-01"});
    expect(planned.error).toBeNull();expect(planned.data.entries[0].category).toBe("food");
  });
});
