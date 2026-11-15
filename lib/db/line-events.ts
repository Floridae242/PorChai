import { HttpError } from "@/lib/http";
import { getDb } from "./client";

// Postgres unique_violation
const UNIQUE_VIOLATION = "23505";

// Record a LINE webhookEventId. true = first time, false = seen before.
// Insert + catch 23505 keeps concurrent deliveries race-safe.
export async function recordEvent(webhookEventId: string, owner?: string): Promise<boolean> {
  if (owner) {
    const { data, error } = await getDb().rpc("claim_line_event", { p_id: webhookEventId, p_owner: owner });
    if (error) throw error;
    if (data === "busy") throw new HttpError(503, "event_busy", "Event is still processing");
    if (data === "claimed") return true;
    if (data === "done") return false;
    throw new Error("Invalid event claim result");
  }
  const { error } = await getDb().from("line_events").insert({ webhook_event_id: webhookEventId });
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw error;
}

// Undo recordEvent when handling failed, so LINE's redelivery of the event is handled, not skipped as a duplicate
export async function forgetEvent(webhookEventId: string, owner?: string): Promise<void> {
  let query = getDb().from("line_events").delete().eq("webhook_event_id", webhookEventId);
  if (owner) query = query.eq("state", "processing").eq("lease_token", owner);
  const { error } = await query;
  if (error) throw error;
}

export async function completeEvent(webhookEventId: string, owner: string): Promise<void> {
  const { data, error } = await getDb().from("line_events")
    .update({ state: "done", lease_token: null, lease_until: null })
    .eq("webhook_event_id", webhookEventId).eq("state", "processing").eq("lease_token", owner)
    .select("webhook_event_id");
  if (error) throw error;
  if (data.length !== 1) throw new Error("Event lease lost");
}
