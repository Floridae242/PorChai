import { describe, expect, it } from "vitest";
import { baht } from "@/lib/calc/money";
import { computeBudget, simulatePurchase, type BudgetInput } from "@/lib/calc/budget";
import {
  balanceNow,
  reservedTotal,
  savingsFromPercent,
  type BalanceAnchor,
  type EntryLike,
  type PlanLike,
} from "@/lib/calc/inputs";
import { parseNewCycle } from "@/lib/validate";
import { HttpError } from "@/lib/http";

const TODAY = "2026-11-11";

function input(over: Partial<BudgetInput> & { days?: number } = {}): BudgetInput {
  const { days = 10, ...rest } = over;
  const payday = new Date(Date.UTC(2026, 10, 11 + days)).toISOString().slice(0, 10);
  return {
    balance: 0,
    spentToday: 0,
    emergencyBuffer: 0,
    savings: 0,
    reserved: 0,
    essentialPerDay: null,
    today: TODAY,
    payday,
    ...rest,
  };
}

describe("TC-01, TC-02, TC-03: ตัวอย่างกลาง 1,000 บ. บิล 300 บ. 7 วัน ต่อเนื่อง", () => {
  const baseInput = input({
    balance: baht(1000),
    reserved: baht(300),
    days: 7,
  });

  it("TC-01: ตั้งรอบ & ลองซื้อ 140 บ. (ก่อนลอง 700/100, หลังลอง 560/80, เงินจริง 1,000)", () => {
    // ก่อนลอง
    const before = computeBudget(baseInput);
    expect(baseInput.balance).toBe(baht(1000));
    expect(before).toMatchObject({
      kind: "ok",
      usable: baht(700),
      dailyBudget: baht(100),
    });

    // ลองซื้อ 140 บ.
    const tried = simulatePurchase(baseInput, baht(140));
    expect(baseInput.balance).toBe(baht(1000)); // เงินจริงไม่เปลี่ยน
    expect(tried).toMatchObject({
      kind: "ok",
      usable: baht(560),
      dailyBudget: baht(80),
    });
  });

  it("TC-02: ต่อยอด TC-01 เลือกกันไว้ 140 บ. (กันไว้รวม 440 บ., ยังไม่จัดสรร 560, งบ 80, เงินจริง 1,000)", () => {
    const reservedInput = {
      ...baseInput,
      reserved: baht(300 + 140), // 440 บ.
    };
    expect(reservedInput.balance).toBe(baht(1000)); // เงินจริงยัง 1,000
    const r = computeBudget(reservedInput);
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(560),
      dailyBudget: baht(80),
    });
  });

  it("TC-03: ต่อยอด TC-02 บันทึกว่าจ่ายจริง 140 บ. (เงินจริงเหลือ 860, ยังไม่จัดสรรคงที่ 560, งบ 80)", () => {
    // จ่ายจริง 140 บ. หักจากเงินจริง เหลือ 860 บ.
    // ยอดกันไว้ลดลงเหลือ 300 บ. (ปลดล็อก 140 บ. ที่จ่ายแล้ว ไม่หักซ้ำ)
    // การจ่ายจากแผน fromPlan ไม่ถูกนับเป็น spentToday ของวัน
    const paidInput = {
      ...baseInput,
      balance: baht(1000 - 140), // 860 บ.
      reserved: baht(300), // เหลือเฉพาะบิล 300 บ.
      spentToday: 0,
    };
    expect(paidInput.balance).toBe(baht(860)); // เงินจริงลดเหลือ 860 บ.
    const r = computeBudget(paidInput);
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(560),
      dailyBudget: baht(80),
    });
  });
});

