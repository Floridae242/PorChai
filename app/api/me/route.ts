import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  try {
    // userId comes only from the verified ID token
    const { userId } = await requireUser(request);
    const { count, error } = await getDb()
      .from("cycles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw error;
    return Response.json({ userId, hasActiveCycle: (count ?? 0) > 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
