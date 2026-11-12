import type { SimulateResponse } from "@/lib/api-types";
import { requireUser } from "@/lib/auth";
import { simulate } from "@/lib/db/simulate";
import { errorResponse, readJson } from "@/lib/http";
import { parseTrial } from "@/lib/validate";

// W11–W14 ลองก่อนจ่าย: before / after for an item or postponing plans. Saves nothing.
export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const trial = parseTrial(await readJson(request));
    return Response.json((await simulate(userId, trial)) satisfies SimulateResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
