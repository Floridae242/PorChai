import { beforeEach, describe, expect, it, vi } from "vitest";
import { campaigns } from "@/lib/promotions/demo";
import { sponsorCarousel } from "./sponsor-card";
import { presentReply } from "./presentation";
import { chatAction } from "@/lib/chat/actions";
import { generate } from "@/lib/ai/gemini";
import { getDb } from "@/lib/db/client";

vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn(() => { throw Error("unexpected DB access"); }) }));
beforeEach(() => {vi.mocked(generate).mockClear();vi.mocked(getDb).mockClear();});

describe("mock sponsor Flex carousel", () => {
  it.each(["ดูโปร", "ดูคูปอง", "ดูโฆษณา"])("returns the carousel only for explicit %s without AI or DB", async request => {
    const result = await chatAction("test-user",request,null);
    expect(result?.message).toEqual(sponsorCarousel());
    expect(result?.pending).toBeUndefined();
    expect(generate).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
  it("shows fixture-based read-only cards with disclosure on every bubble", () => {
    const result = sponsorCarousel();
    expect(result.type).toBe("flex");
    expect(result.altText).toContain("ใช้ซื้อจริงไม่ได้");
    expect(result.contents.type).toBe("carousel");
    if(result.contents.type!=="carousel") throw Error("carousel required");
    expect(result.contents.contents).toHaveLength(campaigns.length);
    for(const [i,bubble] of result.contents.contents.entries()) {
      const json = JSON.stringify(bubble);
      expect(json).toContain("โฆษณาตัวอย่าง");
      expect(json).toContain("ผู้สนับสนุนสมมติ");
      expect(json).toContain("ใช้ซื้อจริงไม่ได้");
      expect(json).toContain(campaigns[i].title);
      expect(json).toContain(campaigns[i].terms);
      expect(json).not.toContain(campaigns[i].code);
      expect(json).not.toContain('"action"');
      expect(json).not.toContain('"type":"image"');
    }
    expect(new TextEncoder().encode(JSON.stringify(result.contents)).length).toBeLessThan(50_000);
    expect(presentReply(result)).toBe(result);
  });
  it("is deterministic and does not mutate the shared fixtures", () => {
    const before = JSON.stringify(campaigns);
    expect(sponsorCarousel()).toEqual(sponsorCarousel());
    expect(JSON.stringify(campaigns)).toBe(before);
  });
});
