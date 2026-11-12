# Backend ชั้น 0 (ฐานระบบ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ตัวคำนวณเงินที่ผ่านกรณีอ้างอิงทั้งหมด, ตารางฐานข้อมูลชั้น 0–1, การตรวจ ID token และ webhook ที่ตรวจลายเซ็นและกัน event ซ้ำ — พร้อมให้ชั้น 1 (จดรายการ) ต่อยอดได้ทันที

**Architecture:** ตัวคำนวณเป็นฟังก์ชันล้วนใน `lib/calc/` ไม่แตะฐานข้อมูล · ฐานข้อมูลเป็น Supabase Postgres ที่เปิด RLS ทุกตารางไม่มี policy ให้ anon เข้าได้ server ใช้ service role key · ทุก route ได้ `userId` จาก `requireUser()` เท่านั้น

**Tech Stack:** Next.js 16.4.6 (App Router route handlers), TypeScript, Vitest 5.1.0, `@supabase/supabase-js` 2.119.0, Supabase CLI 2.121.0 ที่ติดตั้งอยู่ (ฐานข้อมูลบนเครื่องผ่าน Docker)

**Spec:** `docs/backend-design.md` (อนุมัติ 11 พ.ย. 2569) — ข้อ 5 สูตร, ข้อ 6 ตาราง, ข้อ 7 ตัวตน

## Global Constraints

- ทำงานบน branch `Backend` · commit ด้วย `pordiewtrakul@gmail.com` · **ถามพอก่อน commit และ push ทุกครั้ง** · ไม่มี Co-Authored-By
- repo เป็น public: ห้าม commit `.env.local`, key, หรือค่า `supabase status` ใดๆ
- เงินทุกตัวเป็น **สตางค์ จำนวนเต็ม** (`type Satang = number`) ไม่มีทศนิยมในตรรกะ
- "วันนี้" และวันที่ทั้งหมดคิดตาม `Asia/Bangkok` (`TIME_ZONE` ใน `lib/calc/time.ts`) ในรูป string `YYYY-MM-DD`
- งบต่อวัน **ปัดลงเป็นบาทเต็ม** (หลายของ 100 สตางค์)
- ข้อความ error ถึงผู้ใช้เป็นภาษาไทย รูปแบบ `{ "error": { "code": string, "message": string } }`
- คอมเมนต์ในโค้ดภาษาอังกฤษ สั้น ตามไฟล์ที่มีอยู่
- `npm test` ต้องไม่ต้องพึ่งฐานข้อมูล · เทสต์ที่ต้องใช้ฐานข้อมูลชื่อ `*.db.test.ts` และรันด้วย `npm run test:db`

## Review Focus

1. **เที่ยงคืนไทยตอนที่ server เป็น UTC** — 00:30 น. ไทย คือ 17:30 UTC ของเมื่อวาน ต้องได้ "วันนี้" เป็นวันไทย → Task 1
2. **วันรับเงินคือวันนี้หรือผ่านไปแล้ว** — ไม่หารศูนย์/ติดลบ ต้องได้สถานะ `payday-passed` → Task 2
3. **หารไม่ลงตัว** — 1,000 บาท 3 วัน ต้องได้ 333 ไม่ใช่ 333.33 หรือ 334 → Task 2
4. **LINE ส่ง event เดิมซ้ำ (redelivery) พร้อมลายเซ็นถูกต้อง** — ต้องนับเป็นใหม่ครั้งเดียว → Task 5
5. **เรียก LINE verify ไม่ได้ (เน็ตล่ม/timeout)** — ต้องตอบ 503 ไม่ใช่ 500 และไม่ปล่อยผ่านเป็นผู้ใช้ → Task 4

---

### Task 1: วันที่ตามเวลาไทย

**Files:**
- Modify: `lib/calc/time.ts`
- Create: `lib/calc/time.test.ts`
- Delete: `lib/calc/smoke.test.ts` (มีเทสต์จริงแทนแล้ว)

**Interfaces:**
- Produces:
  - `thaiDate(now: Date): string` — วันที่ไทย `YYYY-MM-DD`
  - `daysBetween(from: string, to: string): number` — จำนวนวันจาก `from` ถึง `to` (to − from) อาจติดลบ

