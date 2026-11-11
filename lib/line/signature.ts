import { createHmac, timingSafeEqual } from "node:crypto";

// Check LINE's x-line-signature: base64 HMAC-SHA256 of the raw body.
export function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("base64"));
  const actual = Buffer.from(signature);
  // timingSafeEqual throws on unequal lengths
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
