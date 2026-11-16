import { describe, expect, it } from "vitest";
import { buildDemoScenarios } from "../index";
import type { FlexMessage, FlexNode } from "../types";
import { buildGuideCard, visibleTextLength } from "./guide-cards";

const scenarios = buildDemoScenarios("https://porchai.vercel.app");
const olds = scenarios.filter((s) => s.batch === "C5");
const news = scenarios.filter((s) => s.batch === "C5N");

function texts(message: FlexMessage): string[] {
  const out: string[] = [];
  const walk = (n: FlexNode | undefined): void => {
    if (!n) return;
    if (n.type === "text") out.push(n.text);
    if (n.type === "box") n.contents.forEach(walk);
  };
  walk(message.contents.header);
  walk(message.contents.body);
  walk(message.contents.footer);
  return out;
}

describe("buildGuideCard", () => {
  const card = buildGuideCard({
    pose: "greeting",
    title: "หัวข้อ",
    lead: "ประโยคนำ",
    rows: [{ label: "ป้าย", text: "ข้อความ" }],
    example: "ข้าว 50",
    note: "หมายเหตุ",
    buttons: [
      { action: { type: "message", label: "ลอง", text: "ดูรายการ" }, reason: "a" },
      { action: { type: "uri", label: "แอป", uri: "https://porchai.vercel.app/app" }, reason: "b" },
      { action: { type: "uri", label: "เกิน", uri: "https://porchai.vercel.app/app" }, reason: "c" },
    ],
  });

  it("has a mascot header, soft blocks and at most two buttons (the first is the main one)", () => {
    expect(card.contents.header?.contents[0]).toMatchObject({ type: "image", url: "https://porchai.vercel.app/mascot/greeting.png" });
    const buttons = card.contents.footer!.contents;
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ style: "primary" });
    expect(buttons[1]).toMatchObject({ style: "secondary" });
  });

  it("never uses the ฿ symbol and keeps altText <= 400", () => {
    expect(JSON.stringify(card)).not.toContain("฿");
    expect(card.altText.length).toBeLessThanOrEqual(400);
  });

  it("counts only the text a user reads", () => {
    expect(visibleTextLength(card)).toBe(texts(card).reduce((n, t) => n + t.length, 0));
  });
});

describe("C5N: every long answer of C5 redone as a card", () => {
  it("has one new card for each old one, linked both ways", () => {
    expect(olds.length).toBe(25);
    expect(news.length).toBe(olds.length);
    for (const o of olds) {
      const n = news.find((x) => x.id === o.compareId);
      expect(n, `${o.id} has a new card`).toBeTruthy();
      expect(n!.compareId).toBe(o.id);
    }
  });

  it.each(news.map((n) => [n.code, n] as const))("%s is shorter, has a reason for every button and stays small", (_code, n) => {
    const card = n.message as FlexMessage;
    const old = olds.find((o) => o.id === n.compareId)!;
    const oldLen = (old.message as FlexMessage).contents.body.contents.reduce((c, t) => c + (t.type === "text" ? t.text.length : 0), 0);
    expect(visibleTextLength(card)).toBeLessThan(oldLen);
    // readable: no single line of text longer than 100 characters, whole card under ~420
    for (const t of texts(card)) expect(t.length).toBeLessThanOrEqual(100);
    expect(visibleTextLength(card)).toBeLessThanOrEqual(420);
    // at most two buttons, and the notes explain each of them
    const buttons = card.contents.footer?.contents ?? [];
    expect(buttons.length).toBeLessThanOrEqual(2);
    expect(buttons.length).toBeGreaterThan(0);
    expect((n.notes ?? []).filter((x) => x.startsWith("ปุ่ม ")).length).toBe(buttons.length);
    // a mascot (image), over https png
    expect(JSON.stringify(card)).toMatch(/https:\/\/[^"]+\/mascot\/[A-Za-z]+\.png/);
  });

  it("one-tap message buttons are read-only commands only (nothing that changes money is ever sent for the user)", () => {
    const sent: string[] = [];
    for (const n of news) {
      for (const b of (n.message as FlexMessage).contents.footer?.contents ?? []) {
        if (b.type === "button" && b.action.type === "message") sent.push(b.action.text);
      }
    }
    expect(sent.length).toBeGreaterThan(5);
    for (const text of sent) expect(text).toMatch(/^(ดู|ค้น)/);
  });
});
