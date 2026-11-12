import { requireUser } from "@/lib/auth";
import { advise } from "@/lib/advice/advise";
import { errorResponse, readJson } from "@/lib/http";
import { parseQuestion } from "@/lib/validate";

// Card 15: the recommendation screen — «พรุ่งนี้กินชาบู 300 ไหวไหม» → verdict, options, explanation. Saves nothing.
export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await advise(userId, parseQuestion(await readJson(request))));
  } catch (err) {
    return errorResponse(err);
  }
}
