import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("optional Google Search transport", () => {
  it("does not call a provider unless explicitly enabled", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("GEMINI_WEB_SEARCH_ENABLED", "0");
    const { groundedSearch } = await import("./gemini");
    expect(await groundedSearch("สิทธิ์นักศึกษา")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the grounding tool and stateless request, with only the explicit public query", async () => {
    vi.stubEnv("GEMINI_WEB_SEARCH_ENABLED", "1");
    vi.stubEnv("GEMINI_SEARCH_MODEL", "supported-test-model");
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            steps: [
              { type: "google_search_call" },
              {
                type: "google_search_result",
                result: [
                  { search_suggestions: "<div>Google suggestions</div>" },
                ],
              },
              {
                type: "model_output",
                content: [
                  {
                    type: "text",
                    text: "ข้อมูลอ้างอิง",
                    annotations: [
                      {
                        type: "url_citation",
                        url: "https://example.org",
                        title: "ตัวอย่าง",
                        start_index: 0,
                        end_index: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { groundedSearch } = await import("./gemini");
    expect((await groundedSearch("สิทธิ์นักศึกษา"))?.sources).toHaveLength(1);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "supported-test-model",
      store: false,
      input: "สิทธิ์นักศึกษา",
      tools: [{ type: "google_search" }],
    });
    expect(body.history).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });
});
