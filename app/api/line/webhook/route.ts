import { forgetEvent, recordEvent } from "@/lib/db/line-events";
import { handleEvent } from "@/lib/line/handle-event";
import { verifySignature } from "@/lib/line/signature";

// LINE Messaging API webhook. Merged from Backend (card 09: chat expenses, redelivery) and the
// MINI App branch (raw-byte signature, fail closed without config).
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return Response.json({ error: "LINE webhook is not configured" }, { status: 503 });

  // Keep the original bytes: parsing/re-serializing JSON changes the signature.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!verifySignature(rawBody, request.headers.get("x-line-signature"), secret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const events = (payload as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return Response.json({ error: "Expected events array" }, { status: 400 });

  let failed = false;
  for (const event of events) {
    const id = (event as { webhookEventId?: unknown } | null)?.webhookEventId;
    if (typeof id !== "string") continue;
    // Dedupe first: LINE may redeliver the same event
    if (!(await recordEvent(id))) continue;
    try {
      await handleEvent(event);
    } catch (err) {
      // Not handled: forget it so a redelivery is handled, keep going with the next event,
      // and answer non-2xx so LINE redelivers (needs "Webhook redelivery" on in the console).
      // Saving is idempotent per event, so a redelivery never saves twice. No private data logged.
      console.error("LINE event handler failed", err instanceof Error ? err.name : "");
      await forgetEvent(id);
      failed = true;
    }
  }
  if (failed) return Response.json({ error: "retry" }, { status: 500 });
  return Response.json({ ok: true, received: events.length });
}
