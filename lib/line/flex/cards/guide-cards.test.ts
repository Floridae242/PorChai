import { describe, expect, it } from "vitest";
import { buildDemoScenarios } from "../index";
import type { FlexMessage, FlexNode } from "../types";
import { guideReply } from "../../onboarding";
import { howToRecordMessage } from "@/lib/chat/cards";
import { deleteDataMessage } from "@/lib/chat/messages";
import { guideCard } from "../guide-specs";
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
    // LINE: a button label is at most 20 characters, a message action sends at most 300
    for (const b of buttons) {
      if (b.type !== "button") continue;
      expect(b.action.label.length).toBeLessThanOrEqual(20);
      if (b.action.type === "message") expect(b.action.text.length).toBeLessThanOrEqual(300);
    }
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

// What the chat's own tests (lib/line/chat.db.test.ts, help-request.test.ts) look for in these answers.
describe("the chat's guide cards keep the sentences and buttons the chat tests pin", () => {
  const all = (m: FlexMessage) => texts(m).join(" ");
  const buttons = (m: FlexMessage) =>
    (m.contents.footer?.contents ?? []).flatMap((b) => (b.type === "button" ? [b.action] : []));

  it("how to record: only what works, and the button «กรอกในแอป»", () => {
    const m = howToRecordMessage() as FlexMessage;
    expect(m.type).toBe("flex");
    expect(all(m)).toContain("«ข้าว 45»");
    expect(all(m)).toContain("«รับ 500»");
    expect(all(m)).not.toContain("เมื่อวาน");
    expect(buttons(m)).toContainEqual(expect.objectContaining({ type: "uri", label: "กรอกในแอป" }));
  });

  it("delete data: where, that it cannot be undone, and the link to the delete page", () => {
    const m = deleteDataMessage() as FlexMessage;
    expect(all(m)).toContain("ตั้งค่า › ลบข้อมูลของฉัน");
    expect(all(m)).toContain("กู้คืนไม่ได้");
    expect(buttons(m)).toContainEqual(expect.objectContaining({ type: "uri", label: "ไปหน้าลบข้อมูล", uri: expect.stringMatching(/\/settings\/delete$/) }));
  });

  it("a correction reply with nothing to correct says nothing was saved", () => {
    expect(all(guideCard("correction-reply")!)).toContain("ยังไม่ได้บันทึกหรือแก้รายการ");
  });

  it("multi record keeps its facts and its honest limit", () => {
    const t = all(guideReply("guide:multi_record")!);
    for (const part of ["2–5", "จดทั้งหมด", "ข้าว 45\nกาแฟ 55", "ยังไม่ได้สร้างรายการร่างหรือบันทึก"]) expect(t).toContain(part);
  });

  it("every guide topic says that reading it changed nothing, and unknown topics get no card", () => {
    const ids = ["multi_record", "edit", "scan", "search", "balance", "essentials", "payday", "buffer", "reminders", "privacy",
      "start", "record", "income", "decide", "categories", "plans", "reports", "points", "notify", "promos"];
    for (const id of ids) {
      const card = guideReply(`guide:${id}`);
      expect(card, id).toBeTruthy();
      expect(all(card!)).toContain("ยังไม่ได้บันทึกหรือเปลี่ยนข้อมูล");
      // never a one-tap button that changes money
      for (const a of buttons(card!)) if (a.type === "message") expect(a.text).toMatch(/^(ดู|ค้น)/);
    }
    for (const bad of ["guide:pay:1000", "guide:../start", "guide:unknown", "pc:yes:any"]) expect(guideReply(bad)).toBeNull();
  });
});
