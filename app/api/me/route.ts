import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { deleteAccount } from "@/lib/db/users";
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

// ลบข้อมูลของฉัน: everything of this account. 200 with a body, not 204: the app's client reads every reply
// as JSON. Asking again is the same answer (nothing left to delete).
export async function DELETE(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    await deleteAccount(userId);
    return Response.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