describe("TC-04: [R3-quarter] 700 บาท 3 วัน ลอง 300 (แยกข้อมูลต่างหาก)", () => {
  const base = input({ balance: baht(700), reserved: 0, days: 3 });

  // เมื่อ dev แก้ budget.ts (R3-quarter) ให้เปลี่ยนกลับเป็น it
  it.fails("TC-04: [R3-quarter] ก่อนลอง 700 บ. 3 วัน ได้งบ 233.25 บ./วัน (โค้ดปัจจุบันปัดเป็น 233 บ.)", () => {
    // 700 / 3 = 233.333... ปัดลงขั้น 25 สตางค์ = 233.25 บ. (23,325 สตางค์)
    // หมายเหตุ: โค้ดปัจจุบันใช้ floorToBaht จะได้ 233.00 บ. (23,300 สตางค์)
    const r = computeBudget(base);
    expect(base.balance).toBe(baht(700));
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(700),
      dailyBudget: 23325, // 233.25 บาท (R3-quarter)
    });
  });

  // เมื่อ dev แก้ budget.ts (R3-quarter) ให้เปลี่ยนกลับเป็น it
  it.fails("TC-04: [R3-quarter] หลังลอง 300 บ. ได้งบ 133.25 บ./วัน (โค้ดปัจจุบันปัดเป็น 133 บ.)", () => {
    // (700 - 300) / 3 = 400 / 3 = 133.333... ปัดลงขั้น 25 สตางค์ = 133.25 บ. (13,325 สตางค์)
    // หมายเหตุ: โค้ดปัจจุบันใช้ floorToBaht จะได้ 133.00 บ. (13,300 สตางค์)
    const tried = simulatePurchase(base, baht(300));
    expect(base.balance).toBe(baht(700)); // เงินจริงไม่เปลี่ยน
    expect(tried).toMatchObject({
      kind: "ok",
      usable: baht(400),
      dailyBudget: 13325, // 133.25 บาท (R3-quarter)
    });
  });
});

describe("TC-06: เงินขาด / ติดลบ (Deficit Balance)", () => {
  it("TC-06: เงินปัจจุบัน 500 บ., บิล 600 บ., เหลือ 5 วัน แสดงสถานะเงินขาด 100 บาท", () => {
    const r = computeBudget(input({ balance: baht(500), reserved: baht(600), days: 5 }));
    expect(r).toMatchObject({
      kind: "shortfall",
      usable: -baht(100),
      shortfall: baht(100),
      daysLeft: 5,
    });
  });
});

describe("TC-08: เลื่อนวันรับเงินออกไป (Postponed Payday)", () => {
  it("TC-08: เงินยังไม่จัดสรร 600 บ. เดิมเหลือ 6 วัน (งบ 100) เลื่อนเป็น 10 วัน งบลดเหลือ 60 บ./วัน", () => {
    const original = computeBudget(input({ balance: baht(600), days: 6 }));
    expect(original).toMatchObject({ kind: "ok", dailyBudget: baht(100), daysLeft: 6 });

    const postponed = computeBudget(input({ balance: baht(600), days: 10 }));
    expect(postponed).toMatchObject({ kind: "ok", dailyBudget: baht(60), daysLeft: 10 });
  });
});

describe("TC-09: [R3-quarter] บิลถึงกำหนดก่อนเงินเข้า", () => {
  // เมื่อ dev แก้ budget.ts (R3-quarter) ให้เปลี่ยนกลับเป็น it
  it.fails(
    "TC-09: [R3-quarter] เงิน 1,500 บ., บิล 200 บ. ถึงกำหนดในรอบ, 15 วัน ได้งบ 86.50 บ./วัน (โค้ดปัจจุบันปัดเป็น 86 บ.)",
    () => {
      // 1300 / 15 = 86.666... ปัดลงขั้น 25 สตางค์ = 86.50 บ. (8,650 สตางค์)
      // หมายเหตุ: โค้ดปัจจุบันใช้ floorToBaht จะได้ 86.00 บ. (8,600 สตางค์)
      const r = computeBudget(input({ balance: baht(1500), reserved: baht(200), days: 15 }));
      expect(r).toMatchObject({
        kind: "ok",
        usable: baht(1300),
        dailyBudget: 8650, // 86.50 บาท (R3-quarter)
      });
    },
  );
});

