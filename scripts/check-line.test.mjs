import { describe, expect, it, vi } from "vitest";
import { checkLine } from "./check-line.mjs";

const env = {
  NEXT_PUBLIC_LIFF_ID: "123-test",
  LINE_MINIAPP_CHANNEL_ID: "123",
  LINE_CHANNEL_SECRET: "a".repeat(32),
  LINE_CHANNEL_ACCESS_TOKEN: "dummy-token",
};
describe("LINE readiness check", () => {
  it("does not send requests unless live checks are requested", async () => {
    const fetcher = vi.fn();
    expect(
      (await checkLine({ env, origin: "https://test.example", fetcher })).ok,
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on missing credentials, audience mismatch or insecure URL", async () => {
    const fetcher = vi.fn();
    const result = await checkLine({
      env: {
        ...env,
        LINE_CHANNEL_ACCESS_TOKEN: "",
        LINE_MINIAPP_CHANNEL_ID: "456",
      },
      origin: "http://test.example",
      live: true,
      fetcher,
    });
    expect(result.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(env.LINE_CHANNEL_SECRET);
  });
  it("checks bot token, page, signed empty event and rejected signature without sending a message", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ basicId: "@dummy" }))
      .mockResolvedValueOnce(new Response("PorChai"))
      .mockResolvedValueOnce(Response.json({ ok: true, received: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const result = await checkLine({
      env,
      origin: "https://test.example",
      live: true,
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[2][1].body).toBe('{"events":[]}');
    expect(
      fetcher.mock.calls.every(([, config]) => config.redirect === "error"),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(env.LINE_CHANNEL_ACCESS_TOKEN);
  });
  it("reports upstream failures without exposing their body or errors", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error(env.LINE_CHANNEL_ACCESS_TOKEN));
    const result = await checkLine({
      env,
      origin: "https://test.example",
      live: true,
      fetcher,
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(env.LINE_CHANNEL_ACCESS_TOKEN);
  });
  it("rejects an otherwise valid token belonging to a different OA", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ basicId: "@another-oa" }))
      .mockResolvedValueOnce(new Response("PorChai"))
      .mockResolvedValueOnce(Response.json({ ok: true, received: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const result = await checkLine({
      env: { ...env, NEXT_PUBLIC_LINE_OA_BASIC_ID: "@expected" },
      origin: "https://test.example",
      live: true,
      fetcher,
    });
    expect(result.ok).toBe(false);
    expect(
      result.checks.find((check) => check.name === "LINE bot token").ok,
    ).toBe(false);
  });
});