- [ ] **Step 1: Write the failing tests** ใน `lib/calc/time.test.ts`
  - `thaiDate(new Date("2026-11-11T17:30:00Z"))` → `"2026-11-12"` (00:30 ไทย)
  - `thaiDate(new Date("2026-11-11T16:59:59Z"))` → `"2026-11-11"` (23:59:59 ไทย)
  - `daysBetween("2026-11-11", "2026-11-23")` → `12`
  - `daysBetween("2026-11-11", "2026-11-11")` → `0`
  - `daysBetween("2026-11-11", "2026-11-10")` → `-1`
  - `daysBetween("2026-12-30", "2027-01-02")` → `3` (ข้ามปี)

- [ ] **Step 2: Run** `npx vitest run lib/calc/time.test.ts` → FAIL (`thaiDate` is not exported)

- [ ] **Step 3: Implement** ใน `lib/calc/time.ts` — `thaiDate` ใช้ `Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE })` (ได้รูป `YYYY-MM-DD`) · `daysBetween` แปลงทั้งสองเป็น `Date.UTC(y, m-1, d)` แล้วหาร 86,400,000 (ไม่มี DST เพราะเทียบเที่ยงคืน UTC ทั้งคู่)

- [ ] **Step 4: Run** `npm test` → PASS ทั้งหมด

- [ ] **Step 5: Commit** (ถามพอก่อน) `feat(calc): Thai-time date helpers`

---

### Task 2: ตัวคำนวณงบ

**Files:**
- Create: `lib/calc/money.ts`, `lib/calc/budget.ts`, `lib/calc/budget.test.ts`

**Interfaces:**
- Consumes: `daysBetween` จาก Task 1
- Produces:
  ```ts
  // lib/calc/money.ts
  export type Satang = number;
  export const baht = (n: number): Satang => Math.round(n * 100);
  export const floorToBaht = (s: Satang): Satang => Math.floor(s / 100) * 100;

  // lib/calc/budget.ts
  export interface BudgetInput {
    startBalance: Satang;      // cycle start (or last adjustment)
    spentBeforeToday: Satang;  // entries in cycle with spent_on < today
    spentToday: Satang;        // entries with spent_on = today
    emergencyBuffer: Satang;
    reserved: Satang;          // reserved bills + planned purchases
    today: string;             // YYYY-MM-DD Thai
    payday: string;            // YYYY-MM-DD
  }
  export type BudgetResult =
    | { kind: "ok"; usable: Satang; dailyBudget: Satang; todayRemaining: Satang; daysLeft: number }
    | { kind: "shortfall"; usable: Satang; shortfall: Satang; daysLeft: number }
    | { kind: "payday-passed"; usable: Satang };
  export function computeBudget(input: BudgetInput): BudgetResult;
  export function simulatePurchase(input: BudgetInput, amount: Satang): BudgetResult;
  ```
- กติกา (จาก spec ข้อ 5):
  - `usable = startBalance − spentBeforeToday − spentToday − emergencyBuffer − reserved`
  - `daysLeft = daysBetween(today, payday)` · `daysLeft ≤ 0` → `payday-passed` (ตรวจก่อนข้ออื่น)
  - `usable < 0` → `shortfall` โดย `shortfall = −usable`
  - ไม่งั้น `dailyBudget = floorToBaht((usable + spentToday) / daysLeft)` และ `todayRemaining = dailyBudget − spentToday` (ติดลบได้ = ใช้เกินงบวันนี้)
  - `simulatePurchase` = `computeBudget` ที่ `reserved + amount` ไม่แก้ input เดิม

- [ ] **Step 1: Write the failing tests** ใน `lib/calc/budget.test.ts` (ใช้ `baht()` เขียนค่า)
  - **เดโม:** start 2,400 · reserved 600 · today `2026-11-11` payday `2026-11-23` → `ok`, `dailyBudget` = baht(150), `todayRemaining` = baht(150)
  - **เดโม จดข้าว 45:** เหมือนข้างบน + spentToday 45 → `dailyBudget` baht(150), `todayRemaining` baht(105)
  - **FR03:** start 1,960 · buffer 210 · 7 วัน · `simulatePurchase(…, baht(700))` → `dailyBudget` baht(150) และ `input.reserved` ยังเป็น 0
  - **FR04:** start 1,960 · buffer 210 · reserved 350 · 10 วัน → baht(140) · reserved 0 (ยกเลิก) → baht(175)
  - **FR06:** start 2,000 · reserved 500 · 10 วัน → จ่ายบิล (spentBeforeToday +500, reserved −500) → `usable` เท่าเดิมและ `dailyBudget` เท่าเดิม
  - **DR01 วันรับเงินคือวันนี้:** payday = today → `{ kind: "payday-passed" }`
  - **DR01 วันรับเงินผ่านแล้ว:** payday = today − 1 → `payday-passed`
  - **DR01 ติดลบ:** start 500 · reserved 800 · 5 วัน → `{ kind: "shortfall", shortfall: baht(300) }`
  - **ปัดลง:** start 1,000 · 3 วัน → `dailyBudget` baht(333)
  - **ใช้เกินวันนี้:** start 1,000 · 10 วัน · spentToday 150 → `todayRemaining` baht(−50)

