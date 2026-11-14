import { describe, expect, it } from "vitest";
import { baht } from "@/lib/calc/money";
import {
  computeBudget,
  simulatePurchase,
  type BudgetInput,
} from "@/lib/calc/budget";
import { parseNewEntry, parseBalanceCheck } from "@/lib/validate";
import { HttpError } from "@/lib/http";

/**
 * Adapter Helper: แปลงข้อมูลให้อยู่ในโครงสร้าง BudgetInput ของระบบ "พอใช้"
 */
const TODAY = "2026-11-11";

function createBudgetInput(over: {
  balanceBaht: number;
  reservedBaht?: number;
  savingsBaht?: number;
  emergencyBufferBaht?: number;
  daysLeft: number;
  spentTodayBaht?: number;
}): BudgetInput {
  const {
    balanceBaht,
    reservedBaht = 0,
    savingsBaht = 0,
    emergencyBufferBaht = 0,
    daysLeft,
    spentTodayBaht = 0,
  } = over;

  const payday = new Date(Date.UTC(2026, 10, 11 + daysLeft))
    .toISOString()
    .slice(0, 10);

  return {
    balance: baht(balanceBaht),
    reserved: baht(reservedBaht),
    savings: baht(savingsBaht),
    emergencyBuffer: baht(emergencyBufferBaht),
    spentToday: baht(spentTodayBaht),
    essentialPerDay: null,
    today: TODAY,
    payday,
  };
}

describe("1. [TC-01 ถึง TC-03] ชุดตัวอย่างกลาง 1,000 บ. บิลค่าหอ 300 บ. เหลือ 7 วัน", () => {
  // สภาพแวดล้อมเริ่มต้น: เงินจริง 1,000 บ., บิลค่าหอ 300 บ., เหลือ 7 วัน
  const baseInput = createBudgetInput({
    balanceBaht: 1000,
    reservedBaht: 300,
    daysLeft: 7,
  });

  it("TC-01: ก่อนลอง และลองซื้อ 140 บ. (Simulated) เงินจริงไม่เปลี่ยน", () => {
    // 1.1 ก่อนลอง: เงินยังไม่จัดสรร 700 บ., เฉลี่ย 100 บ./วัน
    const before = computeBudget(baseInput);
    expect(baseInput.balance).toBe(baht(1000));
    expect(before).toMatchObject({
      kind: "ok",
      usable: baht(700),
      dailyBudget: baht(100),
    });

    // 1.2 ลองซื้อ 140 บ. (Simulated): ยังไม่จัดสรร 560 บ., เฉลี่ย 80 บ./วัน, เงินจริงยัง 1,000 บ.
    const tried = simulatePurchase(baseInput, baht(140));
    expect(baseInput.balance).toBe(baht(1000)); // เงินจริงต้องไม่ถูกหัก
    expect(tried).toMatchObject({
      kind: "ok",
      usable: baht(560),
      dailyBudget: baht(80),
    });
  });

  it("TC-02: กดกันไว้ (Reserved) 140 บ. ยอดกันไว้รวม 440 บ., เงินจริงยัง 1,000 บ., เฉลี่ย 80 บ./วัน", () => {
    const reservedInput = createBudgetInput({
      balanceBaht: 1000,
      reservedBaht: 300 + 140, // 440 บ.
      daysLeft: 7,
    });
    expect(reservedInput.balance).toBe(baht(1000)); // เงินจริงยังไม่ถูกตัด
    const result = computeBudget(reservedInput);
    expect(result).toMatchObject({
      kind: "ok",
      usable: baht(560),
      dailyBudget: baht(80),
    });
  });

  it("TC-03: กดจ่ายจริง (Spent) 140 บ. เงินจริงลดเหลือ 860 บ., ยอดกันไว้ลดเหลือ 300 บ., เฉลี่ย 80 บ./วัน", () => {
    // เมื่อจ่ายจริง 140 บ. เงินสดลดเหลือ 860 บ. และยอดกันไว้ปลดล็อกเหลือ 300 บ. (ไม่หักซ้ำ)
    const paidInput = createBudgetInput({
      balanceBaht: 860,
      reservedBaht: 300,
      daysLeft: 7,
    });
    expect(paidInput.balance).toBe(baht(860));
    const result = computeBudget(paidInput);
    expect(result).toMatchObject({
      kind: "ok",
      usable: baht(560),
      dailyBudget: baht(80),
    });
  });
});

