// «ลบข้อมูลได้ไหม», «อยากลบบัญชี»: how to delete the account (ตั้งค่า › ลบข้อมูลของฉัน). Answered by a
// rule, never the AI, and never done from the chat: it cannot be undone, so the user confirms in the app.
// One entry («ลบรายการล่าสุด», «ลบบิล …») is the chat command in lib/chat/actions, not this.
const ONE_THING = /รายการ|รายจ่าย|รายรับ|บิล|แผน|งวด/;
const ACCOUNT = /ลบ.*(?:ข้อมูล|บัญชี|แอคเคาท์|แอคเค้าท์|แอคเคาน์|ทั้งหมด)|delete.*(?:account|data)/;

export function isDeleteDataAsk(raw: string): boolean {
  const text = raw.toLowerCase().replace(/\s+/g, "");
  return ACCOUNT.test(text) && !ONE_THING.test(text);
}
