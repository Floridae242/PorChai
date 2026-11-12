// Fixture data for the mock API. The shops, prices and rewards are FAKE: Figma reference content,
// not real businesses. All promos are sponsored.
import type { Category } from "@/lib/api-types";

export const DEFAULT_TODAY = "2026-11-11";
export const CYCLE_DAYS = 12; // default payday = today + 12 days (2026-11-23)
export const CONSENT_VERSION = "2026-11-11";

export const DEFAULT_CYCLE = {
  balance: 240000,
  savings: 24000,
  emergencyBuffer: 12000,
  essentialPerDay: 7000,
  bills: [
    { title: "ค่าหอ", amount: 40000 },
    { title: "ค่าน้ำ", amount: 5000 },
    { title: "ค่าไฟ", amount: 15000 },
  ],
};

// Earlier spending of the 'midCycle' scenario: day 1..4 of the cycle, then today
export const MID_CYCLE_ENTRIES: { dayOffset: number; amount: number; category: Category; note: string }[] = [
  { dayOffset: 0, amount: 10000, category: "food", note: "อาหาร" },
  { dayOffset: 1, amount: 11000, category: "food", note: "อาหาร" },
  { dayOffset: 2, amount: 9000, category: "transport", note: "ค่าเดินทาง" },
  { dayOffset: 3, amount: 18000, category: "supplies", note: "ของใช้" },
  { dayOffset: 4, amount: 4500, category: "food", note: "ข้าว" }, // today = day 5, offset 4 from the cycle start
];

export interface PromoFixture {
  id: string;
  shop: string;
  title: string;
  price: number; // satang
  validDays: string;
  terms: string[];
  expiresOn: string;
}

export const PROMO_FIXTURES: PromoFixture[] = [
  {
    id: "promo-moo-krata",
    shop: "หมูกระทะลุงชัย",
    title: "ชุดหมูกระทะ 1 คน",
    price: 12900,
    validDays: "ทุกวันอังคาร",
    terms: ["ใช้ได้ถึง 30 พ.ย. 2569", "1 สิทธิ์ต่อคน"],
    expiresOn: "2026-11-30",
  },
  {
    id: "promo-chanom",
    shop: "ชานมหน้ามอ",
    title: "ชานมไข่มุก แก้วใหญ่",
    price: 3500,
    validDays: "ทุกวัน",
    terms: ["1 สิทธิ์ต่อคน"],
    expiresOn: "2026-11-30",
  },
];

export const REWARD_FIXTURES = [{ id: "reward-sticker", name: "สติกเกอร์พอใช้", cost: 10, stock: 5 }];

export const START_POINTS = 11;