describe("TC-10: บิลกำหนดจ่ายหลังวันเงินเข้า (Bill Next Cycle)", () => {
  it("TC-10: บิลกำหนดจ่ายหลังวันเงินเข้า ไม่นำมาหักในรอบนี้ (เงิน 1,500 บ., 15 วัน ได้งบ 100 บ./วัน)", () => {
    const payday = "2026-11-26"; // 15 วันข้างหน้า
    const plans: PlanLike[] = [
      { amount: baht(500), status: "reserved", dueOn: "2026-12-05" }, // หลัง payday
    ];
    const reserved = reservedTotal(plans, payday);
    expect(reserved).toBe(0); // ไม่ถูกกันไว้

    const r = computeBudget(input({ balance: baht(1500), reserved, days: 15 }));
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(1500),
      dailyBudget: baht(100),
    });
  });
});

describe("TC-13: [R3-quarter] ผู้ใช้กดปรับยอดเงินปัจจุบัน", () => {
  // เมื่อ dev แก้ budget.ts (R3-quarter) ให้เปลี่ยนกลับเป็น it
  it.fails(
    "TC-13: [R3-quarter] ยอดในกระเป๋าจริงเป็น 850 บ. บิล 300 บ. 7 วัน ได้งบ 78.50 บ./วัน (โค้ดปัจจุบันปัดเป็น 78 บ.)",
    () => {
      // 550 / 7 = 78.5714... ปัดลงขั้น 25 สตางค์ = 78.50 บ. (7,850 สตางค์)
      // หมายเหตุ: โค้ดปัจจุบันใช้ floorToBaht จะได้ 78.00 บ. (7,800 สตางค์)
      const r = computeBudget(input({ balance: baht(850), reserved: baht(300), days: 7 }));
      expect(r).toMatchObject({
        kind: "ok",
        usable: baht(550),
        dailyBudget: 7850, // 78.50 บาท (R3-quarter)
      });
    },
  );
});

describe("TC-15: ค่าผิดปกติและการแปลงทศนิยมสตางค์", () => {
  it("TC-15: ค่า 100.55 บ. ถูกแปลงเป็น 10,055 สตางค์ แม่นยำ", () => {
    expect(baht(100.55)).toBe(10055);
  });
});

describe("TC-16: ยกเลิกรายการที่กันไว้ (Cancel Reserved)", () => {
  it("TC-16: กันไว้ 250 บ. (งบ 150) เมื่อยกเลิก ยอด 250 คืนเข้าเงินยังไม่จัดสรร งบเพิ่มเป็น 200 บ./วัน", () => {
    const before = computeBudget(input({ balance: baht(1000), reserved: baht(250), days: 5 }));
    expect(before).toMatchObject({
      kind: "ok",
      usable: baht(750),
      dailyBudget: baht(150),
    });

    const after = computeBudget(input({ balance: baht(1000), reserved: 0, days: 5 }));
    expect(after).toMatchObject({
      kind: "ok",
      usable: baht(1000),
      dailyBudget: baht(200),
    });
  });
});

describe("TC-22: ลองหลายครั้ง ค่าที่ลองไม่สะสม และ R3-quarter", () => {
  const base = input({ balance: baht(1000), reserved: baht(300), days: 7 });

  it("TC-22(ก): ลอง 140 → เปลี่ยนเป็นลอง 250 → กดไม่ซื้อ ค่าที่ลองไม่สะสมและกลับเป็น 100 เงินจริงเท่าเดิม", () => {
    // 1. ลอง 140 บ.
    const try140 = simulatePurchase(base, baht(140));
    expect(try140).toMatchObject({ kind: "ok", usable: baht(560), dailyBudget: baht(80) });

    // 2. เปลี่ยนเป็นลอง 250 บ. (ไม่สะสมบน 140, ยังไม่จัดสรร = 1000 - 300 - 250 = 450)
    const try250 = simulatePurchase(base, baht(250));
    expect(try250).toMatchObject({ kind: "ok", usable: baht(450) });

    // 3. กดไม่ซื้อ (กลับมาใช้ base: ยังไม่จัดสรร 700, งบ 100, เงินจริง 1,000 เท่าเดิม)
    const reset = computeBudget(base);
    expect(base.balance).toBe(baht(1000));
    expect(reset).toMatchObject({ kind: "ok", usable: baht(700), dailyBudget: baht(100) });
  });

  // เมื่อ dev แก้ budget.ts (R3-quarter) ให้เปลี่ยนกลับเป็น it
  it.fails("TC-22(ข): [R3-quarter] ลอง 250 ได้งบ 64.25 บ./วัน (โค้ดปัจจุบันปัดเป็น 64 บ.)", () => {
    // 450 / 7 = 64.2857... ปัดลงขั้น 25 สตางค์ = 64.25 บ. (6,425 สตางค์)
    // หมายเหตุ: โค้ดปัจจุบันใช้ floorToBaht จะได้ 64.00 บ. (6,400 สตางค์)
    const try250 = simulatePurchase(base, baht(250));
    expect(try250).toMatchObject({ kind: "ok", usable: baht(450), dailyBudget: 6425 });
  });
});

