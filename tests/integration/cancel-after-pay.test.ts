import { describe, expect, it } from "vitest";
import { createMockApi } from "@/lib/client/mock";

// Client contract: a paid plan must be unpaid before it can be cancelled.
// Real database transitions are covered by app/api/plans/*.db.test.ts.
describe("TC-25 Cancel After Pay (mock client contract)", () => {
  it("rejects cancelling a paid plan without restoring its balance", async () => {
    const api = createMockApi();
    const before = await api.summary();
    const { plan } = await api.addPlan({ title: "หนังสือ", amount: 20000 }, "tc25");
    await api.planAction(plan.id, "pay", { category: "supplies" });
    expect((await api.summary()).balance).toBe(before.balance - 20000);
    await expect(api.planAction(plan.id, "cancel")).rejects.toMatchObject({ status: 409, code: "plan_status" });
    expect((await api.summary()).balance).toBe(before.balance - 20000);
    expect((await api.plans()).plans.find((p) => p.id === plan.id)?.status).toBe("paid");
  });
});
