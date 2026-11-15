import { requireUser } from "@/lib/auth";
import { pointsHistory } from "@/lib/db/rewards";
import { errorResponse } from "@/lib/http";

// The signed-in user's points history, newest first (latest 50). Read-only.
export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await pointsHistory(userId));
  } catch (error) {
    return errorResponse(error);
  }
}
