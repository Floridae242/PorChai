import type { EssentialsRequest } from "@/lib/api-types";
import type { Satang } from "@/lib/calc/money";

// Backend gap #2 (DevLead/backend-gaps.md): the wire format only knows {food, transport}, but the user
// enters ONE daily total. Send it all as food and 0 transport. This is the only place that does it.
export function essentialsFromDaily(perDay: Satang): EssentialsRequest {
  return { food: perDay, transport: 0 };
}
