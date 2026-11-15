import { requireUser } from "@/lib/auth";
import { pointsState } from "@/lib/db/rewards";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await pointsState(userId));
  } catch (error) { return errorResponse(error); }
}
