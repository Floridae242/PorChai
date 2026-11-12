type TextMessage = {
  type: "text";
  text: string;
  quickReply: {
    items: {
      type: "action";
      action: { type: "uri"; label: string; uri: string };
    }[];
  };
};

export type OaReply = { replyToken: string; messages: TextMessage[] };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Only describes current Developing capabilities; never writes financial data. */
export function buildOaReply(
  event: unknown,
  liffId: string | undefined,
): OaReply | null {
  if (!record(event) || event.mode === "standby") return null;
  if (
    typeof event.replyToken !== "string" ||
    !/^\S{1,256}$/.test(event.replyToken)
  )
    return null;
  const isFollow = event.type === "follow";
  const isText =
    event.type === "message" &&
    record(event.message) &&
    event.message.type === "text" &&
    typeof event.message.text === "string";
  if (!isFollow && !isText) return null;

  if (!liffId || !/^\d+-[A-Za-z0-9]+$/.test(liffId) || liffId.length > 128) {
    throw new Error("LINE MINI App is not configured");
  }
  const uri = `https://miniapp.line.me/${liffId}`;
  const greeting = isFollow
    ? "สวัสดีครับ ยินดีต้อนรับสู่พอใช้ 🌱"
    : "พอใช้รุ่นทดสอบ Developing ครับ 🌱";
  return {
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: `${greeting}\n\nตอนนี้ทดสอบการเชื่อมต่อ LINE และดูข้อเสนอโปรตัวอย่างใน MINI App ได้\n\nการจดรายจ่าย อ่านใบเสร็จ การเตือน และ AI ช่วยคิดก่อนจ่ายยังอยู่ระหว่างพัฒนา ข้อความที่ส่งมารอบนี้ยังไม่ถูกบันทึกเป็นรายจ่าย\n\nเปิดหน้าทดสอบสำหรับบัญชีทีม: ${uri}`,
        quickReply: {
          items: [
            {
              type: "action",
              action: { type: "uri", label: "เปิด MINI App", uri },
            },
          ],
        },
      },
    ],
  };
}

export async function sendOaReply(
  reply: OaReply,
  accessToken: string,
): Promise<void> {
  // Do not return LINE's response body: it may contain request/user identifiers.
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reply),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("LINE reply failed");
}

/** Best-effort process-local deduplication, never a financial idempotency store. */
export function createOaReplySender() {
  const completed = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();
  const ttlMs = 20 * 60 * 1000;
  const maxCompleted = 500;
  function hasSucceeded(replyToken: string) {
    const now = Date.now();
    for (const [token, expires] of completed) {
      if (expires <= now) completed.delete(token);
    }
    return completed.has(replyToken);
  }
  async function send(reply: OaReply, accessToken: string): Promise<void> {
    const key = reply.replyToken;
    if (hasSucceeded(key)) return;
    const existing = pending.get(key);
    if (existing) return existing;
    const attempt = sendOaReply(reply, accessToken).then(() => {
      completed.set(key, Date.now() + ttlMs);
      while (completed.size > maxCompleted) {
        completed.delete(completed.keys().next().value!);
      }
    });
    pending.set(key, attempt);
    try {
      await attempt;
    } finally {
      pending.delete(key);
    }
  }
  return { hasSucceeded, send };
}
