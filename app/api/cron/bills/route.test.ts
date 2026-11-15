import { afterEach, describe, it, expect, vi } from "vitest";
import { POST } from "./route";
vi.mock("@/lib/remind/bills", () => ({
  deliverBillBatch: vi.fn(async () => ({
    enabled: false,
    sent: 0,
    failed: 0,
    processed: 0,
    nextCursor: null,
  })),
}));
import { deliverBillBatch } from "@/lib/remind/bills";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("bill cron access", () => {
  it("requires server cron bearer before invoking the worker", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    expect(
      (
        await POST(
          new Request("https://x.test/api/cron/bills", { method: "POST" }),
        )
      ).status,
    ).toBe(401);
    expect(deliverBillBatch).not.toHaveBeenCalled();
  });
  it("rejects malformed pagination and passes a valid cursor", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const req = (after: string) =>
      new Request(`https://x.test/api/cron/bills?after=${after}`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      });
    expect((await POST(req("invalid"))).status).toBe(422);
    const id = crypto.randomUUID();
    expect((await POST(req(id))).status).toBe(200);
    expect(deliverBillBatch).toHaveBeenCalledWith(id);
  });
});
