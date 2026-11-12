import { requireUser } from "@/lib/auth";
import { loadSummary } from "@/lib/db/budget";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await loadSummary(userId));
  } catch (err) {
    return errorResponse(err);
  }
}
