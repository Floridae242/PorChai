import { describe, expect, it } from "vitest";
import { dueHabit, findHabits, habitKey, type EntryForHabit } from "@/lib/remind/habits";

// Card 58: a habit = the same item name on at least 3 of the last 7 days (Figma F2: "ดูจากรายการที่ยืนยันแล้ว
// 3 วันขึ้นไป"). Reminded once a day at the user's time, only if it is usually recorded by then and
// not recorded today.

const TODAY = "2026-11-13";
const e = (note: string, amount: number, spentOn: string, time = "12:10", extra: Partial<EntryForHabit> = {}): EntryForHabit => ({
  note,
  amount,
  category: "food",
  spentOn,
  createdAt: `${spentOn}T${time}:00+07:00`,
  source: "chat",
  ...extra,
});

describe("habitKey", () => {
  it("the same name however it was typed", () => {
    expect(habitKey(" ข้าวเที่ยง ")).toBe(habitKey("ข้าวเที่ยง"));
    expect(habitKey("Grab")).toBe(habitKey("grab"));
    expect(habitKey("ข้าว  มันไก่")).toBe(habitKey("ข้าว มันไก่"));
  });
});

describe("findHabits", () => {
  const lunch = [e("ข้าวเที่ยง", 5000, "2026-11-10"), e("ข้าวเที่ยง", 4500, "2026-11-11", "12:40"), e("ข้าวเที่ยง", 5500, "2026-11-12", "12:20")];

  it("F2: ข้าวเที่ยง on 3 of the last 7 days → a habit of about 50 baht around 12:20", () => {
    expect(findHabits(lunch, TODAY)).toEqual([
      { key: "ข้าวเที่ยง", label: "ข้าวเที่ยง", amount: 5000, category: "food", time: "12:20", days: 3 },
    ]);
  });

  it("2 days is not enough history", () => {
    expect(findHabits(lunch.slice(0, 2), TODAY)).toEqual([]);
  });

  it("3 entries on one day are one day", () => {
    expect(findHabits([e("กาแฟ", 4000, "2026-11-12"), e("กาแฟ", 4000, "2026-11-12"), e("กาแฟ", 4000, "2026-11-12")], TODAY)).toEqual([]);
  });

  it("only the last 7 days count, not today and not older", () => {
    const old = [e("ข้าวเที่ยง", 5000, "2026-11-05"), e("ข้าวเที่ยง", 5000, "2026-11-12"), e("ข้าวเที่ยง", 5000, TODAY)];
    expect(findHabits(old, TODAY)).toEqual([]);
    expect(findHabits([e("ข้าวเที่ยง", 5000, "2026-11-06"), ...lunch.slice(0, 2)], TODAY)).toHaveLength(1); // 7 days back counts
  });

  it("the amount is the middle one (median), not pulled up by one big day", () => {
    const h = findHabits([...lunch, e("ข้าวเที่ยง", 30000, "2026-11-09")], TODAY);
    expect(h[0].amount).toBe(5000); // 4500 5000 5500 30000 → lower middle
  });

  it("cancelled entries and plan payments are not habits; reminder entries are", () => {
    const cancelled = lunch.map((x) => ({ ...x, cancelled: true }));
    expect(findHabits(cancelled, TODAY)).toEqual([]);
    expect(findHabits(lunch.map((x) => ({ ...x, source: "plan" as const })), TODAY)).toEqual([]);
    expect(findHabits(lunch.map((x) => ({ ...x, source: "reminder" as const })), TODAY)).toHaveLength(1);
  });

  it("the category is the most recent one (L9 may have changed it)", () => {
    const h = findHabits([...lunch.slice(0, 2), e("ข้าวเที่ยง", 5000, "2026-11-12", "12:20", { category: "other" })], TODAY);
    expect(h[0].category).toBe("other");
  });

  it("most frequent first", () => {
    const coffee = [e("กาแฟ", 4000, "2026-11-08", "08:00"), e("กาแฟ", 4000, "2026-11-09", "08:00"), e("กาแฟ", 4000, "2026-11-10", "08:00"), e("กาแฟ", 4000, "2026-11-11", "08:00")];
    expect(findHabits([...lunch, ...coffee], TODAY).map((h) => h.label)).toEqual(["กาแฟ", "ข้าวเที่ยง"]);
  });
});

describe("dueHabit — once a day at the user's time", () => {
  const habits = findHabits(
    [e("ข้าวเที่ยง", 5000, "2026-11-10"), e("ข้าวเที่ยง", 5000, "2026-11-11"), e("ข้าวเที่ยง", 5000, "2026-11-12")],
    TODAY,
  );

  it("F2 12:30, nothing recorded today → remind ข้าวเที่ยง", () => {
    expect(dueHabit(habits, [], "12:30", "12:30")?.label).toBe("ข้าวเที่ยง");
    expect(dueHabit(habits, [], "12:30", "13:15")?.label).toBe("ข้าวเที่ยง");
  });

  it("before the time: nothing", () => {
    expect(dueHabit(habits, [], "12:30", "12:29")).toBeNull();
  });

  it("already recorded today (any amount): nothing", () => {
    expect(dueHabit(habits, [e("ข้าวเที่ยง", 6000, TODAY)], "12:30", "12:45")).toBeNull();
  });

  it("a habit usually recorded after the reminder time is not reminded yet (dinner at 12:30 would be wrong)", () => {
    const dinner = findHabits([e("ข้าวเย็น", 6000, "2026-11-10", "19:00"), e("ข้าวเย็น", 6000, "2026-11-11", "19:00"), e("ข้าวเย็น", 6000, "2026-11-12", "19:00")], TODAY);
    expect(dueHabit(dinner, [], "12:30", "13:00")).toBeNull();
  });

  it("already reminded, recorded or skipped today: the caller passes those keys and they are left out", () => {
    expect(dueHabit(habits, [], "12:30", "13:00", new Set(["ข้าวเที่ยง"]))).toBeNull();
  });
});
