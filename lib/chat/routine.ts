import type { Reading } from "./converse";

const GREETINGS = new Set(["ไง", "สวัสดี", "หวัดดี", "hi", ".", "555"]);
const INTRO = new Set(["นายเป็นใคร", "คุณเป็นใคร", "ชื่ออะไร"]);
const HELP = new Set(["ใช้ยังไง", "ใช้อย่างไร", "ทำอะไรได้บ้าง"]);
const ITEMS = new Set(["ข้าว", "กาแฟ", "ค่ารถ"]);

// Exact routine intents only. The caller checks pending financial answers before reaching this.
export function routineChat(message: string): Reading | null {
  const key = message.trim().toLowerCase().replace(/(?:ครับ|ค่ะ|คะ|นะ|จ้า)+$/u, "").trim();
  if (GREETINGS.has(key)) return { kind: "chat", reply: "สวัสดีครับ น้องพอใช้ช่วยจดรายจ่ายและช่วยคิดก่อนจ่ายได้ครับ" };
  if (INTRO.has(key)) return { kind: "chat", reply: "น้องพอใช้ครับ เป็นเพื่อนช่วยจดและวางแผนเงินให้คุณครับ" };
  if (HELP.has(key)) return { kind: "chat", reply: "พิมพ์ชื่อรายการกับยอดเพื่อจดรายจ่าย หรือถามชื่อของกับราคาก่อนซื้อได้ครับ ดูแผนเงินได้ที่ปุ่มเปิดแอปด้านล่างครับ" };
  if (key === "ขอบคุณ") return { kind: "chat", reply: "ยินดีครับ ให้น้องพอใช้ช่วยดูเรื่องเงินได้เสมอครับ" };
  if (key === "ฝันดี") return { kind: "chat", reply: "ฝันดีครับ พักผ่อนให้เต็มที่ครับ" };
  if (ITEMS.has(key)) return { kind: "spend", item: key };
  return null;
}
