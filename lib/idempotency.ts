import { HttpError } from "@/lib/http";

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 100) throw new HttpError(400, "missing_idempotency_key", "คำขอไม่ถูกต้อง ลองใหม่อีกครั้ง");
  return key;
}
