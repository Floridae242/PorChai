import { getDb } from "@/lib/db/client";
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
  const channelId = process.env.LINE_MINIAPP_CHANNEL_ID;
  if (!channelId) throw new Error("Missing LINE_MINIAPP_CHANNEL_ID");

  const verify = deps.verify ?? verifyIdToken;
  const result = await verify(match[1], channelId);
  if (!result.ok) {
    if (result.reason === "unavailable") {
      throw new HttpError(503, "line_unavailable", "เชื่อมต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง");
    }
    throw UNAUTHORIZED();
  }

  // Upsert is race-safe: concurrent first requests end with one row
  const { data, error } = await getDb()
    .from("users")
    .upsert({ line_user_id: result.lineUserId }, { onConflict: "line_user_id" })
    .select("id")
    .single();
  if (error) throw error;
  return { userId: data.id as string, lineUserId: result.lineUserId };
}
