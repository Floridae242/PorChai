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

  it("rejects a duplicate idempotency_key", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const row = entryRow(userId, cycleId);
    expect((await db.from("entries").insert(row)).error).toBeNull();
    const { error } = await db.from("entries").insert(row);
    expect(error?.code).toBe("23505");
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

  it("hides rows from the anon key (RLS)", async () => {
    const userId = await makeUser();
    const cycleId = await makeCycle(userId);
    const { error: insertError } = await db
      .from("entries")
      .insert(entryRow(userId, cycleId));
    expect(insertError).toBeNull();

    // Sanity: the service role sees the row
    const { data: seen } = await db.from("entries").select("id");
    expect(seen?.length).toBeGreaterThan(0);

    const anon = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await anon.from("entries").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
