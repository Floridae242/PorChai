import { describe, expect, it } from "vitest";
import {
  installmentSchedule,
  parseInstallment,
  type InstallmentInput,
} from "./installments";
import { parseIntent } from "./parse";
const today = "2026-11-15";
const input: InstallmentInput = {
  title: "โทรศัพท์",
  total: 100000,
  count: 3,
  firstDue: "2026-12-31",
};
describe("installment schedules and invalid input", () => {
  it("splits exact satang, clamps short months and returns to the original day", () => {
    const rows = installmentSchedule(input, today);
    expect(rows.map((r) => r.amount)).toEqual([33334, 33333, 33333]);
    expect(rows.map((r) => r.dueOn)).toEqual([
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
    ]);
    expect(
      installmentSchedule({ ...input, count: 4 }, today).at(-1)?.dueOn,
    ).toBe("2027-03-31");
  });
  it("supports leap day, Thai digits, commas and an explicitly stated per-installment amount", () => {
    expect(
      installmentSchedule({ ...input, firstDue: "2028-01-31" }, today)[1].dueOn,
    ).toBe("2028-02-29");
    expect(
      parseInstallment(
        "ผ่อน โทรศัพท์ ยอดรวม ๑๒,๐๐๐ บาท ๑๒ งวด เริ่ม 2026-12-01",
        today,
      ),
    ).toMatchObject({ total: 1200000, count: 12 });
    expect(
      parseInstallment("ผ่อน โทรศัพท์ งวดละ 1000 บาท 12 งวด เริ่ม 2026-12-01", today)
        .total,
    ).toBe(1200000);
  });
  it.each([
    { total: 0 },
    { total: -1 },
    { total: NaN },
    { total: Infinity },
    { total: 1.5 },
    { total: 10000001 },
    { total: Number.MAX_SAFE_INTEGER },
    { count: 0 },
    { count: -1 },
    { count: 1.2 },
    { count: 61 },
    { count: NaN },
    { count: Infinity },
    { total: 1, count: 2 },
    { title: "" },
    { title: "  " },
    { title: "x".repeat(41) },
    { firstDue: "2026-02-30" },
    { firstDue: "2026-11-14" },
    { firstDue: "2091-01-01" },
    { firstDue: "2026-13-01" },
    { firstDue: "bad" },
    { firstDue: "2026-2-01" },
  ])("rejects invalid schedule %j", (patch) =>
    expect(() => installmentSchedule({ ...input, ...patch }, today)).toThrow(),
  );
  it.each([
    "ผ่อน โทรศัพท์ 12000 12 งวด",
    "ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด",
    "ผ่อน โทรศัพท์ ยอดรวม 12000 บาท เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม -100 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100.999 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2.5 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 0 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 61 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ งวดละ 100000 บาท 60 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2 งวด เริ่ม 2026-12-01 ดาวน์ 10",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2 งวด เริ่ม 2026-12-01 ดอกเบี้ย 0%",
    "ผ่อน โทรศัพท์ ประมาณ 100 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 หรือ 200 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ งวดละ 100 บาท 2 งวดรายวัน เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 1e4 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2 งวด เริ่ม 2026-12-01 แล้วจ่ายทันที",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2 งวด เริ่ม 2026-12-01 ไหวไหม",
  ])("ambiguous installment text cannot become an expense: %s", (message) => {
    expect(parseIntent(message, today)?.tool).toBe("installments");
    expect(() => parseInstallment(message, today)).toThrow();
  });
  it("rejects oversized chat input before running the command grammar", () => {
    expect(() => parseInstallment("ผ่อน " + "x".repeat(20000), today)).toThrow(
      "ยาวเกินไป",
    );
  });
  it("preserves total and ascending dates for all supported counts and rounding patterns", () => {
    for (let count = 1; count <= 60; count++)
      for (const total of [count, count + 1, 10001, 10000000]) {
        const rows = installmentSchedule({ ...input, count, total }, today);
        expect(rows).toHaveLength(count);
        expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(total);
        expect(
          Math.max(...rows.map((r) => r.amount)) -
            Math.min(...rows.map((r) => r.amount)),
        ).toBeLessThanOrEqual(1);
        expect(
          rows.every(
            (r, i) => r.amount > 0 && (i === 0 || r.dueOn > rows[i - 1].dueOn),
          ),
        ).toBe(true);
      }
  });
});
