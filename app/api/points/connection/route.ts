import { requireUser } from "@/lib/auth";
import { pointsConnection } from "@/lib/support/points-connection";
import { errorResponse } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const { userId, lineUserId } = await requireUser(request);
    return Response.json(await pointsConnection(userId, lineUserId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
