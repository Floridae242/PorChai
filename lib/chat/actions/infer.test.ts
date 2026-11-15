import { beforeEach, describe, expect, it, vi } from "vitest";
import { generate } from "@/lib/ai/gemini";
import { inferReadIntent } from "./infer";
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn() }));
const today = "2026-11-15",
  message = "ช่วยหาข้อมูลรายจ่ายเกี่ยวกับกาแฟหน่อย";
beforeEach(() => vi.mocked(generate).mockReset());
describe("model classification is read only", () => {
  it.each([
    "plan_action",
    "redeem",
    "income",
    "entry",
    "notifications_write",
    "none",
  ])("rejects unsupported tool %s", async (tool) => {
    vi.mocked(generate).mockResolvedValue(
      JSON.stringify({ tool, id: "someone-else", amount: 100 }),
    );
    expect(await inferReadIntent(message, today)).toBeNull();
  });
  it("uses only a literal search phrase and no model record/account identifiers", async () => {
    vi.mocked(generate).mockResolvedValue(
      JSON.stringify({
        tool: "search",
        query: "กาแฟ",
        userId: "other",
        id: "other",
        amount: 100,
      }),
    );
    const result = await inferReadIntent(message, today);
    expect(result).toMatchObject({ tool: "search", query: "กาแฟ" });
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("selected");
    expect(result?.amount).toBeUndefined();
    vi.mocked(generate).mockResolvedValue(
      JSON.stringify({ tool: "search", query: "ค่าหอ" }),
    );
    expect(await inferReadIntent(message, today)).toBeNull();
  });
  it("cannot change notification preferences from model output", async () => {
    vi.mocked(generate).mockResolvedValue(
      JSON.stringify({ tool: "notifications", enabled: true, time: "10:00" }),
    );
    const result = await inferReadIntent("ขอดูการแจ้งเตือนหน่อยครับ", today);
    expect(result?.tool).toBe("notifications");
    expect(result).not.toHaveProperty("enabled");
    expect(result).not.toHaveProperty("time");
  });
  it.each([null, "bad-json", "null", "[]"])(
    "degrades to existing conversation on invalid output %s",
    async (raw) => {
      vi.mocked(generate).mockResolvedValue(raw);
      expect(await inferReadIntent(message, today)).toBeNull();
    },
  );
  it("does not call AI for a clear ordinary spend or greeting", async () => {
    expect(await inferReadIntent("ข้าว 50", today)).toBeNull();
    expect(await inferReadIntent("สวัสดี", today)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
});