describe("2. [TC-04] เคสแยก 700 บาท บิล 0 บาท เหลือ 3 วัน ลองจ่าย 300 บาท", () => {
  const baseInput = createBudgetInput({
    balanceBaht: 700,
    reservedBaht: 0,
    daysLeft: 3,
  });

  it(
    "TC-04 (ก่อนลอง): 700 บ. 3 วัน ควรได้ 233.25 บ./วัน (23,325 สตางค์)",
    () => {
      const result = computeBudget(baseInput);
      expect(result).toMatchObject({
        kind: "ok",
        usable: baht(700),
        dailyBudget: 23325, // 233.25 บาท
      });
    },
  );

  it(
    "TC-04 (หลังลอง): ลอง 300 บ. เหลือ 400 บ. 3 วัน ควรได้ 133.25 บ./วัน (13,325 สตางค์)",
    () => {
      const tried = simulatePurchase(baseInput, baht(300));
      expect(baseInput.balance).toBe(baht(700)); // เงินจริงไม่เปลี่ยน
      expect(tried).toMatchObject({
        kind: "ok",
        usable: baht(400),
        dailyBudget: 13325, // 133.25 บาท
      });
    },
  );
});

describe("3. [TC-06] เงินขาด: เงิน 500 บ. บิล 600 บ. เหลือ 5 วัน", () => {
  it("TC-06: ต้องคืนสถานะ shortfall ขาด 100 บ. และ usable ติดลบ (ไม่แสดงงบรายวันเป็นค่าบวก)", () => {
    const input = createBudgetInput({
      balanceBaht: 500,
      reservedBaht: 600,
      daysLeft: 5,
    });
    const result = computeBudget(input);
    expect(result).toMatchObject({
      kind: "shortfall",
      usable: -baht(100),
      shortfall: baht(100),
      daysLeft: 5,
    });
    // ตรวจสอบว่าไม่มี dailyBudget ในกรณี shortfall
    expect("dailyBudget" in result).toBe(false);
  });
});

describe("4. [TC-07] วันรับเงินคือวันนี้ (เหลือ 0 วัน)", () => {
  it("TC-07: วันที่เหลือ = 0 คืนสถานะ payday-passed ไม่เกิด NaN หรือ Infinity จากการหารด้วย 0", () => {
    const input = createBudgetInput({
      balanceBaht: 600,
      reservedBaht: 0,
      daysLeft: 0,
    });
    const result = computeBudget(input);
    expect(result).toMatchObject({
      kind: "payday-passed",
      usable: baht(600),
    });
    expect("dailyBudget" in result).toBe(false);
  });
});

describe("5. [TC-08] เลื่อนวันรับเงิน: เงินยังไม่จัดสรร 600 บ. จาก 6 วัน เป็น 10 วัน", () => {
  it("TC-08: งบเฉลี่ยลดจาก 100 บ./วัน เหลือ 60 บ./วัน", () => {
    const original = computeBudget(
      createBudgetInput({ balanceBaht: 600, daysLeft: 6 }),
    );
    expect(original).toMatchObject({
      kind: "ok",
      dailyBudget: baht(100),
      daysLeft: 6,
    });

    const postponed = computeBudget(
      createBudgetInput({ balanceBaht: 600, daysLeft: 10 }),
    );
    expect(postponed).toMatchObject({
      kind: "ok",
      dailyBudget: baht(60),
      daysLeft: 10,
    });
  });
});