- [ ] **Step 2: Run** `npx vitest run lib/calc/budget.test.ts` → FAIL (module not found)

- [ ] **Step 3: Implement** `lib/calc/money.ts` และ `lib/calc/budget.ts` ตาม Interfaces

- [ ] **Step 4: Run** `npm test` → PASS · ลองเปลี่ยน `Math.floor` เป็น `Math.round` ชั่วคราว ต้องมีเทสต์ "ปัดลง" แดง แล้วเปลี่ยนกลับ

- [ ] **Step 5: Commit** (ถามพอก่อน) `feat(calc): daily budget calculator with reference cases`

---

### Task 3: ตารางฐานข้อมูล + ฐานข้อมูลทดสอบบนเครื่อง

**ต้องทำก่อน (พอ):** เปิด Docker Desktop ให้ `docker info` ใช้ได้

**Files:**
- Create: `supabase/config.toml` (จาก `supabase init`), `supabase/migrations/20261111000000_layer0.sql`
- Create: `lib/db/client.ts`, `lib/db/schema.db.test.ts`, `vitest.db.config.mts`
- Modify: `vitest.config.mts` (exclude `**/*.db.test.ts`), `package.json` (script `test:db`), `README.md` (วิธีรันฐานข้อมูลบนเครื่อง)
- Modify: `.env.example` (เพิ่มคอมเมนต์ว่าค่าบนเครื่องได้จาก `supabase status -o env`)

**Interfaces:**
- Produces:
  - `getDb(): SupabaseClient` ใน `lib/db/client.ts` — สร้างครั้งเดียวจาก `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (`auth: { persistSession: false }`) ถ้าไม่มีค่า throw `Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")`
  - ตารางตาม spec ข้อ 6 (ชั้น 0–1): `users`, `cycles`, `entries`, `plans`, `category_limits`, `chat_drafts`, `line_events`
- รายละเอียดที่ spec ไม่ได้ระบุ (ตัดสินแล้ว):
  - `id uuid primary key default gen_random_uuid()` · `created_at timestamptz default now()`
  - เงินเป็น `bigint` · `entries.amount`, `plans.amount` มี `check (amount > 0)` · `start_balance`, `emergency_buffer` มี `check (>= 0)`
  - `category` เป็น `text` + `check (category in ('food','transport','supplies','fun','bills','other'))`
  - `cycles`: `create unique index cycles_one_active on cycles(user_id) where status = 'active'`
  - `entries.idempotency_key text not null unique`
  - `line_events.webhook_event_id text primary key`
  - FK ทุกตัวไป `users(id) on delete cascade` · `entries.cycle_id`/`plans.cycle_id` → `cycles(id)`
  - `alter table … enable row level security` ทุกตาราง **ไม่สร้าง policy**
  - `vitest.db.config.mts` ตั้ง `fileParallelism: false` (เทสต์ใช้ฐานข้อมูลเดียวกัน)

- [ ] **Step 1: Init** `supabase init` แล้ว `supabase start` → เห็น API URL และ service_role key

- [ ] **Step 2: Write the failing tests** ใน `lib/db/schema.db.test.ts`
  - สร้าง user แล้วสร้าง cycle active สองรอบให้ user เดียวกัน → อันที่สอง error code `23505`
  - insert `entries` สองแถวที่ `idempotency_key` เดียวกัน → อันที่สอง `23505`
  - insert `entries.amount = 0` → error `23514`
  - insert `line_events` ซ้ำ id เดิม → `23505`
  - **RLS:** client ที่ใช้ anon key `select * from entries` → ได้ 0 แถว แม้มีข้อมูลอยู่
  - แต่ละเทสต์ลบข้อมูลของตัวเองใน `afterEach` (ลบ user → cascade)

- [ ] **Step 3: Run** `npm run test:db` → FAIL (relation "users" does not exist)

- [ ] **Step 4: Write migration** `supabase/migrations/20261111000000_layer0.sql` ตาม Interfaces แล้ว `supabase db reset`

- [ ] **Step 5: Run** `npm run test:db` → PASS และ `npm test` ยัง PASS โดยไม่ต้องเปิดฐานข้อมูล

