import { describe, expect, it } from "vitest";
import { findPriceHint, type PriceHint } from "@/lib/advice/price-hint";

// «ถ้ากินตี๋น้อยจะเหลือเท่าไร» without a price: the shop's usual price from the team's table (price_hints),
// offered to try — never recorded. Which row a question names.

const hint = (name: string, aliases: string[] = [], price = 27900): PriceHint => ({
  name,
  aliases,
  price,
  unit: "/คน",
  category: "food",
  sourceUrl: "https://example.com",
  checkedOn: "2026-11-13",
});
const hints = [hint("สุกี้ตี๋น้อย", ["ตี๋น้อย"]), hint("ชาบูชิ", ["shabushi"], 31900), hint("Starbucks", ["สตาร์บัค", "สตาร์บัคส์"], 13000)];

describe("findPriceHint", () => {
  it("finds the shop by its name or another name for it", () => {
    expect(findPriceHint("ถ้ากินตี๋น้อยจะเหลือเท่าไร", hints)?.name).toBe("สุกี้ตี๋น้อย");
    expect(findPriceHint("พรุ่งนี้ไปสุกี้ตี๋น้อยไหวไหม", hints)?.name).toBe("สุกี้ตี๋น้อย");
    expect(findPriceHint("กินชาบูชิได้มั้ย", hints)?.name).toBe("ชาบูชิ");
  });

  it("ignores case and spaces: «STAR bucks», «ตี๋ น้อย»", () => {
    expect(findPriceHint("ซื้อ STAR bucks ไหวไหม", hints)?.name).toBe("Starbucks");
    expect(findPriceHint("กิน ตี๋ น้อย ไหวไหม", hints)?.name).toBe("สุกี้ตี๋น้อย");
    expect(findPriceHint("Shabushi ไหวไหม", hints)?.name).toBe("ชาบูชิ");
  });

  it("the longest name wins: «สตาร์บัคส์» is not cut to «สตาร์บัค», «ชาบูชิ» is not plain «ชาบู»", () => {
    const withPlain = [...hints, hint("ชาบู", [], 20000)];
    expect(findPriceHint("กินชาบูชิไหวไหม", withPlain)?.name).toBe("ชาบูชิ");
    expect(findPriceHint("กินชาบูไหวไหม", withPlain)?.name).toBe("ชาบู");
    expect(findPriceHint("สตาร์บัคส์ไหวไหม", hints)?.name).toBe("Starbucks");
  });

  it("no shop named → nothing (the AI asks the price as before)", () => {
    expect(findPriceHint("ถ้ากินหมูกระทะจะเหลือเท่าไร", hints)).toBeNull();
    expect(findPriceHint("เหลือกี่บาท?", hints)).toBeNull();
    expect(findPriceHint("", hints)).toBeNull();
    expect(findPriceHint("ตี๋น้อยไหวไหม", [])).toBeNull();
  });

  it("an empty name or other name in the table never matches everything", () => {
    expect(findPriceHint("กินข้าวไหวไหม", [hint("", [""])])).toBeNull();
    expect(findPriceHint("กินข้าวไหวไหม", [hint("ร้าน", [" "])])).toBeNull();
  });
});
