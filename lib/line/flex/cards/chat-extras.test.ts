import { describe, expect, it } from "vitest";
import { buildHoldCard, buildIncomeCard, buildProposalCard, buildRecordedCard, type FlexMessage, type FlexNode } from "../index";

// The cards Por added in โฟรวิว's style: the same LINE limits as limits.test.ts (LINE rejects the whole
// message when one is broken, and the user gets no answer).

const nodes = (n: FlexNode): FlexNode[] => (n.type === "box" ? [n, ...n.contents.flatMap(nodes)] : [n]);
const all = (m: FlexMessage) => [m.contents.header, m.contents.body, m.contents.footer].flatMap((n) => (n ? nodes(n) : []));

const longTitle = "ก".repeat(40);
const cards: [string, FlexMessage][] = [
  ["income", buildIncomeCard({ amount: 50000, balance: 290000, todayRemaining: 16150, dailyBudget: 16150 })],
  ["income, abnormal budget", buildIncomeCard({ amount: 50000, balance: 290000, todayRemaining: null, dailyBudget: null })],
  [
    "proposal, 5 long items, over today",
    buildProposalCard({
      items: Array.from({ length: 5 }, () => ({ title: longTitle, amount: 9999900, category: "other" as const })),
      total: 49999500,
      overToday: { remaining: 12000, by: 49987500 },
      record: { label: "จดทั้งหมด", data: JSON.stringify({ a: "all", k: "x".repeat(64) }) },
      notThis: { label: "ไม่ใช่", data: JSON.stringify({ a: "no", k: "x".repeat(64) }) },
    }),
  ],
  [
    "hold",
    buildHoldCard({
      title: longTitle,
      amount: 9999900,
      todayRemaining: 12000,
      pay: { label: "ยืนยันจ่ายจริง", data: JSON.stringify({ a: "pay", t: longTitle, m: 9999900, c: "other", k: "x".repeat(64), d: "2026-11-14" }) },
      tryFirst: { label: "ลองก่อนซื้อ", data: JSON.stringify({ a: "try", t: longTitle, m: 9999900, c: "other", k: "x".repeat(64) }) },
    }),
  ],
];

describe("Por's cards in โฟรวิว's style: LINE limits", () => {
  for (const [name, m] of cards) {
    describe(name, () => {
      it("altText 1–400 chars, under 50 KB, no ฿", () => {
        expect(m.altText.trim().length).toBeGreaterThan(0);
        expect(m.altText.length).toBeLessThanOrEqual(400);
        expect(Buffer.byteLength(JSON.stringify(m))).toBeLessThan(50 * 1024);
        expect(JSON.stringify(m)).not.toContain("฿");
      });
      it("at most 3 buttons, labels <= 20 chars, postback data <= 300 chars", () => {
        const buttons = all(m).filter((n) => n.type === "button");
        expect(buttons.length).toBeLessThanOrEqual(3);
        for (const b of buttons) {
          expect(b.action.label.length).toBeLessThanOrEqual(20);
          if (b.action.type === "postback") expect(b.action.data.length).toBeLessThanOrEqual(300);
        }
      });
      it("images are HTTPS PNG; no empty text", () => {
        for (const n of all(m)) {
          if (n.type === "image") expect(n.url).toMatch(/^https:\/\/.+\.png$/);
          if (n.type === "text") expect(n.text.trim().length).toBeGreaterThan(0);
        }
      });
    });
  }

  it("the recorded card for several entries has no footer (no [แก้]/[ลบ] for one of them)", () => {
    const m = buildRecordedCard({
      entryId: "e1",
      items: [
        { id: "e1", title: "ข้าว", amount: 4500, category: "food" },
        { id: "e2", title: "น้ำ", amount: 2000, category: "food" },
      ],
      totalAmount: 6500,
      dailyBudget: 12000,
      spentToday: 6500,
      todayRemaining: 5500,
      hideEntryActions: true,
    });
    expect(m.contents.footer).toBeUndefined();
  });
});
