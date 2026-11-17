import { expect, it } from "vitest";
import { existsSync } from "node:fs";
import { buildActionList } from "./action-list";
import { buildConversationCard } from "./conversation";

it("renders all ten server-owned choices as row targets, without clipping choice 4–10", () => {
  const actions = Array.from({ length: 10 }, (_, index) => ({ type: "postback" as const,
    label: `เลือก ${index + 1}`, data: `pc:pick:owned:${index}`, displayText: `เลือก ${index + 1}` }));
  const card = buildActionList({ title: "แผนและบิล", subtitle: "หน้า 1", icon: "budget-calendar",
    rows: actions.map((action, index) => ({ title: `บิล ${index + 1}`, detail: "30 บาท · ยกเลิกแล้ว", action })) });
  const boxes = card.contents.body.contents.filter(node => node.type === "box");
  expect(boxes.map(node => node.action)).toEqual(actions);
  expect(Buffer.byteLength(JSON.stringify(card.contents))).toBeLessThan(28 * 1024);
  expect(card.contents.footer).toBeUndefined();
});

it("puts confirmation beside cancellation and preserves exact payloads", () => {
  const actions = [{ type: "postback" as const, label: "ยืนยัน", data: "pc:yes:owned", displayText: "ยืนยัน" },
    { type: "postback" as const, label: "ยกเลิก", data: "pc:no:owned", displayText: "ยกเลิก" }];
  const card = buildActionList({ title: "ตรวจการแจ้งเตือน", subtitle: "ยังไม่เปลี่ยนค่า", icon: "bell", rows: [
    { title: "สรุปรายวัน · เปิด", detail: "เวลา 00:01 น. (เวลาไทย)", icon: "clock" },
  ], actions });
  expect(card.contents.footer?.layout).toBe("horizontal");
  expect(card.contents.footer?.contents.map(node => node.type === "button" && node.action)).toEqual(actions);
  expect(card.contents.footer?.contents[0]).toMatchObject({ style: "primary" });
});

it("gives daily, monthly and budget preferences the same label and value hierarchy", () => {
  const card = buildActionList({ title: "ตรวจการแจ้งเตือน", subtitle: "เวลาไทย · ยังไม่เปลี่ยนค่า", icon: "bell",
    rows: [{ title: "สรุปรายวัน", value: "เปิด" }, { title: "สรุปรายเดือน", value: "ปิด" }, { title: "เตือนงบ", value: "เปิด" }] });
  const rows = card.contents.body.contents.filter(node => node.type === "box");
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row.contents.at(-1)).toMatchObject({ type: "text", size: "sm", weight: "bold", wrap: true });
});

it("uses bundled HTTPS decorative icons while keeping readable content if images cannot load", () => {
  const card = buildConversationCard({ type: "text", text: "ยังไม่ได้เปลี่ยนข้อมูลครับ" }, "ตรวจคำขออีกครั้ง");
  if (card.type !== "flex") throw Error("expected Flex");
  expect(card.contents.header?.contents[0]).toMatchObject({ type: "image", url: expect.stringMatching(/^https:\/\/.*\/icons\/porchai\/warning.png$/u) });
  expect(card.contents.body.contents[0]).toMatchObject({ text: "ยังไม่ได้เปลี่ยนข้อมูลครับ", wrap: true });
  for (const name of ["bell", "chat", "check", "clock", "settings", "warning", "receipt", "budget-calendar", "gift-box", "wallet", "piggy-bank"])
    expect(existsSync(`public/icons/porchai/${name}.png`)).toBe(true);
});
