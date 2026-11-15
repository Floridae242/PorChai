import { requireUser } from "@/lib/auth";
import { redeemReward } from "@/lib/db/rewards";
import { errorResponse } from "@/lib/http";
import { requireIdempotencyKey } from "@/lib/idempotency";

export async function POST(request: Request, ctx: RouteContext<"/api/rewards/[id]/redeem">): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const { id } = await ctx.params;
    const { created, ...result } = await redeemReward(userId, id, requireIdempotencyKey(request));
    return Response.json(result, { status: created ? 201 : 200 });
  } catch (error) { return errorResponse(error); }
}
