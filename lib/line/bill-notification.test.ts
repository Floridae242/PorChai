import { describe, it, expect } from "vitest";
import { billNotification } from "./bill-notification";
describe("bill reminder Flex", () => {
  it.each([0, 3] as const)(
    "has exact amount/date and no write callback for lead %s",
    (lead) => {
      const card = billNotification(
          {
            title: "ค่าหอ",
            amount: 300000,
            dueOn: "2027-02-28",
            repeat: "monthly",
          },
          lead,
        ),
        json = JSON.stringify(card);
      expect(card.type).toBe("flex");
      expect(json).toContain("3,000 บาท");
      expect(json).toContain("28 กุมภาพันธ์ 2570");
      expect(json).toContain(lead === 3 ? "อีก 3 วัน" : "ครบกำหนดวันนี้");
      expect(json).not.toContain('"postback"');
      expect(json.length).toBeLessThan(30000);
      expect(json).toContain("ยังไม่บันทึกรายจ่าย");
    },
  );
});
