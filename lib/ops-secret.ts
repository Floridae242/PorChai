import { timingSafeEqual } from "node:crypto";

// Server-to-server calls (Supabase Cron, one-off setup) carry "Authorization: Bearer <CRON_SECRET>".
// null = allowed; otherwise the response to return (503 not configured, 401 wrong).
export function refuseWithoutSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Not configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
