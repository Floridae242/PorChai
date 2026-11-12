import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generate, generateFromImage } from "@/lib/ai/gemini";

// The Gemini call: model, waiting time and one retry when Google is busy (eval 13 Nov: gemini-3.5-flash-lite
// answered 18 of 54, mostly 503 "high demand"; gemini-3.1-flash-lite 36 of 54, misses mostly over 8 s).

const ok = (text: string) => new Response(JSON.stringify({ status: "completed", output_text: text }), { status: 200 });
const busy = () => new Response(JSON.stringify({ error: { code: "service_unavailable" } }), { status: 503 });

describe("generate", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses gemini-3.1-flash-lite unless GEMINI_MODEL says otherwise", async () => {
    fetchMock.mockResolvedValue(ok("สวัสดีครับ"));
    expect(await generate({ system: "s", input: "i" })).toBe("สวัสดีครับ");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("gemini-3.1-flash-lite");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash");
    await generate({ system: "s", input: "i" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("gemini-3.5-flash");
  });

  it("Google busy (503): tries once more and uses that answer", async () => {
    fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok("ตอบได้แล้วครับ"));
    expect(await generate({ system: "s", input: "i" })).toBe("ตอบได้แล้วครับ");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("busy twice: gives up (null, the caller's template) — no third try", async () => {
    fetchMock.mockResolvedValue(busy());
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("other errors are not retried (a bad request stays bad)", async () => {
    fetchMock.mockResolvedValue(new Response("bad", { status: 400 }));
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits up to 15 s in all, retry included", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      signals.push(init.signal!);
      return ok("x");
    });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await generate({ system: "s", input: "i" });
    expect(timeout.mock.calls[0][0]).toBeGreaterThan(14_000);
    expect(timeout.mock.calls[0][0]).toBeLessThanOrEqual(15_000);
  });

  it("no key: null without calling Google", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await generate({ system: "s", input: "i" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("generateFromImage (OCR)", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the prompt and the image inline (base64) to generateContent, and returns the text", async () => {
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"is_slip":true}' }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateFromImage({ prompt: "อ่านสลิป", image: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg", schema: {} });
    expect(out).toBe('{"is_slip":true}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts).toEqual([{ text: "อ่านสลิป" }, { inline_data: { mime_type: "image/jpeg", data: "AQID" } }]);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("busy once: tries again; no key or no answer: null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateFromImage({ prompt: "p", image: new Uint8Array(), mimeType: "image/png", schema: {} })).toBe("ok");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [] })));
    expect(await generateFromImage({ prompt: "p", image: new Uint8Array(), mimeType: "image/png", schema: {} })).toBeNull();
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await generateFromImage({ prompt: "p", image: new Uint8Array(), mimeType: "image/png", schema: {} })).toBeNull();
  });
});
