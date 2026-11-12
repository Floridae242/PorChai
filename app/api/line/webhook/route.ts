import { verifySignature } from "@/lib/line/signature";
import {
  buildOaReply,
  createOaReplySender,
  type OaReply,
} from "@/lib/line/oa-replies";

const replySender = createOaReplySender();

export async function POST(request: Request) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret)
    return Response.json(
      { error: "LINE webhook is not configured" },
      { status: 503 },
    );

  // Keep the original bytes: parsing/re-serializing JSON changes the signature.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (
    !verifySignature(rawBody, request.headers.get("x-line-signature"), secret)
  ) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("events" in payload) ||
    !Array.isArray(payload.events)
  ) {
    return Response.json({ error: "Expected events array" }, { status: 400 });
  }

  let replies;
  try {
    replies = payload.events
      .map((event) => buildOaReply(event, process.env.NEXT_PUBLIC_LIFF_ID))
      .filter(
        (reply): reply is OaReply =>
          reply !== null && !replySender.hasSucceeded(reply.replyToken),
      );
  } catch {
    return Response.json(
      { error: "LINE MINI App is not configured" },
      { status: 503 },
    );
  }
  // Console verification and unsupported events do not need an access token.
  if (replies.length > 0) {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken?.trim())
      return Response.json(
        { error: "LINE replies are not configured" },
        { status: 503 },
      );
    const results = await Promise.allSettled(
      replies.map((reply) => replySender.send(reply, accessToken)),
    );
    if (results.some((result) => result.status === "rejected")) {
      return Response.json(
        { error: "Could not send LINE reply" },
        { status: 502 },
      );
    }
  }
  return Response.json({ ok: true, received: payload.events.length });
}
