import { requireUser } from "@/lib/auth";
import { listRewards } from "@/lib/db/rewards";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireUser(request);
    return Response.json(await listRewards());
  } catch (error) { return errorResponse(error); }
}
