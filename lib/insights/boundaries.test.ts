import { beforeEach, expect, it, vi } from "vitest";
import { thaiDate } from "@/lib/calc/time";
import { createMockApi } from "@/lib/client/mock";
import { suggestSpending } from "@/lib/ai/spending-suggestions";
import { generate } from "@/lib/ai/gemini";
import { parseCategory } from "./categories";
import { parseEntryPatch, parseNewEntry } from "@/lib/validate";
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn() }));
beforeEach(() => vi.mocked(generate).mockReset());
it.each([
  ["2026-11-15T16:59:59.999Z", "2026-11-15"],
  ["2026-11-15T17:00:00.000Z", "2026-11-16"],
  ["2026-12-31T16:59:59.999Z", "2026-12-31"],
  ["2026-12-31T17:00:00.000Z", "2027-01-01"],
  ["2028-02-28T17:00:00.000Z", "2028-02-29"],
  ["2028-02-29T17:00:00.000Z", "2028-03-01"],
])("Thai date boundary %s resolves to %s", (instant, day) =>
  expect(thaiDate(new Date(instant))).toBe(day),
);
it.each([null, [], {}, "food", 0, true])(
  "malformed category payload %j cannot become configuration",
  (value) => expect(() => parseCategory(value)).toThrow(),
);
it.each([{}, [], true, 1, "../food", "food%", "a".repeat(37)])(
  "entry category reference %j is rejected on both create and edit",
  (categoryId) => {
    expect(() =>
      parseNewEntry(
        { amount: 5000, category: "food", categoryId },
        "2026-11-15",
      ),
    ).toThrow();
    expect(() => parseEntryPatch({ categoryId }, "2026-11-15")).toThrow();
  },
);
it("explicitly clearing a personal category does not require changing the parent", () =>
  expect(parseEntryPatch({ categoryId: null }, "2026-11-15")).toEqual({
    categoryId: null,
  }));
it.each([
  "null",
  "[]",
  "{}",
  '{"text":1}',
  JSON.stringify({ text: " " }),
  JSON.stringify({ text: "ก".repeat(401) }),
  JSON.stringify({ text: "บันทึกให้แล้ว" }),
  JSON.stringify({ text: "ตั้งงบให้แล้ว" }),
  JSON.stringify({ text: "เปลี่ยนให้แล้ว" }),
  JSON.stringify({ text: "ประหยัด 987654321 บาท" }),
])("AI rejects malformed or unsafe output %s", async (raw) => {
  const api = createMockApi({
    scenario: "fresh",
    consented: true,
    today: "2026-11-15",
  });
  await api.createCycle({
    incomeSource: "family",
    incomeFrequency: "monthly",
    balance: 100000,
    payday: "2026-12-01",
  });
  for (let n = 0; n < 3; n++)
    await api.addEntry(
      {
        amount: 5000,
        category: "food",
        note: "ข้าว",
        spentOn: `2026-11-${13 + n}`,
      },
      String(n),
    );
  vi.mocked(generate).mockResolvedValue(raw);
  expect(await suggestSpending(await api.spendingInsights())).toBeUndefined();
});
it("AI can explain recorded facts without changing the ledger or setting budgets", async () => {
  const api = createMockApi({
    scenario: "fresh",
    consented: true,
    today: "2026-11-15",
  });
  await api.createCycle({
    incomeSource: "family",
    incomeFrequency: "monthly",
    balance: 100000,
    payday: "2026-12-01",
  });
  for (let n = 0; n < 3; n++)
    await api.addEntry(
      {
        amount: 5000,
        category: "food",
        note: "ข้าว",
        spentOn: `2026-11-${13 + n}`,
      },
      String(n),
    );
  const before = await api.entries(),
    settings = await api.spendingCategories(),
    facts = await api.spendingInsights();
  vi.mocked(generate).mockResolvedValue(
    JSON.stringify({
      text: "ลองตรวจรายการข้าวที่จดซ้ำ แล้วเลือกงบที่เหมาะกับแผนของคุณครับ",
    }),
  );
  expect(await suggestSpending(facts)).toContain("ลองตรวจรายการข้าว");
  expect(await api.entries()).toEqual(before);
  expect(await api.spendingCategories()).toEqual(settings);
});

it.each([
  "บันทึกเรียบร้อยแล้ว",
  "ตั้งงบให้เรียบร้อย",
  "I saved your new budget.",
  "Your budget has been updated.",
  "ลดค่า อาหารลง",
  "ใช้เงิน ออม",
  "วันนี้ใช้ได้อีก 150 บาท",
  "คุณมีรายรับ 150 บาท",
])(
  "AI cannot rephrase a false success or repurpose a known spending number: %s",
  async (text) => {
    const api = createMockApi({
      scenario: "fresh",
      consented: true,
      today: "2026-11-15",
    });
    await api.createCycle({
      incomeSource: "family",
      incomeFrequency: "monthly",
      balance: 100000,
      payday: "2026-12-01",
    });
    for (let n = 0; n < 3; n++)
      await api.addEntry(
        {
          amount: 5000,
          category: "food",
          note: "ข้าว",
          spentOn: `2026-11-${13 + n}`,
        },
        String(n),
      );
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ text }));
    expect(await suggestSpending(await api.spendingInsights())).toBeUndefined();
  },
);