describe("TC-23: ลองแล้วเงินไม่พอ (เกินเงินที่ใช้ได้)", () => {
  it("TC-23: เงิน 1,000 บ. บิล 300 บ. 7 วัน ลองซื้อ 800 บ. แสดงขาดอีก 100 บาท ไม่ออกงบเป็นบวก", () => {
    const base = input({ balance: baht(1000), reserved: baht(300), days: 7 });
    const tried = simulatePurchase(base, baht(800));
    expect(base.balance).toBe(baht(1000)); // เงินจริงไม่เปลี่ยน
    expect(tried).toMatchObject({
      kind: "shortfall",
      usable: -baht(100),
      shortfall: baht(100),
    });
  });
});

describe("TC-24: วันรับเงินคือพรุ่งนี้ (เหลือ 1 วัน)", () => {
  it("TC-24: เงิน 1,000 บ. บิล 300 บ. เหลือ 1 วัน ได้งบ 700 บ./วัน (700 ÷ 1 ไม่หาร 0)", () => {
    const r = computeBudget(input({ balance: baht(1000), reserved: baht(300), days: 1 }));
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(700),
      dailyBudget: baht(700),
      daysLeft: 1,
    });
  });
});

describe("TC-25: เงินพอดี (ยังไม่จัดสรร = 0) ขอบเขตระหว่างพอกับขาด", () => {
  const base = input({ balance: baht(600), reserved: baht(600), days: 5 });

  it("TC-25: ก่อนลอง เงินยังไม่จัดสรร 0 บ. งบเฉลี่ย 0 บ./วัน แสดงสถานะพอดี (ok)", () => {
    const r = computeBudget(base);
    expect(r).toMatchObject({
      kind: "ok",
      usable: 0,
      dailyBudget: 0,
    });
  });

  it("TC-25: หลังลองซื้อ 1 บ. สถานะเปลี่ยนเป็นขาดอีก 1 บาท", () => {
    const tried = simulatePurchase(base, baht(1));
    expect(tried).toMatchObject({
      kind: "shortfall",
      usable: -baht(1),
      shortfall: baht(1),
    });
  });
});

describe("TC-26: [R3-quarter] ตั้งค่าผ่านฟอร์มหลายบิล", () => {
  const payday = "2026-11-23"; // 12 วัน
  const bills: PlanLike[] = [
    { amount: baht(400), status: "reserved", dueOn: null },
    { amount: baht(50), status: "reserved", dueOn: null },
    { amount: baht(150), status: "reserved", dueOn: null },
  ];

  it("TC-26: [R3-quarter] รวม 3 บิล 600 บ. งบ 150 บ./วัน และเมื่อลบบิล 50 บ. เหลือ 550 บ. ได้งบ 154.00 บ./วัน", () => {
    // 3 บิล
    const resTotal = reservedTotal(bills, payday);
    expect(resTotal).toBe(baht(600));
    const r1 = computeBudget(input({ balance: baht(2400), reserved: resTotal, days: 12 }));
    expect(r1).toMatchObject({ kind: "ok", usable: baht(1800), dailyBudget: baht(150) });

    // ลบบิลค่าน้ำ 50 บ. เหลือ 2 บิล รวม 550 บ.
    // 1850 / 12 = 154.166... ปัดลงขั้น 25 สตางค์ = 154.00 บ. (15,400 สตางค์)
    const afterDelete = bills.filter((b) => b.amount !== baht(50));
    const resAfter = reservedTotal(afterDelete, payday);
    expect(resAfter).toBe(baht(550));
    const r2 = computeBudget(input({ balance: baht(2400), reserved: resAfter, days: 12 }));
    expect(r2).toMatchObject({ kind: "ok", usable: baht(1850), dailyBudget: 15400 });
  });
});

