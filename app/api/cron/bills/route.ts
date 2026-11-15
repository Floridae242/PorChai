import { refuseWithoutSecret } from "@/lib/ops-secret";
import { deliverBillBatch } from "@/lib/remind/bills";
import { errorResponse, HttpError } from "@/lib/http";
export const maxDuration = 180;
export async function POST(request: Request) {
  const denied = refuseWithoutSecret(request);
  if (denied) return denied;
  try {
    const after = new URL(request.url).searchParams.get("after") ?? undefined;
    if (after && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(after))
      throw new HttpError(422, "invalid_cursor", "Cursor ไม่ถูกต้อง");
    return Response.json(await deliverBillBatch(after));
  } catch (error) {
    return errorResponse(error);
  }
}
