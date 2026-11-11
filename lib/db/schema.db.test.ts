import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";

const db = getDb();
const createdUsers: string[] = [];
const createdEvents: string[] = [];

async function makeUser(): Promise<string> {
  const { data, error } = await db
    .from("users")
    .insert({ line_user_id: `U${crypto.randomUUID()}` })
    .select("id")
    .single();
  expect(error).toBeNull();
  createdUsers.push(data!.id);
  return data!.id;
}

function cycleRow(userId: string, status = "active") {
  return {
    user_id: userId,
    start_balance: 10000,
    payday: "2026-12-01",
    emergency_buffer: 500,
    status,
  };
}

async function makeCycle(userId: string): Promise<string> {
  const { data, error } = await db
    .from("cycles")
    .insert(cycleRow(userId))
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id;
}

function entryRow(userId: string, cycleId: string, over = {}) {
  return {
    user_id: userId,
    cycle_id: cycleId,
    amount: 120,
    category: "food",
    spent_on: "2026-11-11",
    source: "form",
    idempotency_key: `k-${crypto.randomUUID()}`,
    ...over,
  };
}

function planRow(userId: string, cycleId: string, over = {}) {
  return {
    user_id: userId,
    cycle_id: cycleId,
    kind: "bill",
    title: "Rent",
    amount: 3000,
    ...over,
  };
}

function checkRow(userId: string, cycleId: string, over = {}) {
  return {
    user_id: userId,
    cycle_id: cycleId,
    balance: 200000,
    as_of: "2026-11-03T05:00:00Z",
    ...over,
  };
}

afterEach(async () => {
  // Deleting users cascades to all their rows
  if (createdUsers.length) {
    await db.from("users").delete().in("id", createdUsers);
    createdUsers.length = 0;
  }
  if (createdEvents.length) {
    await db.from("line_events").delete().in("webhook_event_id", createdEvents);
    createdEvents.length = 0;
  }
});

describe("layer 0-1 schema", () => {
  it("allows only one active cycle per user", async () => {
    const userId = await makeUser();
    await makeCycle(userId);
    const { error } = await db.from("cycles").insert(cycleRow(userId));
    expect(error?.code).toBe("23505");
  });

  it("allows a closed cycle next to an active one", async () => {
    const userId = await makeUser();
    await makeCycle(userId);
    const { error } = await db.from("cycles").insert(cycleRow(userId, "closed"));
    expect(error).toBeNull();
  });

  it("rejects a duplicate idempotency_key for the same user", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const row = entryRow(userId, cycleId);
    expect((await db.from("entries").insert(row)).error).toBeNull();
    const { error } = await db.from("entries").insert(row);
    expect(error?.code).toBe("23505");
  });

  it("allows the same idempotency_key for two different users", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const cycleA = await makeCycle(userA);
    const cycleB = await makeCycle(userB);
    const key = `k-${crypto.randomUUID()}`;
    const a = await db
      .from("entries")
      .insert(entryRow(userA, cycleA, { idempotency_key: key }));
    const b = await db
      .from("entries")
      .insert(entryRow(userB, cycleB, { idempotency_key: key }));
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it("rejects an entry with amount 0", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { error } = await db
      .from("entries")
      .insert(entryRow(userId, cycleId, { amount: 0 }));
    expect(error?.code).toBe("23514");
  });

  it("rejects an unknown category", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { error } = await db
      .from("entries")
      .insert(entryRow(userId, cycleId, { category: "gold" }));
    expect(error?.code).toBe("23514");
  });

  it("rejects a duplicate line webhook event id", async () => {
    const id = `evt-${crypto.randomUUID()}`;
    createdEvents.push(id);
    expect((await db.from("line_events").insert({ webhook_event_id: id })).error)
      .toBeNull();
    const { error } = await db.from("line_events").insert({ webhook_event_id: id });
    expect(error?.code).toBe("23505");
  });

  it("gives the anon key no rows from any table", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const rows: Record<string, Record<string, unknown>> = {
      entries: entryRow(userId, cycleId),
      plans: planRow(userId, cycleId),
      category_limits: { cycle_id: cycleId, category: "food", amount: 100 },
      chat_drafts: {
        user_id: userId,
        payload: {},
        expires_at: "2030-01-01T00:00:00Z",
      },
      balance_checks: checkRow(userId, cycleId),
    };
    for (const [table, row] of Object.entries(rows)) {
      expect((await db.from(table).insert(row)).error).toBeNull();
    }
    const eventId = `evt-${crypto.randomUUID()}`;
    createdEvents.push(eventId);
    expect((await db.from("line_events").insert({ webhook_event_id: eventId })).error)
      .toBeNull();

    const anon = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const tables = [
      "users",
      "cycles",
      "entries",
      "plans",
      "category_limits",
      "chat_drafts",
      "line_events",
      "balance_checks",
      "history",
    ];
    for (const table of tables) {
      // Sanity: the service role sees data, so an empty anon result means blocked
      const { data: seen } = await db.from(table).select("*").limit(1);
      expect(seen?.length, `service role sees ${table}`).toBeGreaterThan(0);
      // Either a permission error or an empty list is fine; never data
      const { data } = await anon.from(table).select("*");
      expect(data ?? [], `anon on ${table}`).toEqual([]);
    }
  });

  it("rejects an entry that points at another user's cycle", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const cycleA = await makeCycle(userA);
    const { error } = await db.from("entries").insert(entryRow(userB, cycleA));
    expect(error?.code).toBe("23503");
  });

  it("rejects a plan that points at another user's cycle", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const cycleA = await makeCycle(userA);
    const { error } = await db.from("plans").insert(planRow(userB, cycleA));
    expect(error?.code).toBe("23503");
  });

  it("rejects a plan that points at another user's entry", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const cycleA = await makeCycle(userA);
    const cycleB = await makeCycle(userB);
    const { data: entryA, error: entryError } = await db
      .from("entries")
      .insert(entryRow(userA, cycleA))
      .select("id")
      .single();
    expect(entryError).toBeNull();
    const { error } = await db
      .from("plans")
      .insert(planRow(userB, cycleB, { entry_id: entryA!.id }));
    expect(error?.code).toBe("23503");
  });

  it("keeps plan.user_id when its entry is deleted", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { data: entry } = await db
      .from("entries")
      .insert(entryRow(userId, cycleId))
      .select("id")
      .single();
    const { data: plan, error } = await db
      .from("plans")
      .insert(planRow(userId, cycleId, { entry_id: entry!.id }))
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await db.from("entries").delete().eq("id", entry!.id)).error).toBeNull();
    const { data: after } = await db
      .from("plans")
      .select("user_id, entry_id")
      .eq("id", plan!.id)
      .single();
    expect(after).toEqual({ user_id: userId, entry_id: null });
  });
});

