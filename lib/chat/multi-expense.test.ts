import { describe, expect, it } from "vitest";
import { splitExplicitExpenses } from "./multi-expense";

describe("explicit expense lists without an AI service", () => {
  it("reads the reported LINE message including repeated amounts", () => {
    expect(splitExplicitExpenses("กินปลาหมึกย่าง 70 บาท น้ำส้มอีก 30 บาท ซูชิอีก 30 บาท")).toEqual([
      {title:"ปลาหมึกย่าง",amount:7000,category:"food"},
      {title:"น้ำส้ม",amount:3000,category:"food"},
      {title:"ซูชิ",amount:3000,category:"food"},
    ]);
  });
  it.each([
    "ข้าว 50 น้ำ 20", "ข้าว50บาทน้ำ20บาท", "ข้าว 50, น้ำ 20", "ข้าว 50 และ น้ำ 20 ครับ",
    "ข้าว 50\nน้ำ 20", "ข้าว 50; น้ำ 20", "ข้าว ๕๐ น้ำ ๒๐", "ข้าว 50.00 บาท น้ำ 20.00 บาท",
  ])("reads complete name/price pairs: %s", (message) => {
    expect(splitExplicitExpenses(message)?.map(i=>i.amount)).toEqual([5000,2000]);
  });
  // 16 Nov: the second item came out «หม่าล่าไป · อื่น ๆ»
  it("«กิน ปลาหมึก 60 กับ หม่าล่าไป 50»: both food, no «ไป» in the name", () => {
    expect(splitExplicitExpenses("กิน ปลาหมึก 60 กับ หม่าล่าไป 50")).toEqual([
      {title:"ปลาหมึก",amount:6000,category:"food"},
      {title:"หม่าล่า",amount:5000,category:"food"},
    ]);
  });
  it("keeps thousand separators and distinct categories", () => {
    expect(splitExplicitExpenses("ของใช้ 1,200.50 บาท รถเมล์ 20 บาท")?.map(i=>[i.amount,i.category])).toEqual([[120050,"supplies"],[2000,"transport"]]);
  });
  it.each([
    "ข้าว 50", "ข้าว 50 น้ำ", "ข้าว 50 น้ำ 20 รวม 70", "ข้าว 50 หรือ 60",
    "ข้าว 50 ไม่สิ 60", "ข้าว 50 น้ำ -20", "ข้าว 50 น้ำ 0", "ข้าว 50 น้ำ 20.123",
    "ข้าว 2 จาน 100 น้ำ 20", "รับเงิน 1000 ข้าว 50", "ข้าว 50 รับเงิน 1000",
    "เมื่อวาน ข้าว 50 น้ำ 20", "พรุ่งนี้ ข้าว 50 น้ำ 20", "ข้าว 50 น้ำ 20 ไหวไหม",
    "ไม่ต้องจดข้าว 50 น้ำ 20", "ข้าว 50 โอนให้เพื่อน 20", "ข้าว 50 หาร 2 คน",
    "ข้าว 50 น้ำ 20 วันที่ 15/11", "ข้าว 50 น้ำ 100001", "ข้าว 50 น้ำ 20 เบอร์ 0812345678",
    "ข้าว 1e3 บาท น้ำ 20 บาท", "ข้าว 1E3 น้ำ 20", "ข้าว 0x10 น้ำ 20", "ข้าว 1k น้ำ 20", "ข้าว 1พัน น้ำ 20", "ข้าว 50 น้ำ 20 ลด 10%", "ข้าว ๑e๓ น้ำ ๒๐",
    "ข้าว 1 น้ำ 2 กาแฟ 3 ขนม 4 รถ 5 สมุด 6",
  ])("does not propose incomplete or ambiguous lists: %s", message => {
    expect(splitExplicitExpenses(message)).toBeNull();
  });
});
