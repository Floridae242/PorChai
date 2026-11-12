import { userIdForLine } from "@/lib/db/users";
import { HttpError } from "@/lib/http";
import { verifyIdToken } from "@/lib/line/id-token";

export interface AuthedUser {
  userId: string;
  lineUserId: string;
}

const UNAUTHORIZED = () =>
  new HttpError(401, "unauthorized", "กรุณาเข้าสู่ระบบผ่าน LINE ใหม่");

// Every API route uses only the userId returned here (never one from the request).
export async function requireUser(
  request: Request,
  deps: { verify?: typeof verifyIdToken } = {},
): Promise<AuthedUser> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw UNAUTHORIZED();

  // Missing config is a server error (500), not a client auth failure
  const channels = [process.env.LINE_LOGIN_CHANNEL_ID, process.env.LINE_MINIAPP_CHANNEL_ID].filter(
    (c): c is string => Boolean(c),
  );
  if (channels.length === 0) throw new Error("Missing LINE_LOGIN_CHANNEL_ID");

  // The LIFF app and the MINI App each issue tokens for their own channel. The unverified audience only
  // picks which channel LINE verifies against; LINE then checks the token, so it cannot be forged this way.
  // Both channels sit under one provider, so a person has the same LINE user id in either (card 06).
  const aud = audienceOf(match[1]);
  const channelId = aud && channels.includes(aud) ? aud : channels[0];
  const verify = deps.verify ?? verifyIdToken;
  const result = await verify(match[1], channelId);
  if (!result.ok) {
    if (result.reason === "unavailable") {
      throw new HttpError(503, "line_unavailable", "เชื่อมต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง");
    }
    throw UNAUTHORIZED();
  }

  return { userId: await userIdForLine(result.lineUserId), lineUserId: result.lineUserId };
}

function audienceOf(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload?.aud === "string" ? payload.aud : null;
  } catch {
    return null;
  }
}
