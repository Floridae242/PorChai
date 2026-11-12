// Card 15: reading «พรุ่งนี้กินชาบู 300 บาทไหวไหม». The AI reads it first (lib/advice/advise.ts);
// these rules are the fallback when it is not available, and the guards on what it returns.

export type Day = "today" | "tomorrow" | "day_after_tomorrow";

export interface Question {
  item: string | null;
  amount: number | null; // satang; null = not stated clearly → ask
  day: Day;
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const QUESTION = /ไหวไหม|ไหวมั้ย|ไหว\?|พอไหม|พอมั้ย|ได้ไหม|ได้มั้ย|ดีไหม|ดีมั้ย|ควรไหม|ไหม$|มั้ย$|\?/;
const APPROXIMATE = /กว่า|ประมาณ|ราว|เกือบ|~|\d\s*-\s*\d/;
const NUMBER = /\d+(?:\.\d{1,2})?/g;
const FILLER =
  /ไหวไหม|ไหวมั้ย|พอไหม|พอมั้ย|ได้ไหม|ได้มั้ย|ดีไหม|ดีมั้ย|ควรไหม|ไหม|มั้ย|ไหว|พรุ่งนี้|มะรืน(?:นี้)?|วันนี้|อยาก|จะ|กิน|ซื้อ|ดู|บาท|฿|\?/g;

function normalize(text: string): string {
  return text
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .trim();
}

export function isQuestion(text: string): boolean {
  return QUESTION.test(text.trim());
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
