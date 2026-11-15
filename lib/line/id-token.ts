import { createHash } from "node:crypto";

export type VerifyResult =
  | { ok: true; lineUserId: string }
  | { ok: false; reason: "invalid" | "unavailable" };
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

// Cache only server-verified tokens, keyed by SHA256 (never store bearer tokens as cache keys).
// Bounded LRU + expiry + single-flight. No invalid/unavailable response is cached.
export function createIdTokenVerifier(options: { now?: () => number; maxCache?: number; maxPending?: number } = {}) {
  const now = options.now ?? Date.now;
  const maxCache = options.maxCache ?? 2048;
  const maxPending = options.maxPending ?? 256;
  const cache = new Map<string, { result: VerifyResult; expires: number }>();
  const pending = new Map<string, Promise<VerifyResult>>();

  return async function verify(idToken: string, channelId: string, fetchImpl: typeof fetch = fetch): Promise<VerifyResult> {
    if (!idToken || idToken.length > 8192 || !channelId) return { ok: false, reason: "invalid" };
    const key = createHash("sha256").update(JSON.stringify([channelId, idToken])).digest("hex");
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      if (cached.expires > now()) { cache.set(key, cached); return { ...cached.result }; }
    }
    const running = pending.get(key);
    if (running) return { ...await running };
    if (pending.size >= maxPending) return { ok: false, reason: "unavailable" };
    const work = (async (): Promise<VerifyResult> => {
      try {
        const res = await fetchImpl(VERIFY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.status >= 500 || res.status === 429) return { ok: false, reason: "unavailable" };
        if (res.status !== 200) return { ok: false, reason: "invalid" };
        const json = await res.json() as { sub?: unknown; exp?: unknown };
        if (typeof json?.sub !== "string" || !json.sub) return { ok: false, reason: "invalid" };
        if (json.exp !== undefined && (typeof json.exp !== "number" || !Number.isFinite(json.exp) || !Number.isFinite(json.exp * 1000))) {
          return { ok: false, reason: "invalid" };
        }
        const result: VerifyResult = { ok: true, lineUserId: json.sub };
        // Only LINE's verified response supplies expiry; unverified JWT claims never extend validity.
        if (typeof json.exp === "number" && Number.isFinite(json.exp)) {
          const expires = Math.min(json.exp * 1000, now() + 30_000);
          if (expires <= now()) return { ok: false, reason: "invalid" };
          if (maxCache > 0) {
            cache.set(key, { result, expires });
            while (cache.size > maxCache) cache.delete(cache.keys().next().value!);
          }
        }
        return result;
      } catch { return { ok: false, reason: "unavailable" }; }
    })();
    pending.set(key, work);
    try { return { ...await work }; } finally { pending.delete(key); }
  };
}

export const verifyIdToken = createIdTokenVerifier();
