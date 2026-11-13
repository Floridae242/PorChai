// A photo the user sent (OCR). LINE keeps message content for a limited time; it is read once and
// passed on, never stored.
export async function messageImage(messageId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error(`LINE content ${res.status}`);
    return null;
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
}