- [ ] **Step 6: Commit** (ถามพอก่อน) `feat(db): layer 0-1 schema with RLS and idempotency constraints`

---

### Task 4: ตรวจ ID token และ `requireUser`

**Files:**
- Create: `lib/line/id-token.ts`, `lib/line/id-token.test.ts`
- Create: `lib/http.ts` (HttpError + errorResponse)
- Create: `lib/auth.ts`, `lib/auth.db.test.ts`

**Interfaces:**
- Consumes: `getDb()` จาก Task 3
- Produces:
  ```ts
  // lib/line/id-token.ts
  export type VerifyResult = { ok: true; lineUserId: string } | { ok: false; reason: "invalid" | "unavailable" };
  export function verifyIdToken(idToken: string, channelId: string, fetchImpl?: typeof fetch): Promise<VerifyResult>;

  // lib/http.ts
  export class HttpError extends Error { constructor(status: number, code: string, message: string) }
  export function errorResponse(err: unknown): Response;  // HttpError → its status; anything else → 500 "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง"

  // lib/auth.ts
  export interface AuthedUser { userId: string; lineUserId: string }
  export function requireUser(request: Request, deps?: { verify?: typeof verifyIdToken }): Promise<AuthedUser>;
  ```
- `verifyIdToken`: `POST https://api.line.me/oauth2/v2.1/verify` body form-urlencoded `id_token`, `client_id` · status 200 → `{ ok: true, lineUserId: json.sub }` · status 4xx → `invalid` · fetch throw / 5xx / เกิน 5 วินาที (`AbortSignal.timeout(5000)`) → `unavailable`
- `requireUser`: อ่าน `Authorization: Bearer <token>` · ไม่มี/ผิดรูป → `HttpError(401, "unauthorized", "กรุณาเข้าสู่ระบบผ่าน LINE ใหม่")` · `invalid` → 401 เดียวกัน · `unavailable` → `HttpError(503, "line_unavailable", "เชื่อมต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง")` · ผ่าน → upsert `users` on `line_user_id` แล้วคืน `{ userId, lineUserId }` · channel ID จาก `LINE_MINIAPP_CHANNEL_ID`

- [ ] **Step 1: Write the failing tests** ใน `lib/line/id-token.test.ts` (ใส่ `fetchImpl` ปลอม)
  - 200 `{ sub: "U123" }` → `{ ok: true, lineUserId: "U123" }` และ body ที่ส่งมี `id_token=` กับ `client_id=`
  - 400 → `{ ok: false, reason: "invalid" }`
  - 500 → `unavailable`
  - fetch throw `TypeError` → `unavailable`

- [ ] **Step 2: Run** `npx vitest run lib/line/id-token.test.ts` → FAIL

- [ ] **Step 3: Implement** `verifyIdToken` และ `lib/http.ts`

- [ ] **Step 4: Write the failing tests** ใน `lib/auth.db.test.ts` (ใส่ `deps.verify` ปลอม)
  - ไม่มี header → throw HttpError status 401
  - `Authorization: Basic abc` → 401
  - verify คืน `invalid` → 401
  - verify คืน `unavailable` → 503
  - verify คืน `U_A` สองครั้ง → `userId` เดียวกันทั้งสองครั้ง และมีแถวใน `users` แถวเดียว
  - `U_A` กับ `U_B` → `userId` ต่างกัน

- [ ] **Step 5: Run** `npm run test:db` → FAIL → implement `requireUser` → PASS · `npm test` PASS

- [ ] **Step 6: Commit** (ถามพอก่อน) `feat(auth): verify LINE ID token and resolve user`

---

### Task 5: Webhook — ลายเซ็นและกัน event ซ้ำ

**Files:**
- Create: `lib/line/signature.ts`, `lib/line/signature.test.ts`
- Create: `lib/db/line-events.ts`
- Create: `app/api/line/webhook/route.ts`, `app/api/line/webhook/route.db.test.ts`
- Delete: `app/api/line/webhook/.gitkeep`

