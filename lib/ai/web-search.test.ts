import { describe, expect, it } from "vitest";
import { parseGroundedSearch } from "./web-search";
const response = (url = "https://example.org/student") => ({
  status: "completed",
  steps: [
    {
      type: "google_search_call",
      arguments: { queries: ["student promotion"] },
    },
    {
      type: "google_search_result",
      result: [{ search_suggestions: "<div>Google Search suggestions</div>" }],
    },
    {
      type: "model_output",
      content: [
        {
          type: "text",
          text: "ราคาเป็นข้อมูลจากแหล่งอ้างอิง",
          annotations: [
            {
              type: "url_citation",
              url,
              title: "ร้านตัวอย่าง",
              start_index: 0,
              end_index: 8,
            },
          ],
        },
      ],
    },
  ],
});
describe("grounded web response boundary", () => {
  it("preserves source evidence and provider suggestions, not thoughts", () => {
    const result = parseGroundedSearch(response());
    expect(result?.sources).toEqual([
      { title: "ร้านตัวอย่าง", url: "https://example.org/student" },
    ]);
    expect(result?.suggestions).toHaveLength(1);
    expect(result?.answer).not.toContain("thought");
  });
  it.each([
    "javascript:alert(1)",
    "http://example.org",
    "https://user:secret@example.org",
    "https://127.0.0.1/path",
    "https://localhost/path",
  ])("rejects unsafe source %s", (url) =>
    expect(parseGroundedSearch(response(url))).toBeNull(),
  );
  it("does not invent citations when the provider did not actually search", () => {
    const r = response();
    r.steps = r.steps.filter((s) => s.type !== "google_search_call");
    expect(parseGroundedSearch(r)).toBeNull();
  });
  it("does not accept an incomplete or ungrounded response", () => {
    expect(
      parseGroundedSearch({ ...response(), status: "in_progress" }),
    ).toBeNull();
    expect(
      parseGroundedSearch({ status: "completed", output_text: "ราคา 49 บาท" }),
    ).toBeNull();
  });
});
