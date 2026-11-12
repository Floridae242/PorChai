import type { EntriesResponse, EntryResponse } from "@/lib/api-types";
import { requireUser } from "@/lib/auth";
import { thaiDate } from "@/lib/calc/time";
import { loadSummary } from "@/lib/db/budget";
import { addEntry, listEntries } from "@/lib/db/entries";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { parseNewEntry } from "@/lib/validate";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json({ entries: await listEntries(userId) } satisfies EntriesResponse);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const key = request.headers.get("idempotency-key")?.trim();
    if (!key || key.length > 100) {
      throw new HttpError(400, "missing_idempotency_key", "คำขอไม่ถูกต้อง ลองใหม่อีกครั้ง");
    }
    const input = parseNewEntry(await readJson(request), thaiDate(new Date()));
    const { entry, created } = await addEntry(userId, input, key, "form");
    const body: EntryResponse = { entry, summary: await loadSummary(userId) };
    return Response.json(body, { status: created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