describe("6. [TC-11, TC-12] จ่ายจริงเกิน/ต่ำกว่ายอดที่กันไว้ (ปรับที่เงินยังไม่จัดสรร)", () => {
  it("TC-11: กันไว้ 100 บ. จ่ายจริง 150 บ. (เงินจริง 600 → 450 บ., กันไว้ 0 บ., 5 วัน) งบเหลือ 90 บ./วัน", () => {
    // เดิม: เงินจริง 600 บ. กันไว้ 100 บ. (ยังไม่จัดสรร 500 บ., 5 วัน = 100 บ./วัน)
    // จ่ายจริง 150 บ. เกินมา 50 บ. -> เงินจริงเหลือ 450 บ. กันไว้ลดเป็น 0 บ.
    // ยอดยังไม่จัดสรรปรับเป็น 450 บ. -> งบเฉลี่ยหลังปรับ = 450 / 5 = 90 บ./วัน
    const input = createBudgetInput({
      balanceBaht: 450,
      reservedBaht: 0,
      daysLeft: 5,
    });
    const result = computeBudget(input);
    expect(result).toMatchObject({
      kind: "ok",
      usable: baht(450),
      dailyBudget: baht(90),
    });
  });

  it("TC-12: กันไว้ 100 บ. จ่ายจริง 50 บ. (เงินจริง 600 → 550 บ., กันไว้ 0 บ., 5 วัน) งบเพิ่มเป็น 110 บ./วัน", () => {
    // เดิม: เงินจริง 600 บ. กันไว้ 100 บ.
    // จ่ายจริง 50 บ. ประหยัดได้ 50 บ. -> เงินจริงเหลือ 550 บ. กันไว้ลดเป็น 0 บ.
    // ยอดยังไม่จัดสรรปรับเป็น 550 บ. -> งบเฉลี่ยหลังปรับ = 550 / 5 = 110 บ./วัน
    const input = createBudgetInput({
      balanceBaht: 550,
      reservedBaht: 0,
      daysLeft: 5,
    });
    const result = computeBudget(input);
    expect(result).toMatchObject({
      kind: "ok",
      usable: baht(550),
      dailyBudget: baht(110),
    });
  });
});

describe("7. [TC-15, TC-16] ปฏิเสธค่าติดลบ, คำนวณทศนิยมสตางค์แม่นยำ และคืนยอดเมื่อยกเลิกรายการ", () => {
  it("TC-15: ปฏิเสธค่าติดลบผ่าน Validator และแปลงทศนิยมสตางค์ (100.55 บ. เป็น 10,055 สตางค์) ได้แม่นยำ", () => {
    // 7.1 ปฏิเสธค่าติดลบ
    expect(() =>
      parseNewEntry({ amount: -500, category: "food" }, TODAY),
    ).toThrow(HttpError);
    expect(() =>
      parseBalanceCheck({ balance: -1 }, new Date()),
    ).toThrow(HttpError);

    // 7.2 คำนวณสตางค์แม่นยำ
    expect(baht(100.55)).toBe(10055);
  });

  it("TC-16: กันค่าเสื้อ 250 บ. (งบ 150 บ./วัน) เมื่อยกเลิก ยอด 250 บ. คืนเข้ายังไม่จัดสรร งบเพิ่มเป็น 200 บ./วัน", () => {
    // ก่อนยกเลิก: เงินจริง 1,000 บ., กันไว้ 250 บ., เหลือ 5 วัน -> ยังไม่จัดสรร 750 บ., งบ 150 บ./วัน
    const before = computeBudget(
      createBudgetInput({ balanceBaht: 1000, reservedBaht: 250, daysLeft: 5 }),
    );
    expect(before).toMatchObject({
      kind: "ok",
      usable: baht(750),
      dailyBudget: baht(150),
    });

    // หลังยกเลิก: ยอดกันไว้กลายเป็น 0 บ., เงินจริง 1,000 บ. -> ยังไม่จัดสรร 1,000 บ., งบ 200 บ./วัน
    const after = computeBudget(
      createBudgetInput({ balanceBaht: 1000, reservedBaht: 0, daysLeft: 5 }),
    );
    expect(after).toMatchObject({
      kind: "ok",
      usable: baht(1000),
      dailyBudget: baht(200),
    });
  });
});