**Interfaces:**
- Consumes: `getDb()` (Task 3), `errorResponse` (Task 4)
- Produces:
  - `verifySignature(rawBody: string, signature: string | null, secret: string): boolean` — HMAC-SHA256 ของ body ดิบ เข้ารหัส base64 เทียบด้วย `crypto.timingSafeEqual` (ความยาวไม่เท่า → false)
  - `recordEvent(webhookEventId: string): Promise<boolean>` — `true` = ครั้งแรก, `false` = เคยมาแล้ว
  - `POST /api/line/webhook`: อ่าน `await request.text()` → ลายเซ็นผิด/ไม่มี → 401 · ถูก → แต่ละ event ที่ `recordEvent` คืน `true` ส่งต่อให้ `handleEvent(event: unknown): Promise<void>` (export จาก `lib/line/handle-event.ts` ตอนนี้ไม่ทำอะไร ชั้น 1 จะเติม) → ตอบ 200 `{}` เสมอเมื่อลายเซ็นถูก (LINE ต้องการ 200 เร็ว) · body ว่าง `{"events":[]}` (LINE ใช้ทดสอบ URL) → 200
- secret จาก `LINE_CHANNEL_SECRET`

- [ ] **Step 1: Write the failing tests** ใน `lib/line/signature.test.ts` (secret ทดสอบ `"test-secret"`, คำนวณลายเซ็นคาดหวังด้วย `createHmac` ในเทสต์)
  - ลายเซ็นถูก → `true`
  - body แก้ไป 1 ตัวอักษร → `false`
  - `null` → `false`
  - ลายเซ็นสั้นกว่า (ความยาวไม่เท่า) → `false` ไม่ throw

- [ ] **Step 2: Run** → FAIL → implement → PASS

- [ ] **Step 3: Write the failing tests** ใน `route.db.test.ts` (เรียก `POST(new Request(...))` ตรงๆ, mock `handleEvent` ด้วย `vi.mock`)
  - ลายเซ็นผิด → 401 และ `handleEvent` ไม่ถูกเรียก
  - `{"events":[]}` ลายเซ็นถูก → 200
  - event `webhookEventId: "E1"` ส่งสองครั้ง (ลายเซ็นถูกทั้งคู่) → 200 ทั้งคู่, `handleEvent` ถูกเรียก **1 ครั้ง**
  - body มี E2 กับ E3 → เรียก 2 ครั้ง

- [ ] **Step 4: Run** `npm run test:db` → FAIL → implement `recordEvent`, `handle-event.ts`, `route.ts` → PASS

- [ ] **Step 5: Commit** (ถามพอก่อน) `feat(line): webhook signature check and event dedupe`

---

### Task 6: `GET /api/me` และตรวจของจริง

**Files:**
- Create: `app/api/me/route.ts`, `app/api/me/route.db.test.ts`
- Modify: `README.md` (เส้น API ที่มีแล้ว + ขั้นตั้งค่า LINE/Vercel)

**Interfaces:**
- Consumes: `requireUser`, `errorResponse`, `getDb`
- Produces: `GET /api/me` → 200 `{ userId: string, hasActiveCycle: boolean }` · ไม่มี token → 401 ตามรูปแบบ error

- [ ] **Step 1: Write the failing tests** (ใส่ verify ปลอมผ่าน `vi.mock("@/lib/line/id-token")`)
  - ไม่มี token → 401 body `error.code === "unauthorized"`
  - token ของ `U_A` ยังไม่มีรอบ → `{ hasActiveCycle: false }`
  - สร้าง cycle active ให้ `U_A` → `{ hasActiveCycle: true }` · แต่ `U_B` ยังได้ `false`

- [ ] **Step 2: Run** → FAIL → implement → PASS · รัน `npm test && npm run test:db && npm run lint && npm run typecheck && npm run build` ผ่านทั้งหมด

- [ ] **Step 3: ตรวจของจริง (ต้องใช้บัญชีของพอ)**
  1. พอสร้าง Messaging API channel + MINI App channel (หรือ LIFF ถ้าไทยสร้าง MINI App ไม่ได้) และโปรเจกต์ Supabase จริง
  2. `supabase db push` ขึ้นโปรเจกต์จริง
  3. deploy preview บน Vercel พร้อม env ทั้งหมดใน Vercel (ไม่ใช่ใน repo)
  4. ตั้ง webhook URL ใน LINE console แล้วกด **Verify** → ได้ Success (webhook ตอบ 200)
  5. เปิด MINI App บนมือถือ เรียก `/api/me` ด้วย ID token จริง → ได้ `userId` และมีแถวใหม่ใน `users`
  6. ส่งข้อความหา OA → ใน `line_events` มีแถวเพิ่ม 1 แถว

  **ชั้น 0 เสร็จ = ข้อ 4–6 ผ่านบนมือถือจริง** ไม่ใช่แค่เทสต์เขียว

- [ ] **Step 4: Commit** (ถามพอก่อน) `feat(api): /api/me with real LINE identity`
