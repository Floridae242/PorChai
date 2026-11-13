import type { UserCategory } from "@/lib/api-types";
import type { PriceHint } from "@/lib/advice/price-hint";
import { getDb } from "@/lib/db/client";

// The team's table of usual prices (only the rows they left on)
export async function activePriceHints(): Promise<PriceHint[]> {
  const { data, error } = await getDb()
    .from("price_hints")
    .select("name, aliases, price, unit, category, source_url, checked_on")
    .eq("active", true);
  if (error) throw error;
  return data.map((r) => ({
    name: r.name as string,
    aliases: r.aliases as string[],
    price: r.price as number,
    unit: r.unit as string,
    category: r.category as UserCategory,
    sourceUrl: r.source_url as string,
    checkedOn: r.checked_on as string,
  }));
}
