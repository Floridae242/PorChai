// «ถ้ากินตี๋น้อยจะเหลือเท่าไร» without a price: the shop's usual price from the team's table (price_hints,
// edited in Supabase Studio). Only offered to try before paying — a price from this table is never recorded.
import type { UserCategory } from "@/lib/api-types";

export interface PriceHint {
  name: string;
  aliases: string[];
  price: number; // satang, one person / one cup
  unit: string; // shown after the price: "/คน", "/แก้ว"
  category: UserCategory;
  sourceUrl: string;
  checkedOn: string; // YYYY-MM-DD: when the team last checked the price
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// The shop the message names; the longest name wins («ชาบูชิ» over «ชาบู»)
export function findPriceHint(text: string, hints: PriceHint[]): PriceHint | null {
  const said = squash(text);
  let best: { hint: PriceHint; length: number } | null = null;
  for (const hint of hints) {
    for (const name of [hint.name, ...hint.aliases].map(squash)) {
      if (name && said.includes(name) && name.length > (best?.length ?? 0)) best = { hint, length: name.length };
    }
  }
  return best?.hint ?? null;
}
