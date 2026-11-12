import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(body: Uint8Array, signature: string | null, secret: string): boolean {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
