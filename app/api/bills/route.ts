import { requireUser } from "@/lib/auth";
import { createBillSchedule, listBillSchedules } from "@/lib/db/bills";
import { errorResponse, HttpError, readJson } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const { userId } = await requireUser(request);
    return Response.json({ schedules: await listBillSchedules(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { userId } = await requireUser(request),
      key = request.headers.get("idempotency-key")?.trim();
    if (!key || key.length > 100)
      throw new HttpError(
        400,
        "missing_idempotency_key",
        "คำขอไม่ถูกต้อง ลองใหม่ครับ",
      );
    return Response.json(
      await createBillSchedule(userId, await readJson(request), key),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
