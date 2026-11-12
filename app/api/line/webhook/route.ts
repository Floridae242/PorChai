import { recordEvent } from "@/lib/db/line-events";
import { errorResponse, HttpError } from "@/lib/http";
import { handleEvent } from "@/lib/line/handle-event";
import { verifySignature } from "@/lib/line/signature";

export async function POST(request: Request): Promise<Response> {
  try {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret) throw new Error("Missing LINE_CHANNEL_SECRET");

    // Signature is computed over the raw body, so read text first
    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers.get("x-line-signature"), secret)) {
      throw new HttpError(401, "unauthorized", "ลายเซ็นไม่ถูกต้อง");
    }

    let events: unknown;
    try {
      events = (JSON.parse(rawBody) as { events?: unknown } | null)?.events;
    } catch {
      events = undefined;
    }
    if (!Array.isArray(events)) {
      throw new HttpError(400, "bad_request", "คำขอไม่ถูกต้อง");
    }

    for (const event of events) {
      const id = (event as { webhookEventId?: unknown } | null)?.webhookEventId;
      if (typeof id !== "string") continue;
      // Dedupe first: LINE may redeliver the same event
      if (!(await recordEvent(id))) continue;
      try {
        await handleEvent(event);
      } catch (err) {
        // LINE wants a fast 200; keep going with the next event
        console.error(err);
      }
    }
    return Response.json({});
  } catch (err) {
    return errorResponse(err);
  }
}
