import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flexPrompt, flexReceipt, flexWelcome } from "./branded-flex";
import { reply, text } from "./reply";
import { appUrl } from "@/lib/liff/config";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
  vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "2012545254");
  vi.stubEnv("LINE_ASSET_BASE_URL", "https://porchai.example");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OA Flex cards", () => {
  it("uses the stable Vercel production domain when no asset origin is configured", () => {
    vi.stubEnv("LINE_ASSET_BASE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "porchai.example.vercel.app");
    expect(JSON.stringify(flexWelcome(text("hello")))).toContain(
      "https://porchai.example.vercel.app/mascot/greeting.png",
    );
  });
  it("builds a four-card welcome with actionable MINI App destinations", () => {
    const msg = flexWelcome(text("ยินดีต้อนรับสู่พอใช้"));
    expect(msg.type).toBe("flex");
    expect(msg.contents.type).toBe("carousel");
    if (msg.contents.type !== "carousel") throw new Error("expected carousel");
    expect(msg.contents.contents).toHaveLength(4);
    for (const card of msg.contents.contents) {
      const button = card.footer!.contents[0];
      if (button.type !== "button" || button.action.type !== "uri")
        throw new Error("expected link");
      const url = new URL(button.action.uri);
      expect(url.origin).toBe("https://miniapp.line.me");
      expect(url.pathname).toMatch(/^\/2012545254-6025ZG1r(?:\/|$)/);
      expect(url.search).toBe("");
    }
    expect(JSON.stringify(msg)).toContain(
      "https://porchai.example/mascot/greeting.png",
    );
  });

  it.each([
    "",
    "http://localhost:3100",
    "invalid",
    "https://user:secret@example.com",
    "https://example.com?token=x",
  ])("omits inaccessible or unsafe image configuration %s", (origin) => {
    vi.stubEnv("LINE_ASSET_BASE_URL", origin);
    const msg = flexWelcome(text("hello"));
    expect(JSON.stringify(msg)).not.toContain('"type":"image"');
    expect(JSON.stringify(msg)).toContain('"type":"button"');
  });

  it("keeps satang formatting and real entry destination without adding points", () => {
    const card = flexReceipt(text("จดแล้ว ✓ ข้าว 50 บาท"), {
      title: "ข้าว",
      amount: "50",
      category: "อาหาร",
      date: "วันนี้",
      budget: "วันนี้ใช้ได้อีก 70 บาท",
      balance: "2,350",
      entryId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const json = JSON.stringify(card);
    expect(json).toContain("−฿50");
    expect(json).toContain("วันนี้ใช้ได้อีก 70 บาท");
    expect(json).toContain(
      "/2012545254-6025ZG1r/record/550e8400-e29b-41d4-a716-446655440000",
    );
    expect(json).not.toContain("+1 แต้ม");
  });

  it("rejects external return paths", () => {
    expect(() => appUrl("//evil.com")).toThrow();
    expect(() => appUrl("/app/../api")).toThrow();
  });

  it("sends an actual flex payload through the existing reply endpoint", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-test-token");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const card = flexPrompt(
      text("ตั้งรอบเงินก่อนนะ"),
      "มาเริ่มแผนแรกกัน",
      "ตั้งรอบเงิน",
      "/app/setup/income",
    );
    await reply("dummy-reply", [card]);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.line.me/v2/bot/message/reply");
    expect(JSON.parse(init.body).messages[0].type).toBe("flex");
    expect(JSON.parse(init.body).replyToken).toBe("dummy-reply");
  });

  it("does not expose LINE response bodies on errors", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-test-token");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("private detail", { status: 400 })),
    );
    await expect(reply("dummy", [text("hi")])).rejects.toThrow(
      "LINE reply failed (400)",
    );
  });
});
