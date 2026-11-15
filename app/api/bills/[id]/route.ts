import { requireUser } from "@/lib/auth";
import { updateBillSchedule } from "@/lib/db/bills";
import { errorResponse, readJson } from "@/lib/http";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireUser(request);
    const { id } = await context.params;
    return Response.json(
      await updateBillSchedule(userId, id, await readJson(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
