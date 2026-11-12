import type { EntryResponse } from "@/lib/api-types";
import { requireUser } from "@/lib/auth";
import { thaiDate } from "@/lib/calc/time";
import { loadSummary } from "@/lib/db/budget";
import { cancelEntry, editEntry } from "@/lib/db/entries";
import { errorResponse, readJson } from "@/lib/http";
import { parseEntryPatch } from "@/lib/validate";

export async function PATCH(request: Request, ctx: RouteContext<"/api/entries/[id]">): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const { id } = await ctx.params;
    const patch = parseEntryPatch(await readJson(request), thaiDate(new Date()));
    const entry = await editEntry(userId, id, patch);
    return Response.json({ entry, summary: await loadSummary(userId) } satisfies EntryResponse);
  } catch (err) {
    return errorResponse(err);
  }
}

// Cancels (never deletes) the entry
export async function DELETE(request: Request, ctx: RouteContext<"/api/entries/[id]">): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const { id } = await ctx.params;
    const entry = await cancelEntry(userId, id);
    return Response.json({ entry, summary: await loadSummary(userId) } satisfies EntryResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
