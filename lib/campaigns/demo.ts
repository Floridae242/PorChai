import type { CampaignReportInput } from "./report";

/** Fictional proposal for the team's demo, not a live merchant offer or research result. */
export const demoCampaign = {
  id: "demo-tuesday-buffet",
  title: "อิ่มวันอังคารในงบ",
  merchantLabel: "ร้านหมูกระทะตัวอย่าง (สมมติ)",
  priceSatang: 12900,
  feePerRedemptionSatang: 500,
  payer: "ร้านค้าจ่ายค่าบริการตามการใช้สิทธิ์ที่ยืนยันสำเร็จ",
  terms: [
    "ข้อเสนอสมมติ: ราคา 129 บาทต่อคน รวมค่าใช้จ่ายทั้งหมดตามตัวอย่าง",
    "ใช้วันอังคาร เฉพาะช่วงที่ร้านและทีมยืนยันร่วมกันก่อนเปิดแคมเปญ",
    "ต้องระบุวันเริ่ม วันหมดอายุ เวลา สาขา และจำนวนสิทธิ์ก่อนเปิดใช้จริง",
    "ร้านยืนยันโค้ดที่ยังไม่หมดอายุได้ครั้งเดียว ระบบต้องปฏิเสธโค้ดซ้ำ",
    "นำเสนอให้ผู้ใช้เมื่อราคาอยู่ในงบซื้อเพิ่มจากแผนล่าสุด",
  ],
  reporting: "ร้านเห็นเฉพาะยอดดู รับ และใช้สิทธิ์รวม พร้อมช่วงวันที่ ไม่มีชื่อหรือประวัติรายจ่ายส่วนบุคคล",
} as const;

export const demoReportInput: CampaignReportInput = {
  views: 60,
  claimed: 30,
  redeemed: 20,
  feePerRedemptionSatang: demoCampaign.feePerRedemptionSatang,
};

export const demoReportPeriod = "10–17 พฤศจิกายน 2569 (ช่วงข้อมูลสมมติ)";
