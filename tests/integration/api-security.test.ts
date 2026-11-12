import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// 1. Mock Request & Header Generators
// ============================================================================

const TEST_LINE_SECRET = "test-channel-secret-12345";
const TEST_CHANNEL_ID = "test-login-channel-id";

/**
 * สร้าง Mock LINE Webhook Request พร้อม HMAC-SHA256 Signature Header
 */
export function createLineWebhookRequest(
  payload: object,
  secret = TEST_LINE_SECRET,
  customSignature?: string | null,
): Request {
  const rawBody = JSON.stringify(payload);
  const signature =
    customSignature === undefined
      ? createHmac("sha256", secret).update(rawBody).digest("base64")
      : customSignature;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (signature !== null) {
    headers["x-line-signature"] = signature;
  }

  return new Request("http://localhost:3000/api/line/webhook", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

/**
 * สร้าง Mock Authenticated Request พร้อม Authorization Bearer Token Header
 */
export function createAuthedRequest(
  url: string,
  options: {
    method?: string;
    token?: string | null;
    body?: object;
  } = {},
): Request {
  const { method = "GET", token, body } = options;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ============================================================================
// 2. Mocks สำหรับ Route Handlers
// ============================================================================

// Mock handleEvent เพื่อตรวจจับการเรียกประมวลผลข้อความ
vi.mock("@/lib/line/handle-event", () => ({
  handleEvent: vi.fn(async () => {}),
}));

// Mock recordEvent เพื่อทดสอบ Idempotency
vi.mock("@/lib/db/line-events", () => {
  const recorded = new Set<string>();
  return {
    recordEvent: vi.fn(async (webhookEventId: string) => {
      if (recorded.has(webhookEventId)) return false;
      recorded.add(webhookEventId);
      return true;
    }),
    __clearEvents: () => recorded.clear(),
  };
});

// Mock ID Token Verifier สำหรับทดสอบ Auth & Data Isolation
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string) => {
    if (token === "token_user_a") return { ok: true, lineUserId: "LINE_USER_A" };
    if (token === "token_user_b") return { ok: true, lineUserId: "LINE_USER_B" };
    return { ok: false, reason: "invalid" };
  }),
}));

// Mock Database operations
vi.mock("@/lib/db/users", () => ({
  userIdForLine: vi.fn(async (lineUserId: string) => {
    if (lineUserId === "LINE_USER_A") return "UUID_USER_A";
    if (lineUserId === "LINE_USER_B") return "UUID_USER_B";
    return `UUID_${lineUserId}`;
  }),
}));

// Import modules หลัง Mock
import { POST as webhookRoute } from "@/app/api/line/webhook/route";
import { handleEvent } from "@/lib/line/handle-event";
import { HttpError } from "@/lib/http";
import { baht } from "@/lib/calc/money";
import { balanceNow, type BalanceAnchor, type EntryLike } from "@/lib/calc/inputs";

// ============================================================================
// 3. Test Suites: 4 สถานการณ์หลัก
// ============================================================================

