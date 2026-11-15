import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "./client";
import { completeEvent, forgetEvent, recordEvent } from "./line-events";
const db = getDb();
const ids: string[] = [];
const eventId = () => { const id = `lease-${crypto.randomUUID()}`; ids.push(id); return id; };
afterEach(async () => { if (ids.length) await db.from("line_events").delete().in("webhook_event_id", ids.splice(0)); });

describe("recoverable LINE event leases", () => {
  it("only one concurrent owner can claim; busy duplicates must redeliver", async () => {
    const id = eventId();
    const owners = Array.from({ length: 20 }, () => crypto.randomUUID());
    const results = await Promise.allSettled(owners.map((owner) => recordEvent(id, owner)));
    expect(results.filter((r) => r.status === "fulfilled" && r.value)).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(19);
    const winner = results.findIndex((r) => r.status === "fulfilled");
    await completeEvent(id, owners[winner]);
    expect(await recordEvent(id, crypto.randomUUID())).toBe(false);
  });
  it("expired work can be reclaimed; an old worker cannot delete or complete a new owner's claim", async () => {
    const id = eventId(); const old = crypto.randomUUID(); const next = crypto.randomUUID();
    expect(await recordEvent(id, old)).toBe(true);
    expect((await db.from("line_events").update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq("webhook_event_id", id)).error).toBeNull();
    expect(await recordEvent(id, next)).toBe(true);
    await forgetEvent(id, old);
    await expect(completeEvent(id, old)).rejects.toThrow("lease lost");
    await completeEvent(id, next);
    expect(await recordEvent(id, old)).toBe(false);
  });
  it("handler failure frees only the caller's claim and legacy completed IDs stay done", async () => {
    const id = eventId(); const owner = crypto.randomUUID();
    expect(await recordEvent(id, owner)).toBe(true);
    await forgetEvent(id, owner);
    expect(await recordEvent(id, crypto.randomUUID())).toBe(true);
    const legacy = eventId(); expect(await recordEvent(legacy)).toBe(true);
    expect(await recordEvent(legacy, owner)).toBe(false);
  });
  it("an expired lease has one winner under a second concurrent burst", async () => {
    const id = eventId(); const original = crypto.randomUUID();
    expect(await recordEvent(id, original)).toBe(true);
    expect((await db.from("line_events").update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq("webhook_event_id", id)).error).toBeNull();
    const owners = Array.from({ length: 12 }, () => crypto.randomUUID());
    const results = await Promise.allSettled(owners.map((owner) => recordEvent(id, owner)));
    const winners = results.flatMap((r, i) => r.status === "fulfilled" && r.value ? [i] : []);
    expect(winners).toHaveLength(1);
    await forgetEvent(id, original);
    await completeEvent(id, owners[winners[0]]);
  });
  it("an anonymous caller cannot claim a known event or steal its owner", async () => {
    const id = eventId(); const owner = crypto.randomUUID();
    expect(await recordEvent(id, owner)).toBe(true);
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    expect((await anon.rpc("claim_line_event", { p_id: id, p_owner: crypto.randomUUID() })).error).not.toBeNull();
    await completeEvent(id, owner);
    expect(await recordEvent(id, crypto.randomUUID())).toBe(false);
  });

});
