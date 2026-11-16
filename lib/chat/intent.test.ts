import { describe, expect, it } from "vitest";
import { conversationBoundary } from "./intent";

// 16 Nov: «ทอนเงินมา 20» was a food expense, «ถูกหวย 1000» an expense over today's budget
describe("money that came in by an unclear way is asked, never recorded", () => {
  it.each(["ทอนเงินมา 20", "เงินทอน 15", "ถูกหวย 1000", "ถูกรางวัล 500", "ได้เงินคืน 50"])("«%s» is asked back", (text) => {
    const reply = conversationBoundary(text);
    expect(reply).toContain("ได้รับเงิน");
    expect(reply).toContain("รายจ่าย");
  });
  it.each(["ข้าว 50", "ต้มยำ 80", "หวยออกวันไหน"])("«%s» is not this question", (text) => {
    expect(conversationBoundary(text) ?? "").not.toContain("ทอน");
  });
});
