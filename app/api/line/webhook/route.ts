import { verifySignature } from "@/lib/line/signature";

export async function POST(request: Request) {
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
  if (!payload || typeof payload !== "object" || !("events" in payload) || !Array.isArray(payload.events)) {
    return Response.json({ error: "Expected events array" }, { status: 400 });
  }

  // Developing connectivity only. No replies or financial writes yet.
  return Response.json({ ok: true, received: payload.events.length });
}
