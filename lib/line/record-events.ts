import { recordEvent } from "@/lib/db/line-events";
import { handleEvent } from "@/lib/line/handle-event";

/** Persist backend identity/events when configured; OA connectivity also works without a DB. */
export async function recordLineEvents(events: unknown[]): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url && !key) return;
  if (!url || !key) throw new Error("Incomplete Supabase configuration");
  for (const event of events) {
    const id = (event as { webhookEventId?: unknown } | null)?.webhookEventId;
    if (typeof id !== "string") continue;
    if (!(await recordEvent(id))) continue;
    try {
      await handleEvent(event);
    } catch {
      // Preserve backend's continue-on-handler-failure contract without logging private data.
      console.error("LINE event handler failed");
    }
  }
}