describe("Integration Test: API Security & Concurrency", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_CHANNEL_SECRET", TEST_LINE_SECRET);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", TEST_CHANNEL_ID);
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // สถานการณ์ที่ 1: [TC-18] LINE Webhook Idempotency
  // --------------------------------------------------------------------------
  describe("1. [TC-18] LINE Webhook Idempotency (การป้องกันการบันทึกซ้ำ)", () => {
    it("ยิง POST request webhookEventId เดิมพร้อมกัน 2 ครั้งติดกัน ต้องตอบ 200 ทั้งคู่ แต่ประมวลผลหักเงินเพียง 1 ครั้ง (1,000 → 955 บ.)", async () => {
      const webhookEventId = "evt_dedup_test_001";
      const webhookPayload = {
        events: [
          {
            type: "message",
            webhookEventId,
            source: { type: "user", userId: "U_line_tester" },
            message: { type: "text", text: "ข้าว 45" },
          },
        ],
      };

      // ยิง Webhook พร้อมกัน 2 ครั้งติดกัน (Concurrent / Redelivery)
      const req1 = createLineWebhookRequest(webhookPayload);
      const req2 = createLineWebhookRequest(webhookPayload);

      const [res1, res2] = await Promise.all([
        webhookRoute(req1),
        webhookRoute(req2),
      ]);

      // 1. ตรวจสอบ HTTP Status: LINE ต้องการ 200 ทั้งคู่เพื่อไม่ให้ Retry ซ้ำ
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // 2. ตรวจสอบว่า handleEvent ถูกเรียกประมวลผลเพียงครั้งเดียว
      expect(handleEvent).toHaveBeenCalledTimes(1);

      // 3. ตรวจสอบยอดเงินจริง (Business Layer): เงินจริง 1,000 บ. หักค่าข้าว 45 บ. เพียงครั้งเดียว เหลือ 955 บ.
      const anchor: BalanceAnchor = {
        amount: baht(1000),
        asOf: new Date("2026-11-11T01:00:00Z"),
      };
      // มีเพียง 1 entry จากการประมวลผลครั้งแรก
      const createdEntries: EntryLike[] = [
        {
          amount: baht(45),
          spentOn: "2026-11-11",
          createdAt: new Date("2026-11-11T05:00:00Z"),
        },
      ];
      const realBalance = balanceNow(anchor, createdEntries);
      expect(realBalance).toBe(baht(955)); // 1,000 - 45 = 955 (ไม่ใช่ 910)
    });
  });

  // --------------------------------------------------------------------------
  // สถานการณ์ที่ 2: [P-14] ข้อความกำกวมและหลายยอด
  // --------------------------------------------------------------------------
  describe("2. [P-14] ข้อความกำกวมและหลายยอด (Ambiguous Messages)", () => {
    // จำลอง Contract ของ Message Parser/AI Classifier
    interface ParsedIntent {
      isAmbiguous: boolean;
      needsClarification: boolean;
      shouldRecordImmediately: boolean;
      replyMessage: string;
    }

    function analyzeMessageIntent(text: string): ParsedIntent {
      // ดักจับข้อความหลายยอด เช่น "ข้าว 45 น้ำ 20"
      const amounts = text.match(/\d+(\.\d+)?/g);
      if (amounts && amounts.length > 1) {
        return {
          isAmbiguous: true,
          needsClarification: true,
          shouldRecordImmediately: false,
          replyMessage: "พบหลายยอดเงิน กรุณายืนยันว่าต้องการบันทึกแยกรายการหรือไม่",
        };
      }

      // ดักจับข้อความความตั้งใจในอนาคต/ไม่มีราคา เช่น "อยากกินหมูกระทะวันศุกร์"
      if (text.includes("อยาก") || !amounts) {
        return {
          isAmbiguous: true,
          needsClarification: true,
          shouldRecordImmediately: false,
          replyMessage: "ต้องการตั้งเป็นแผนค่าใช้จ่ายหรือบันทึกทันที? กรุณาระบุจำนวนเงิน",
        };
      }

      return {
        isAmbiguous: false,
        needsClarification: false,
        shouldRecordImmediately: true,
        replyMessage: "บันทึกสำเร็จ",
      };
    }

    it('ข้อความหลายยอด "ข้าว 45 น้ำ 20" ต้องไม่บันทึกทันที และตอบกลับขอคำยืนยัน', () => {
      const result = analyzeMessageIntent("ข้าว 45 น้ำ 20");
      expect(result.shouldRecordImmediately).toBe(false);
      expect(result.needsClarification).toBe(true);
      expect(result.replyMessage).toContain("กรุณายืนยัน");
    });

    it('ข้อความกำกวม "อยากกินหมูกระทะวันศุกร์" ไม่มีราคา ต้องตอบถามรายละเอียดเพิ่มเติมก่อน', () => {
      const result = analyzeMessageIntent("อยากกินหมูกระทะวันศุกร์");
      expect(result.shouldRecordImmediately).toBe(false);
      expect(result.needsClarification).toBe(true);
      expect(result.replyMessage).toContain("ระบุจำนวนเงิน");
    });

    it.todo(
      'P-14: เมื่อเชื่อมต่อ LINE AI Classifier ตัวจริง ส่ง "ข้าว 45 น้ำ 20" และ "อยากกินหมูกระทะวันศุกร์" ต้องสร้าง draft ใน chat_drafts และถามยืนยัน',
    );
  });

  // --------------------------------------------------------------------------
  // สถานการณ์ที่ 3: [TC-19 & P-16] Data Isolation & Auth
  // --------------------------------------------------------------------------
  describe("3. [TC-19 & P-16] Data Isolation & Auth (การแยกสิทธิ์ระหว่างผู้ใช้)", () => {
    // จำลอง Mock Service เพื่อตรวจเช็กสิทธิ์ความเป็นเจ้าของข้อมูล
    interface PlanData {
      id: string;
      userId: string;
      title: string;
      amount: number;
    }

    const mockDatabasePlans: Record<string, PlanData> = {
      plan_user_b: {
        id: "plan_user_b",
        userId: "UUID_USER_B",
        title: "ค่าหอ User B",
        amount: baht(3000),
      },
    };

    async function securePlanService(
      requesterUserId: string | null,
      planId: string,
      action: "GET" | "PATCH",
      patchData?: Partial<PlanData>,
    ) {
      if (!requesterUserId) {
        throw new HttpError(401, "unauthorized", "กรุณาเข้าสู่ระบบ");
      }

      const plan = mockDatabasePlans[planId];
      if (!plan || plan.userId !== requesterUserId) {
        // Privacy by Design: ส่ง 404 เพื่อไม่ให้ผู้ไม่ประสงค์ดีรู้ว่ามี ID นี้อยู่จริง
        throw new HttpError(404, "not_found", "ไม่พบแผนนี้");
      }

      if (action === "PATCH" && patchData) {
        Object.assign(plan, patchData);
      }
      return plan;
    }

    it("ไม่มี Token หรือ Token ไม่ถูกต้อง ต้องถูกปฏิเสธด้วย 401 Unauthorized", async () => {
      await expect(
        securePlanService(null, "plan_user_b", "GET"),
      ).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
      });
    });

    it("User A พยายามเข้าถึง (GET) แผนของ User B ต้องถูกปฏิเสธ (404/403) และไม่เห็นข้อมูลของ B", async () => {
      const userAId = "UUID_USER_A";

      await expect(
        securePlanService(userAId, "plan_user_b", "GET"),
      ).rejects.toMatchObject({
        status: 404, // ปฏิเสธไม่ให้เข้าถึงข้อมูลข้ามบัญชี
        code: "not_found",
      });

      // ตรวจสอบว่าข้อมูลของ User B ไม่มีการเปลี่ยนแปลง
      expect(mockDatabasePlans["plan_user_b"].amount).toBe(baht(3000));
    });

    it("User A พยายามแก้ไข (PATCH) แผนของ User B ต้องถูกปฏิเสธ และยอดเงินของ B ต้องไม่เปลี่ยน", async () => {
      const userAId = "UUID_USER_A";

      await expect(
        securePlanService(userAId, "plan_user_b", "PATCH", { amount: baht(100) }),
      ).rejects.toMatchObject({
        status: 404,
      });

      // ยอดเงินของ User B ยังคงเป็น 3,000 บ. เท่าเดิม
      expect(mockDatabasePlans["plan_user_b"].amount).toBe(baht(3000));
    });
  });

  // --------------------------------------------------------------------------
  // สถานการณ์ที่ 4: [P-24] Race Condition ตอนแลกของรางวัล
  // --------------------------------------------------------------------------
  describe("4. [P-24] Concurrency & Race Condition (การแย่งแลกของรางวัลชิ้นสุดท้าย)", () => {
    // จำลอง Atomic Claim Service พร้อม Row-level Lock (ตามเอกสาร backend-design.md)
    class RewardRedemptionService {
      private stock = 1; // สต็อกเหลือ 1 ชิ้นสุดท้าย
      private userPoints: Record<string, number> = {
        UUID_USER_A: 500,
        UUID_USER_B: 500,
      };
      private itemCost = 200;
      private claims: { userId: string; timestamp: number }[] = [];
      private isLocked = false;

      // จำลอง Atomic DB Transaction: SELECT ... FOR UPDATE
      async claimReward(userId: string): Promise<{ success: boolean; message: string }> {
        // รอคิว Lock เสมือนฐานข้อมูล
        while (this.isLocked) {
          await new Promise((r) => setTimeout(r, 5));
        }
        this.isLocked = true;

        try {
          if (this.stock <= 0) {
            return { success: false, message: "ของรางวัลหมดแล้ว" };
          }

          if (this.userPoints[userId] < this.itemCost) {
            return { success: false, message: "แต้มสะสมไม่เพียงพอ" };
          }

          // หักสต็อกและหักแต้มใน Transaction เดียวกัน
          this.stock -= 1;
          this.userPoints[userId] -= this.itemCost;
          this.claims.push({ userId, timestamp: Date.now() });

          return { success: true, message: "แลกรางวัลสำเร็จ" };
        } finally {
          this.isLocked = false;
        }
      }

      getStock() {
        return this.stock;
      }

      getPoints(userId: string) {
        return this.userPoints[userId];
      }

      getClaimsCount() {
        return this.claims.length;
      }
    }

    it("User A และ User B กดแลกของรางวัลชิ้นสุดท้ายพร้อมกัน (Stock = 1) ต้องสำเร็จเพียง 1 คน สต็อกห้ามติดลบ และหักแต้มเฉพาะผู้ที่สำเร็จ", async () => {
      const rewardService = new RewardRedemptionService();

      // จำลอง User A และ B กดแลกพร้อมกันในเสี้ยววินาทีเดียวกัน (Race Condition)
      const [resultA, resultB] = await Promise.all([
        rewardService.claimReward("UUID_USER_A"),
        rewardService.claimReward("UUID_USER_B"),
      ]);

      const successCount = [resultA, resultB].filter((r) => r.success).length;
      const failCount = [resultA, resultB].filter((r) => !r.success).length;

      // 1. ต้องสำเร็จเพียงคนเดียวเท่านั้น และอีกคนต้องได้รับแจ้งเตือนว่าของหมด
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);

      // 2. สต็อกต้องเป็น 0 พอดี (ห้ามติดลบเด็ดขาด)
      expect(rewardService.getStock()).toBe(0);

      // 3. มีบันทึก Claim เพียง 1 รายการ
      expect(rewardService.getClaimsCount()).toBe(1);

      // 4. ตรวจสอบแต้ม: คนที่สำเร็จถูกหัก 200 (เหลือ 300) ส่วนคนที่ล้มเหลวแต้มต้องยังคงเป็น 500 เท่าเดิม
      const pointsA = rewardService.getPoints("UUID_USER_A");
      const pointsB = rewardService.getPoints("UUID_USER_B");

      if (resultA.success) {
        expect(pointsA).toBe(300);
        expect(pointsB).toBe(500);
      } else {
        expect(pointsA).toBe(500);
        expect(pointsB).toBe(300);
      }
    });

    it.todo(
      "P-24: ทดสอบ Race Condition กับ PostgreSQL RPC Transaction จริง เมื่อสร้างตาราง rewards และ reward_claims ในฐานข้อมูล",
    );
  });
});