describe("Figma alignment schema", () => {
  it("accepts the four user categories", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    for (const category of ["food", "transport", "supplies", "other"]) {
      const { error } = await db.from("entries").insert(entryRow(userId, cycleId, { category }));
      expect(error, category).toBeNull();
    }
  });

  it("rejects the dropped 'fun' category", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { error } = await db.from("entries").insert(entryRow(userId, cycleId, { category: "fun" }));
    expect(error?.code).toBe("23514");
  });

  it("keeps 'bills' for paid plans only, not for chat or form entries", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const fromForm = await db
      .from("entries")
      .insert(entryRow(userId, cycleId, { category: "bills", source: "form" }));
    expect(fromForm.error?.code).toBe("23514");
    const fromPlan = await db
      .from("entries")
      .insert(entryRow(userId, cycleId, { category: "bills", source: "plan" }));
    expect(fromPlan.error).toBeNull();
  });

  it("rejects a category limit on 'bills'", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { error } = await db
      .from("category_limits")
      .insert({ cycle_id: cycleId, category: "bills", amount: 100 });
    expect(error?.code).toBe("23514");
  });

  it("allows a bill paid from other money ('separate'), but not a purchase", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const bill = await db.from("plans").insert(planRow(userId, cycleId, { status: "separate" }));
    expect(bill.error).toBeNull();
    const purchase = await db
      .from("plans")
      .insert(planRow(userId, cycleId, { kind: "purchase", status: "separate" }));
    expect(purchase.error?.code).toBe("23514");
  });

  it("R01: one entry can settle only one plan", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { data: entry } = await db
      .from("entries")
      .insert(entryRow(userId, cycleId, { source: "plan" }))
      .select("id")
      .single();
    const first = await db.from("plans").insert(planRow(userId, cycleId, { entry_id: entry!.id }));
    expect(first.error).toBeNull();
    const second = await db.from("plans").insert(planRow(userId, cycleId, { entry_id: entry!.id }));
    expect(second.error?.code).toBe("23505");
  });

  it("stores the Figma cycle setup: source, frequency, savings, essentials", async () => {
    const userId = await makeUser();
    const { data, error } = await db
      .from("cycles")
      .insert({
        ...cycleRow(userId),
        start_balance: 240000,
        start_balance_at: "2026-11-01T01:10:00Z",
        income_source: "family",
        income_frequency: "monthly",
        savings_amount: 24000,
        savings_percent: 10,
        essential_food_daily: 5000,
        essential_transport_daily: 2000,
      })
      .select("savings_amount, essential_food_daily, version")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ savings_amount: 24000, essential_food_daily: 5000, version: 1 });
  });

  it.each([
    ["income_source", "lottery"],
    ["income_frequency", "daily"],
    ["savings_percent", 0],
    ["savings_percent", 101],
    ["savings_amount", -1],
    ["essential_food_daily", -1],
    ["essential_transport_daily", -1],
  ])("rejects cycles.%s = %s", async (column, value) => {
    const userId = await makeUser();
    const { error } = await db.from("cycles").insert({ ...cycleRow(userId), [column]: value });
    expect(error?.code).toBe("23514");
  });

  it("records balance checks and rejects a negative balance", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    expect((await db.from("balance_checks").insert(checkRow(userId, cycleId))).error).toBeNull();
    const { error } = await db
      .from("balance_checks")
      .insert(checkRow(userId, cycleId, { balance: -1 }));
    expect(error?.code).toBe("23514");
  });

  it("rejects a balance check on another user's cycle", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const cycleA = await makeCycle(userA);
    const { error } = await db.from("balance_checks").insert(checkRow(userB, cycleA));
    expect(error?.code).toBe("23503");
  });
});

