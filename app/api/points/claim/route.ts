import { requireUser } from "@/lib/auth";
import { claimDailyPoints } from "@/lib/db/rewards";
import { errorResponse } from "@/lib/http";
import { requireIdempotencyKey } from "@/lib/idempotency";

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const { created, ...result } = await claimDailyPoints(userId, requireIdempotencyKey(request));
    return Response.json(result, { status: created ? 201 : 200 });
  } catch (error) { return errorResponse(error); }
}
