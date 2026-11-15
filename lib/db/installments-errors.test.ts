import { beforeEach, describe, expect, it, vi } from "vitest";
import { addInstallments } from "./installments";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  seen: vi.fn(),
  load: vi.fn(),
  basis: vi.fn(),
}));
vi.mock("./budget", () => ({ loadBudget: m.load, requireBasis: m.basis }));
vi.mock("./client", () => ({
  getDb: () => ({
    rpc: m.rpc,
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: m.seen,
      };
      return chain;
    },
  }),
}));
const input = {
    title: "โทรศัพท์",
    total: 100001,
    count: 3,
    firstDue: "2026-11-15",
  },
  now = new Date("2026-11-15T08:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  m.load.mockResolvedValue({ cycle: { id: "cycle" } });
  m.seen.mockResolvedValue({ data: null, error: null });
  m.rpc.mockResolvedValue({ data: null, error: null });
});
describe("installment database failure propagation", () => {
  it.each([
    ["IN409", "stale"],
    ["IN422", "invalid_installment"],
    ["40001", "40001"],
    ["23505", "23505"],
    ["PGRST202", "PGRST202"],
    ["57014", "57014"],
    ["ECONNRESET", "ECONNRESET"],
  ])(
    "does not claim success or fall back to partial inserts on %s",
    async (code, expected) => {
      m.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "simulated error" },
      });
      await expect(
        addInstallments("owner", input, "key", "basis", now),
      ).rejects.toMatchObject({ code: expected });
      expect(m.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    new Error("timeout"),
    new TypeError("fetch failed"),
    new DOMException("aborted", "AbortError"),
  ])("propagates a thrown transport failure", async (error) => {
    m.rpc.mockRejectedValue(error);
    await expect(
      addInstallments("owner", input, "key", "basis", now),
    ).rejects.toBe(error);
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("a failed key lookup cannot be mistaken for a new command", async () => {
    const error = { code: "57014" };
    m.seen.mockResolvedValue({ data: null, error });
    await expect(
      addInstallments("owner", input, "key", "basis", now),
    ).rejects.toBe(error);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("a failed budget read never reaches a write", async () => {
    m.load.mockRejectedValue(new Error("budget unavailable"));
    await expect(
      addInstallments("owner", input, "key", "basis", now),
    ).rejects.toThrow("budget unavailable");
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("a stale preview never reaches the transaction", async () => {
    m.basis.mockImplementation(() => {
      throw new Error("stale");
    });
    await expect(
      addInstallments("owner", input, "key", "basis", now),
    ).rejects.toThrow("stale");
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each(["", " ", "a".repeat(101), "../key", "key%", "key_1"])(
    "rejects invalid idempotency key %s before database access",
    async (key) => {
      await expect(
        addInstallments("owner", input, key, "basis", now),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(m.load).not.toHaveBeenCalled();
      expect(m.rpc).not.toHaveBeenCalled();
    },
  );
  it("a committed retry skips old basis but still calls the transaction for payload equality", async () => {
    m.seen.mockResolvedValue({ data: { id: "existing" }, error: null });
    await addInstallments(
      "owner",
      input,
      "key",
      "old-basis",
      new Date("2026-11-16T08:00:00Z"),
    );
    expect(m.basis).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenCalledWith(
      "add_installments",
      expect.objectContaining({
        p_user: "owner",
        p_title: "โทรศัพท์",
        p_total: 100001,
        p_count: 3,
      }),
    );
  });
});
