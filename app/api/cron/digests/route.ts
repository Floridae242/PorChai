import { refuseWithoutSecret } from "@/lib/ops-secret";
import { deliverDigestBatch } from "@/lib/remind/digests";
import { errorResponse, HttpError } from "@/lib/http";
export const maxDuration = 180;
export async function POST(request: Request): Promise<Response> {
  const denied = refuseWithoutSecret(request);
  if (denied) return denied;
  try {
    const after = new URL(request.url).searchParams.get("after") ?? undefined;
    if (
      after &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        after,
      )
    )
      throw new HttpError(422, "invalid_cursor", "Cursor ไม่ถูกต้อง");
    return Response.json(await deliverDigestBatch(after));
  } catch (error) {
    return errorResponse(error);
  }
}
