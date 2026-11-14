import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "@/lib/client/mock";

vi.mock("@/lib/client/mock-fixtures", async (importOriginal) => {
  const fixtures = await importOriginal<typeof import("@/lib/client/mock-fixtures")>();
  return { ...fixtures, REWARD_FIXTURES: [{ id: "last-reward", name: "ของชิ้นสุดท้าย", cost: 1, stock: 1 }] };
});

// In-memory demo contract only; this is not evidence of cross-user database locking.
describe("TC-24 Reward race (mock client contract)", () => {
  it("allows only one redemption of the last item and deducts points once", async () => {
    const api = createMockApi();
    const before = await api.points();
    const results = await Promise.allSettled([
      api.redeemReward("last-reward", "claim-a"),
      api.redeemReward("last-reward", "claim-b"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toMatchObject([{ reason: { code: "out_of_stock" } }]);
    expect((await api.points()).balance).toBe(before.balance - 1);
    expect((await api.rewards())[0].stock).toBe(0);
  });
});
