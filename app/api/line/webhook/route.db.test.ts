import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/line-events";

vi.mock("@/lib/line/handle-event", () => ({ handleEvent: vi.fn(async () => {}) }));

import { handleEvent } from "@/lib/line/handle-event";
import { POST } from "./route";

const secret = "test-secret";
const run = Math.random().toString(36).slice(2, 10);
const id = (n: string) => `${n}_${run}`;
const ids = ["E1", "E2", "E3", "E4", "E5", "R1"].map(id);

function post(body: string, signature?: string | null) {
  const sig = signature === undefined ? createHmac("sha256", secret).update(body).digest("base64") : signature;
  return POST(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      headers: sig ? { "x-line-signature": sig } : {},
      body,
    }),
  );
}
const events = (...e: object[]) => JSON.stringify({ events: e });
const ev = (webhookEventId: string) => ({ type: "message", webhookEventId });

describe("POST /api/line/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.mocked(handleEvent).mockReset();
    vi.mocked(handleEvent).mockResolvedValue(undefined);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await getDb().from("line_events").delete().in("webhook_event_id", ids);
  });

  it("401 on a wrong signature and handleEvent is not called", async () => {
    const res = await post(events(ev(id("E1"))), "bad-signature");
    expect(res.status).toBe(401);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it("401 when the signature header is missing", async () => {
    const res = await post(events(ev(id("E1"))), null);
    expect(res.status).toBe(401);
  });

  it("200 for an empty events array (LINE URL check)", async () => {
    const res = await post('{"events":[]}');
    expect(res.status).toBe(200);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it("handles a redelivered event only once", async () => {
    const body = events(ev(id("E1")));
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200);
    expect(handleEvent).toHaveBeenCalledTimes(1);
  });

  it("handles two different events in one body", async () => {
    const res = await post(events(ev(id("E2")), ev(id("E3"))));
    expect(res.status).toBe(200);
    expect(handleEvent).toHaveBeenCalledTimes(2);
  });

  it("400 for a validly signed body that is not JSON", async () => {
    expect((await post("not json")).status).toBe(400);
  });

  it("400 when events is not an array", async () => {
    expect((await post('{"events":"x"}')).status).toBe(400);
  });

  it("skips events without a string webhookEventId", async () => {
    const res = await post(events({ type: "message" }, { webhookEventId: 5 }, ev(id("E4"))));
    expect(res.status).toBe(200);
    expect(handleEvent).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 and continues when handleEvent throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(handleEvent).mockRejectedValueOnce(new Error("boom"));
    const res = await post(events(ev(id("E5")), ev(id("R1"))));
    expect(res.status).toBe(200);
    expect(handleEvent).toHaveBeenCalledTimes(2);
    vi.mocked(console.error).mockRestore();
  });

  it("503 when LINE_CHANNEL_SECRET is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    const res = await post(events(ev(id("E1"))));
    expect(res.status).toBe(503);
    vi.mocked(console.error).mockRestore();
  });
});

describe("recordEvent", () => {
  afterEach(async () => {
    await getDb().from("line_events").delete().in("webhook_event_id", ids);
  });

  it("returns true first, false after", async () => {
    expect(await recordEvent(id("E1"))).toBe(true);
    expect(await recordEvent(id("E1"))).toBe(false);
  });

  it("exactly one of concurrent calls wins", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => recordEvent(id("R1"))));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