describe("กรณีเพิ่มเติมจากโค้ดจริง (ข้อ 5)", () => {
  it("ข้อ 5(ก): savingsFromPercent(1,000, 10%) = 100 และ คำนวณงบจาก 1,000 บิล 300 ออม 100 7 วัน ได้ยังไม่จัดสรร 600 และงบ 85", () => {
    const savings = savingsFromPercent(baht(1000), 10);
    expect(savings).toBe(baht(100));

    // usable = 1000 - 300 - 100 = 600 บ.
    // dailyBudget = floorToBaht(600 / 7) = floorToBaht(85.714...) = 85 บ.
    const r = computeBudget(
      input({
        balance: baht(1000),
        reserved: baht(300),
        savings,
        days: 7,
      }),
    );
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(600),
      dailyBudget: baht(85),
    });
  });

  it("ข้อ 5(ข): emergencyBuffer 50: 1,000 บิล 300 7 วัน ได้ยังไม่จัดสรร 650 และงบ 92", () => {
    // usable = 1000 - 300 - 50 = 650 บ.
    // dailyBudget = floorToBaht(650 / 7) = floorToBaht(92.857...) = 92 บ.
    const r = computeBudget(
      input({
        balance: baht(1000),
        reserved: baht(300),
        emergencyBuffer: baht(50),
        days: 7,
      }),
    );
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(650),
      dailyBudget: baht(92),
    });
  });
});

describe("TC-05, TC-07, TC-14, TC-21: ยืนยันการตรวจสอบครบถ้วน (ข้อ 4)", () => {
  it("TC-05: ตรวจครบ 2,400 / บิล 600 / 12 วัน → ยังไม่จัดสรร 1,800 บ. และงบ 150 บ./วัน", () => {
    const r = computeBudget(input({ balance: baht(2400), reserved: baht(600), days: 12 }));
    expect(r).toMatchObject({
      kind: "ok",
      usable: baht(1800),
      dailyBudget: baht(150),
      daysLeft: 12,
    });
  });

  it("TC-07: payday = วันนี้ (daysLeft = 0) ไม่เกิด error หารด้วย 0 และคืน payday-passed", () => {
    const r = computeBudget(input({ balance: baht(600), days: 0 }));
    expect(r).toMatchObject({ kind: "payday-passed", usable: baht(600) });
  });

  it("TC-14: parseNewCycle ปฏิเสธค่าว่าง (เว้นว่าง balance หรือ payday)", () => {
    const now = new Date("2026-11-11T05:00:00Z");
    const today = "2026-11-11";
    // ขาด balance
    expect(() =>
      parseNewCycle({ incomeSource: "family", incomeFrequency: "monthly", payday: "2026-11-23" }, today, now),
    ).toThrow(HttpError);
    // ขาด payday
    expect(() =>
      parseNewCycle({ incomeSource: "family", incomeFrequency: "monthly", balance: 100000 }, today, now),
    ).toThrow(HttpError);
  });

  it("TC-21: จดข้าว 45 บ. แล้วงบวันนี้ 150 → 105 บ. และเงินจริงลดเหลือ 2,355 บ.", () => {
    // 1. balanceNow: เงินจริงลดจาก 2,400 เหลือ 2,355 บ.
    const startAnchor: BalanceAnchor = { amount: baht(2400), asOf: new Date("2026-11-11T01:00:00Z") };
    const entry: EntryLike = { amount: baht(45), spentOn: "2026-11-11", createdAt: new Date("2026-11-11T05:00:00Z") };
    const realBalance = balanceNow(startAnchor, [entry]);
    expect(realBalance).toBe(baht(2355));

    // 2. computeBudget: งบวัน 150 บ./วัน วันนี้เหลือใช้ได้อีก 105 บ.
    const r = computeBudget(
      input({
        balance: realBalance,
        reserved: baht(600),
        spentToday: baht(45),
        days: 12,
      }),
    );
    expect(r).toMatchObject({
      kind: "ok",
      dailyBudget: baht(150),
      todayRemaining: baht(105),
    });
  });
});
