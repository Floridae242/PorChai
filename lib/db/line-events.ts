import { getDb } from "./client";

// Postgres unique_violation
const UNIQUE_VIOLATION = "23505";

// Record a LINE webhookEventId. true = first time, false = seen before.
// Insert + catch 23505 keeps concurrent deliveries race-safe.
export async function recordEvent(webhookEventId: string): Promise<boolean> {
  const { error } = await getDb().from("line_events").insert({ webhook_event_id: webhookEventId });
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw error;
}
