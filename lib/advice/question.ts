// Card 15: reading «พรุ่งนี้กินชาบู 300 บาทไหวไหม». The AI reads it first (lib/advice/advise.ts);
// these rules are the fallback when it is not available, and the guards on what it returns.

export type Day = "today" | "tomorrow" | "day_after_tomorrow";

export interface Question {
  item: string | null;
  amount: number | null; // satang; null = not stated clearly → ask
  day: Day;
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
// A question or a "what if" is never recorded (bug 13 Nov: «ถ้ากิน ชาบู 150 บาท จะเหลือเงินใช้วันละเท่าไร»
// was saved as a 150 baht spend). Words that also live inside item names are only matched where they
// cannot be one: น้ำเปล่า (เปล่า), ผ้าไหม (ไหม), มะม่วง (มะ) — see question.test.ts.
const QUESTION_WORDS =
  /ไหวไหม|ไหวมั้ย|ไหว\?|พอไหม|พอมั้ย|ได้ไหม|ได้มั้ย|ดีไหม|ดีมั้ย|ควรไหม|เท่าไร|เท่าไหร|เท่าใด|กี่|หรือเปล่า|รึเปล่า|ยังไง|อย่างไร|ทำไม|ถ้า|สมมติ|สมมุติ|[?？]/;
const QUESTION_START = /^(หาก|ควร)/;
const QUESTION_END = /(ไหม|มั้ย|มั๊ย|ม้าย|ป่ะ|ปะ|ป่าว)$/;
// Polite endings after the question word: «ไหวไหมครับ», «ดีมั้ยนะ»
const PARTICLES = /(\s*(ครับ|คับ|ค่ะ|คะ|นะ|จ้า|จ๊ะ|อะ|อ่ะ|เนี่ย))+$/;
const APPROXIMATE = /กว่า|ประมาณ|ราว|เกือบ|~|\d\s*-\s*\d/;
const NUMBER = /\d+(?:\.\d{1,2})?/g;
// Longer phrases first: «เหลือเงินใช้วันละเท่าไร» goes as one, before «เหลือ» or «เท่าไร» alone
const FILLER =
  /ไหวไหม|ไหวมั้ย|พอไหม|พอมั้ย|ได้ไหม|ได้มั้ย|ดีไหม|ดีมั้ย|ควรไหม|เหลือเงินใช้วันละ|เหลือวันละ|หรือเปล่า|รึเปล่า|เท่าไหร่|เท่าไหร|เท่าไร|เท่าใด|กี่บาท|กี่วัน|ไหม|มั้ย|มั๊ย|ป่ะ|ป่าว|ไหว|ครับ|ค่ะ|คะ|ถ้า|สมมติ|สมมุติ|หาก|ควร|แล้ว|เหลือ|ยังไง|อย่างไร|ให้พอ|พรุ่งนี้|มะรืน(?:นี้)?|วันนี้|อยาก|จะ|กิน|ซื้อ|ดู|บาท|฿|[?？]/g;

function normalize(text: string): string {
  return text
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .trim();
}

export function isQuestion(text: string): boolean {
  const t = text.trim();
  const bare = t.replace(PARTICLES, "").trim();
  return QUESTION_WORDS.test(t) || QUESTION_START.test(bare) || QUESTION_END.test(bare);
}

// «เหลือเท่าไร», «งบเหลือป่ะ», «วันนี้ใช้ไปเท่าไร», «เช็คยอด»: the whole message is made of these words
// and nothing else — an item («ชาบู»), a number or another span («สัปดาห์นี้») is not this ask.
const BALANCE_WORDS =
  /เช็ค|เช็ก|ดู|ตอนนี้|วันนี้|ยัง|อีก|ทั้งหมด|เงิน|เหลือ|ใช้ไป|ใช้ได้|ใช้|แล้ว|งบ|ยอด|วันละ|กี่บาท|เท่าไหร่|เท่าไหร|เท่าไร|เท่าใด|หรือเปล่า|รึเปล่า|ไหม|มั้ย|มั๊ย|ป่ะ|ปะ|ป่าว|บ้าง|หน่อย|ครับ|คับ|ค่ะ|คะ|นะ|จ้า|อะ|อ่ะ|ฉัน|เรา|ผม|หนู|[?？]|\s/g;
const BALANCE_TOPIC = /เหลือ|ใช้|งบ|ยอด/;
// A bare «เหลือ» or «ใช้» says nothing: it needs a question word, or a word asking to see (เช็ค/ดู/ยอด/งบ)
const BALANCE_ASK = /เท่า|กี่|ไหม|มั้ย|มั๊ย|ป่ะ|ปะ|ป่าว|เปล่า|บ้าง|[?？]|เช็ค|เช็ก|ดู|ยอด|งบ/;

export function isBalanceQuestion(raw: string): boolean {
  const text = normalize(raw);
  if (!BALANCE_TOPIC.test(text) || !BALANCE_ASK.test(text)) return false;
  return text.replace(BALANCE_WORDS, "") === "";
}

export function dayOf(text: string): Day {
  if (/มะรืน/.test(text)) return "day_after_tomorrow";
  if (/พรุ่งนี้/.test(text)) return "tomorrow";
  return "today";
}

export function readQuestion(raw: string): Question {
  const text = normalize(raw);
  const numbers = text.match(NUMBER) ?? [];
  const exact = numbers.length === 1 && !APPROXIMATE.test(text);
  const amount = exact ? Math.round(Number(numbers[0]) * 100) : null;
  const item = text.replace(NUMBER, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim().slice(0, 40) || null;
  return { item, amount: amount && amount > 0 ? amount : null, day: dayOf(text) };
}

// Numbers as a person reads them in a sentence (1,440 → 1440, ๙๙ → 99)
export function numbersIn(text: string): number[] {
  return (normalize(text).match(NUMBER) ?? []).map(Number);
}

// The AI only words the answer: every number it writes must be one the calculator gave it
export function onlyKnownNumbers(text: string, known: number[]): boolean {
  return numbersIn(text).every((n) => known.includes(n));
}

// Never suggested by the AI, in any answer: cutting food or transport, or touching savings (card 15)
export const FORBIDDEN = /ลดค่ากิน|ลดค่าอาหาร|ลดค่ารถ|ลดค่าเดินทาง|กินน้อยลง|อดข้าว|ถอนเงินออม|ใช้เงินออม/;
