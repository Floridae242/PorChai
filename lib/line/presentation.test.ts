import { afterEach, describe, expect, it, vi } from "vitest";
import { presentReply } from "./presentation";
import { reply, text, withAppButton } from "./reply";
import { push } from "./push";
import { flexPrompt } from "./branded-flex";
import type { FlexMessage, FlexNode } from "./flex/types";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const bodyText = (card: FlexMessage) => card.contents.body.contents
  .filter((n) => n.type === "text").map((n) => n.type === "text" ? n.text : "").join("");
const nodes = (n: FlexNode): FlexNode[] => n.type === "box" ? [n, ...n.contents.flatMap(nodes)] : [n];

describe("Flex-first LINE replies", () => {
  it.each([
    "สวัสดีครับ พอใช้ช่วยคิดเรื่องเงินได้ครับ", "กาแฟ จ่ายไปกี่บาทครับ?", "ยอดนี้ค่าอะไรครับ?",
    "ยังไม่ได้ตั้งรอบเงิน ตั้งค่าในแอปก่อนครับ", "ยังไม่จดรายจ่ายครับ หมายถึงรายการไหน?",
    "วันนี้ใช้ได้อีก 75 บาทครับ\nอยากลองทางเลือกไหนครับ?", "ไม่พบรายการนี้ ลองเปิดแอปดูครับ",
    "อ่านรูปไม่ชัดครับ กรอกเองในแอปได้เลย", "เงินนี้เป็นรายรับหรือโอนระหว่างบัญชีครับ?",
  ])("presents normal chat, clarification and error text as a card: %s", (body) => {
    const card = presentReply(text(body));
    expect(card.type).toBe("flex");
    if (card.type !== "flex") throw new Error("expected flex");
    expect(bodyText(card as FlexMessage)).toBe(body);
    expect(card.altText).toBe(body);
    const json = JSON.stringify(card);
    expect(json).not.toContain('"type":"image"'); // no image dependency for routine chat
    for (const node of nodes((card as FlexMessage).contents.body)) if (node.type === "text") expect(node.wrap).toBe(true);
  });
  it("keeps every quick reply and exact postback while showing at most three footer actions", () => {
    const actions = Array.from({ length: 13 }, (_, i) => ({ type: "postback" as const, label: `เลือก ${i}`, data: `exact:${i}`, displayText: `เลือก ${i}` }));
    const source = text("เลือกหมวดหมู่ครับ", actions);
    const card = presentReply(source);
    expect(card.quickReply).toEqual(source.quickReply);
    if (card.type !== "flex") throw new Error("expected flex");
    const buttons = (card as FlexMessage).contents.footer!.contents;
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.type === "button" && b.action)).toEqual(actions.slice(0, 3));
    expect(source.type).toBe("text");
  });
  it("includes the same MINI App action in the card and keyboard without duplicating it", () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
    const first = presentReply(withAppButton(text("พิมพ์ตอบได้เลยครับ")));
    expect(presentReply(withAppButton(first))).toEqual(first);
    expect(first.quickReply?.items.filter((i) => i.action.label === "เปิดแอป")).toHaveLength(1);
    if (first.type !== "flex") throw new Error("expected flex");
    if (first.contents.type !== "bubble") throw new Error("expected bubble");
    expect(JSON.stringify(first.contents.footer)).toContain("เปิดแอป");
  });
  it("keeps existing specialized cards and carousels unchanged", () => {
    const card = flexPrompt(text("ตั้งแผนก่อนครับ"), "ตั้งแผน", "เปิดแอป", "/app");
    expect(presentReply(card)).toBe(card);
  });
  it("preserves a long Thai/emoji reply in full while bounding the notification text and bubble bytes", () => {
    const body = "กำลังคิดให้นะครับ 👨‍👩‍👧‍👦\n".repeat(70);
    const card = presentReply(text(body));
    if (card.type !== "flex") throw new Error("expected flex");
    expect(bodyText(card as FlexMessage)).toBe(body);
    expect(card.altText.length).toBeLessThanOrEqual(400);
    expect(card.altText.endsWith("…")).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(card.contents))).toBeLessThan(28 * 1024);
    for (const node of (card as FlexMessage).contents.body.contents) if (node.type === "text") expect(node.text.length).toBeLessThanOrEqual(1000);
    expect(card.altText).not.toMatch(/[\uD800-\uDBFF]$/u);
  });
  it.each(["", " ", "ก".repeat(4001), "ก" + "\u0301".repeat(1100)])("keeps exceptional text intact instead of clipping or building an invalid card", (body) => {
    const source = text(body);
    expect(presentReply(source)).toBe(source);
  });
  it.each(["reply", "push"])("the actual %s transport uses Flex without changing its destination/retry key", async (kind) => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-token");
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    if (kind === "reply") await reply("dummy-reply", [text("ตอบด้วยการ์ดครับ")]);
    else await push("dummy-user", [text("ตอบด้วยการ์ดครับ")], "dummy-retry");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.line.me/v2/bot/message/${kind}`);
    const payload = JSON.parse(init.body as string);
    expect(payload.messages[0].type).toBe("flex");
    expect(payload.messages[0].altText).toBe("ตอบด้วยการ์ดครับ");
    if (kind === "reply") expect(payload.replyToken).toBe("dummy-reply");
    else { expect(payload.to).toBe("dummy-user"); expect(new Headers(init.headers).get("X-Line-Retry-Key")).toBe("dummy-retry"); }
  });
});
