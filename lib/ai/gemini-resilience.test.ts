import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", "mock-key-only");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const answer = () => Response.json({ status: "completed", output_text: "ok" });

describe("AI transport resilience", () => {
  it("1,000 simultaneous requests retain at most eight provider jobs and recover slots", async () => {
    const waiters: (() => void)[] = [];
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => waiters.push(() => resolve(answer()))));
    vi.stubGlobal("fetch", fetcher);
    const { generate } = await import("./gemini");
    const pending = Array.from({ length: 1000 }, () => generate({ system: "s", input: "i" }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(8));
    waiters.forEach((resolve) => resolve());
    const outcomes = await Promise.all(pending);
    expect(outcomes.filter((r) => r === "ok")).toHaveLength(8);
    expect(outcomes.filter((r) => r === null)).toHaveLength(992);
    fetcher.mockImplementation(async () => answer());
    expect(await generate({ system: "s", input: "i" })).toBe("ok");
  });
  it("does not retry a Retry-After beyond its total budget, and never logs provider text", async () => {
    const fetcher = vi.fn(async () => new Response("private-provider-detail", { status: 429, headers: { "retry-after": "3600" } }));
    vi.stubGlobal("fetch", fetcher);
    const { generate } = await import("./gemini");
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private-provider-detail");
  });
  it("retries a transient 502 once and does not retry authentication errors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 502 })).mockResolvedValueOnce(answer());
    vi.stubGlobal("fetch", fetcher);
    const { generate } = await import("./gemini");
    expect(await generate({ system: "s", input: "i" })).toBe("ok");
    fetcher.mockReset().mockResolvedValue(new Response("private-token", { status: 401 }));
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([null, [], "bad", { steps: {} }, { steps: [null, { type: "model_output", content: {} }] }, { output_text: "x".repeat(16_001) }])("safely rejects unexpected provider shape: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    const { generate } = await import("./gemini");
    expect(await generate({ system: "s", input: "i" })).toBeNull();
  });
  it("rejects oversized prompts/images before fetch and bounds a chunked response", async () => {
    const fetcher = vi.fn(async () => new Response("x".repeat(65_537)));
    vi.stubGlobal("fetch", fetcher);
    const { generate, generateFromImage } = await import("./gemini");
    expect(await generate({ system: "s", input: "i".repeat(24_001) })).toBeNull();
    expect(await generateFromImage({ prompt: "p", image: new Uint8Array(8 * 1024 * 1024 + 1), mimeType: "image/png", schema: {} })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await generate({ system: "s", input: "i" })).toBeNull();
  });
  it.each([400, 403, 404])("does not retry permanent HTTP %s responses", async (status) => {
    const fetcher = vi.fn(async () => new Response("private-error", { status }));
    vi.stubGlobal("fetch", fetcher);
    const { generate } = await import("./gemini");
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("malformed JSON and a network exception free admission slots for later successful work", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{broken")).mockRejectedValueOnce(new Error("private-network-detail")).mockResolvedValue(answer());
    vi.stubGlobal("fetch", fetcher);
    const { generate } = await import("./gemini");
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(await generate({ system: "s", input: "i" })).toBe("ok");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private-network-detail");
  });

});
