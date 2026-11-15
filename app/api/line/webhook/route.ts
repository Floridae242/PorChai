import { runKeyed } from "@/lib/runtime/keyed-work";
import { BodyLimitError, readBoundedBytes } from "@/lib/runtime/body";
import { completeEvent, forgetEvent, recordEvent } from "@/lib/db/line-events";
import { handleEvent } from "@/lib/line/handle-event";
import { verifySignature } from "@/lib/line/signature";

// LINE Messaging API webhook. Merged from Backend (card 09: chat expenses, redelivery) and the
// MINI App branch (raw-byte signature, fail closed without config).
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return Response.json({ error: "LINE webhook is not configured" }, { status: 503 });

  // Keep the original bytes: parsing/re-serializing JSON changes the signature.
  let rawBody: Uint8Array;
  try { rawBody = await readBoundedBytes(request, 1024 * 1024); }
  catch (err) {
    return Response.json({ error: err instanceof BodyLimitError ? "Payload too large" : "Invalid body" }, { status: err instanceof BodyLimitError ? 413 : 400 });
  }
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

  if (events.length > 100) return Response.json({ error: "Too many events" }, { status: 413 });

  let failed = false;
  await runKeyed(events, (event, index) => {
    const source = (event as { source?: { userId?: unknown } } | null)?.source;
    return typeof source?.userId === "string" ? source.userId : `event:${index}`;
  }, async (event) => {
    const id = (event as { webhookEventId?: unknown } | null)?.webhookEventId;
    if (typeof id !== "string" || id.length < 1 || id.length > 200) return;
    const owner = crypto.randomUUID();
    let claimed = false;
    try {
      claimed = await recordEvent(id, owner);
      if (!claimed) return;
      await handleEvent(event);
      await completeEvent(id, owner);
    } catch (err) {
      console.error("LINE event handler failed", err instanceof Error ? err.name : "");
      if (claimed) {
        // Only this owner can release a claim; a late worker cannot delete another worker's lease.
        try { await forgetEvent(id, owner); } catch { console.error("LINE event release failed"); }
      }
      failed = true;
    }
  });
  if (failed) return Response.json({ error: "retry" }, { status: 500 });
  return Response.json({ ok: true, received: events.length });
}
