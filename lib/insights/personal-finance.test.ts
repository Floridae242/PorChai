import { beforeEach, expect, it, vi } from "vitest";
import { parseCategory } from "./categories";
import { createMockApi } from "@/lib/client/mock";
import { suggestSpending } from "@/lib/ai/spending-suggestions";
import { generate } from "@/lib/ai/gemini";
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn() }));
beforeEach(() => vi.mocked(generate).mockReset());
it.each([
  { label: "" },
  { label: "x".repeat(31) },
  { parent: "investment" },
  { monthlyBudget: -1 },
  { monthlyBudget: NaN },
  { monthlyBudget: 1.2 },
  { monthlyBudget: 10000001 },
  { id: "other-account-id" },
  { id: "food", version: "invalid" },
  { parent: "bills" },
])("rejects invalid category configuration %j", (patch) => {
  expect(() =>
    parseCategory({
      label: "ชานม",
      parent: "food",
      monthlyBudget: null,
      ...patch,
    }),
  ).toThrow();
});
it("keeps zero budget different from no budget", () => {
  expect(
    parseCategory({ label: "ชานม", parent: "food", monthlyBudget: 0 })
      .monthlyBudget,
  ).toBe(0);
  expect(
    parseCategory({ label: "ชานม", parent: "food", monthlyBudget: null })
      .monthlyBudget,
  ).toBeNull();
});
it("mock mirrors automatic daily points and parent/child totals", async () => {
  const api = createMockApi({ today: "2026-11-15" }),
    before = (await api.points()).balance;
  const c = await api.saveSpendingCategory({
    label: "ชานม",
    parent: "food",
    monthlyBudget: 4000,
  });
  await api.addEntry(
    {
      amount: 5000,
      category: "food",
      categoryId: c.id,
      note: "ชา",
      spentOn: "2026-11-15",
    },
    "a",
  );
  await api.addIncome(
    { amount: 100000, note: "ทุน", receivedOn: "2026-11-15" },
    "b",
  );
  expect((await api.points()).balance).toBe(before + 1);
  const insight = await api.spendingInsights();
  expect(insight.categories.find((x) => x.id === c.id)).toMatchObject({
    spent: 5000,
    remaining: -1000,
  });
  expect(insight.observations.join()).toContain("เกินงบ");
  expect(insight.total).toBeGreaterThanOrEqual(5000);
});
it("mock refuses stale category versions and preserves custom IDs through edits", async () => {
  const api = createMockApi(),
    c = await api.saveSpendingCategory({
      label: "ชานม",
      parent: "food",
      monthlyBudget: null,
    });
  const e = await api.addEntry(
    { amount: 5000, category: "food", categoryId: c.id, note: "ชา" },
    "a",
  );
  expect(e.entry.categoryId).toBe(c.id);
  await api.saveSpendingCategory({ ...c, monthlyBudget: 10000 });
  await expect(
    api.saveSpendingCategory({ ...c, monthlyBudget: 100 }),
  ).rejects.toMatchObject({ code: "stale" });
  expect((await api.editEntry(e.entry.id,{amount:6000,category:"food"})).entry.categoryId).toBe(c.id);
  await api.editEntry(e.entry.id, { category: "other" });
  expect(
    (await api.entries()).entries.find((x) => x.id === e.entry.id)?.categoryId,
  ).toBeUndefined();
});
it("analysis does not turn missing days into zero-spend claims or compare unequal windows", async () => {
  const api = createMockApi({
    scenario: "fresh",
    consented: true,
    today: "2026-11-15",
  });
  const empty = await api.spendingInsights();
  expect(empty.total).toBe(0);
  expect(empty.suggestions).toEqual([]);
  expect(empty.observations[0]).toContain("ยังวิเคราะห์");
  await api.createCycle({
    incomeSource: "family",
    incomeFrequency: "monthly",
    balance: 100000,
    payday: "2026-12-01",
  });
  for (const [date, amount] of [
    ["2026-11-15", 5000],
    ["2026-11-14", 6000],
    ["2026-11-07", 7000],
  ] as const)
    await api.addEntry(
      { amount, category: "food", note: "ข้าว", spentOn: date },
      date,
    );
  const i = await api.spendingInsights();
  expect(i.recentWeek).toBe(11000);
  expect(i.previousWeek).toBe(7000);
  expect(i.activeDays).toBe(3);
  expect(i.recurring[0]).toMatchObject({ label: "ข้าว", days: 3 });
  expect(i.observations.join()).toContain("จดตกหล่น");
});
it.each([
  null,
  "bad-json",
  JSON.stringify({ text: "จดแล้ว" }),
  JSON.stringify({ text: "ใช้ได้ 999999 บาทแน่นอน" }),
  JSON.stringify({ text: "ลดค่าอาหารแล้วใช้เงินออม" }),
  JSON.stringify({ text: "บันทึกให้แล้ว" }),
])(
  "untrusted AI output cannot invent facts or claim changes: %s",
  async (raw) => {
    const api = createMockApi({ today: "2026-11-15" });
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
  },
);
it("AI is skipped for sparse history and safe wording remains optional", async () => {
  const api = createMockApi({ scenario: "fresh", consented: true });
  expect(await suggestSpending(await api.spendingInsights())).toBeUndefined();
  expect(generate).not.toHaveBeenCalled();
});
