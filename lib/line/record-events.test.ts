import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/line-events", () => ({ recordEvent: vi.fn() }));
vi.mock("@/lib/line/handle-event", () => ({ handleEvent: vi.fn() }));
import { recordEvent } from "@/lib/db/line-events";
import { handleEvent } from "@/lib/line/handle-event";
import { recordLineEvents } from "./record-events";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.mocked(recordEvent).mockReset().mockResolvedValue(true);
  vi.mocked(handleEvent).mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("webhook backend integration", () => {
  const event = { webhookEventId: "event-one", type: "follow" };
  it("keeps no-DB Developing replies independent of backend storage", async () => {
    await recordLineEvents([event]);
    expect(recordEvent).not.toHaveBeenCalled();
    expect(handleEvent).not.toHaveBeenCalled();
  });
  it.each(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])(
    "rejects partial configuration: %s",
    async (key) => {
      vi.stubEnv(key, "dummy");
      await expect(recordLineEvents([event])).rejects.toThrow("Incomplete");
    },
  );
  it("processes only first-seen backend events with valid IDs", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "dummy");
    vi.mocked(recordEvent)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await recordLineEvents([null, {}, event, event]);
    expect(recordEvent).toHaveBeenCalledTimes(2);
    expect(handleEvent).toHaveBeenCalledExactlyOnceWith(event);
  });
});