describe("card 11: cancel instead of delete, and history", () => {
  async function history(subjectId: string) {
    const { data, error } = await db
      .from("history")
      .select("action, before, after")
      .eq("subject_id", subjectId)
      .order("id");
    expect(error).toBeNull();
    return data!;
  }

  async function makeEntry(userId: string, cycleId: string, over = {}) {
    const { data, error } = await db
      .from("entries")
      .insert(entryRow(userId, cycleId, over))
      .select("id, updated_at")
      .single();
    expect(error).toBeNull();
    return data!;
  }

  it("records create, edit and cancel of an entry, and keeps the row", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const entry = await makeEntry(userId, cycleId, { amount: 4500 });

    expect((await db.from("entries").update({ amount: 5000 }).eq("id", entry.id)).error).toBeNull();
    expect(
      (await db.from("entries").update({ cancelled_at: new Date().toISOString() }).eq("id", entry.id)).error,
    ).toBeNull();

    const rows = await history(entry.id);
    expect(rows.map((r) => r.action)).toEqual(["create", "edit", "cancel"]);
    expect(rows[1].before.amount).toBe(4500);
    expect(rows[1].after.amount).toBe(5000);

    const { data: kept } = await db.from("entries").select("amount, cancelled_at").eq("id", entry.id).single();
    expect(kept!.amount).toBe(5000);
    expect(kept!.cancelled_at).not.toBeNull();
  });

  it("history belongs to the entry's owner", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const entry = await makeEntry(userId, cycleId);
    const { data } = await db.from("history").select("user_id, subject").eq("subject_id", entry.id).single();
    expect(data).toEqual({ user_id: userId, subject: "entry" });
  });

  it("a cancelled entry can be neither edited nor brought back", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const entry = await makeEntry(userId, cycleId);
    await db.from("entries").update({ cancelled_at: new Date().toISOString() }).eq("id", entry.id);

    const edit = await db.from("entries").update({ amount: 1 }).eq("id", entry.id);
    expect(edit.error?.code).toBe("23514");
    const revive = await db.from("entries").update({ cancelled_at: null }).eq("id", entry.id);
    expect(revive.error?.code).toBe("23514");
  });

  it("bumps updated_at on edit", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const entry = await makeEntry(userId, cycleId);
    const { data } = await db
      .from("entries")
      .update({ note: "แก้" })
      .eq("id", entry.id)
      .select("updated_at")
      .single();
    expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(new Date(entry.updated_at).getTime());
  });

  it("records a plan's status changes (pending → paid)", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { data: plan } = await db.from("plans").insert(planRow(userId, cycleId)).select("id").single();
    await db.from("plans").update({ status: "paid" }).eq("id", plan!.id);

    const rows = await history(plan!.id);
    expect(rows.map((r) => r.action)).toEqual(["create", "status"]);
    expect([rows[1].before.status, rows[1].after.status]).toEqual(["reserved", "paid"]);
  });

  it("a balance check's as_of defaults to the database clock", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { data, error } = await db
      .from("balance_checks")
      .insert({ user_id: userId, cycle_id: cycleId, balance: 100 })
      .select("as_of")
      .single();
    expect(error).toBeNull();
    expect(Math.abs(new Date(data!.as_of).getTime() - Date.now())).toBeLessThan(60_000);
  });
});

describe("card 14: essentials can be not set", () => {
  it("a new cycle has no essentials yet (null), not 0", async () => {
    const userId = await makeUser();
    const { data } = await db
      .from("cycles")
      .insert(cycleRow(userId))
      .select("essential_food_daily, essential_transport_daily")
      .single();
    expect(data).toEqual({ essential_food_daily: null, essential_transport_daily: null });
  });

  it("food and transport are set together", async () => {
    const userId = await makeUser();
    const { error } = await db.from("cycles").insert({ ...cycleRow(userId), essential_food_daily: 5000 });
    expect(error?.code).toBe("23514");
  });

  it("both set to 0 on purpose is allowed", async () => {
    const userId = await makeUser();
    const { error } = await db
      .from("cycles")
      .insert({ ...cycleRow(userId), essential_food_daily: 0, essential_transport_daily: 0 });
    expect(error).toBeNull();
  });
});
