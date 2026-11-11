export type VerifyResult =
  | { ok: true; lineUserId: string }
  | { ok: false; reason: "invalid" | "unavailable" };

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

// Verify a LINE ID token with LINE's endpoint. Never throws.
export async function verifyIdToken(
  idToken: string,
  channelId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyResult> {
  try {
    const res = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 500) return { ok: false, reason: "unavailable" };
    if (res.status !== 200) return { ok: false, reason: "invalid" };
    const json = (await res.json()) as { sub?: unknown };
    if (typeof json.sub !== "string" || json.sub === "") {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, lineUserId: json.sub };
  } catch {
    // Network error, timeout, or unreadable body
    return { ok: false, reason: "unavailable" };
  }
}