describe("8. [TC-22, TC-23, TC-24, TC-25] ลองไม่สะสม, เกินเงินที่มี, เหลือ 1 วัน, เงินพอดี 0 บ.", () => {
  it("TC-22: ลอง 140 บ. → เปลี่ยนลอง 250 บ. ค่าไม่สะสม และกดไม่ซื้อเงินจริง/งบกลับมาเท่าเดิม", () => {
    const base = createBudgetInput({
      balanceBaht: 1000,
      reservedBaht: 300,
      daysLeft: 7,
    });

    // ลอง 140 บ.
    const try140 = simulatePurchase(base, baht(140));
    expect(try140).toMatchObject({
      kind: "ok",
      usable: baht(560),
      dailyBudget: baht(80),
    });

    // เปลี่ยนเป็นลอง 250 บ. (ต้องคำนวณจาก 700 - 250 = 450 บ. ไม่สะสมเป็น 700 - 140 - 250)
    const try250 = simulatePurchase(base, baht(250));
    expect(try250).toMatchObject({
      kind: "ok",
      usable: baht(450),
    });

    // กดไม่ซื้อ (กลับมาใช้ base) -> ยังไม่จัดสรร 700 บ. งบ 100 บ./วัน เงินจริง 1,000 บ.
    const reset = computeBudget(base);
    expect(base.balance).toBe(baht(1000));
    expect(reset).toMatchObject({
      kind: "ok",
      usable: baht(700),
      dailyBudget: baht(100),
    });
  });

  it("TC-22 [R3-quarter]: ลอง 250 บ. ได้งบ 64.25 บ./วัน (6,425 สตางค์)", () => {
    const base = createBudgetInput({
      balanceBaht: 1000,
      reservedBaht: 300,
      daysLeft: 7,
    });
    // 450 / 7 = 64.2857... ปัดลงขั้น 25 สตางค์ = 64.25 บ.
    const try250 = simulatePurchase(base, baht(250));
    expect(try250).toMatchObject({
      kind: "ok",
      usable: baht(450),
      dailyBudget: 6425, // 64.25 บาท
    });
  });

  it("TC-23: ลอง 800 บ. (เกินเงินที่มี 700 บ.) แสดงสถานะเงินขาด 100 บ. เงินจริงไม่เปลี่ยน", () => {
    const base = createBudgetInput({
      balanceBaht: 1000,
      reservedBaht: 300,
      daysLeft: 7,
    });
    const tried = simulatePurchase(base, baht(800));
    expect(base.balance).toBe(baht(1000)); // เงินจริงไม่ถูกหัก
    expect(tried).toMatchObject({
      kind: "shortfall",
      usable: -baht(100),
      shortfall: baht(100),
    });
  });

  it("TC-24: เหลือ 1 วัน (วันรับเงินคือพรุ่งนี้) ได้งบ 700 บ./วัน (700 ÷ 1 ไม่หาร 0)", () => {
    const input = createBudgetInput({
      balanceBaht: 1000,
      reservedBaht: 300,
      daysLeft: 1,
    });
    const result = computeBudget(input);
    expect(result).toMatchObject({
      kind: "ok",
      usable: baht(700),
      dailyBudget: baht(700),
      daysLeft: 1,
    });
  });

  it("TC-25: เงินพอดี 0 บ. (เงิน 600 บิล 600 เหลือ 5 วัน) สถานะพอดี งบ 0 บ./วัน และลอง 1 บ. กลายเป็นขาด 1 บ.", () => {
    const base = createBudgetInput({
      balanceBaht: 600,
      reservedBaht: 600,
      daysLeft: 5,
    });

    // ก่อนลอง: ยังไม่จัดสรร 0 บ., งบ 0 บ./วัน, สถานะ ok ("พอดี")
    const before = computeBudget(base);
    expect(before).toMatchObject({
      kind: "ok",
      usable: 0,
      dailyBudget: 0,
    });

    // ลองซื้อ 1 บ. (100 สตางค์) -> ขาดอีก 1 บ.
    const tried = simulatePurchase(base, baht(1));
    expect(tried).toMatchObject({
      kind: "shortfall",
      usable: -baht(1),
      shortfall: baht(1),
    });
  });
});
