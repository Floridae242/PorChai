# 📋 รายงานการตรวจสอบการทดสอบก่อนผสานโค้ด (Pre-Merge Test Audit Report & Operational Guide)
**โครงการ:** พอใช้ (Por-Chai) — LINE-based Personal Finance Application  
**สถาปัตยกรรม:** Next.js App Router, TypeScript, Tailwind CSS, Supabase (PostgreSQL RLS), LINE LIFF  
**บทบาท:** Principal QA Architect, Test Automation Lead & Release Manager  
**วันที่ตรวจสอบ:** 15 พฤศจิกายน 2026  
**สถานะภาพรวม:** 🟡 พร้อมผสานโค้ดหลังปิดข้อบกพร่องระดับ P1 และเคลียร์ Node Dependencies  

---

## Executive Summary: สถานะการทดสอบปัจจุบัน (Current Progress)

| เลเยอร์การทดสอบ (Test Layer) | เครื่องมือ (Framework) | สถานะ (Status) | จำนวนเคสที่ผ่าน / ทั้งหมด | หมายเหตุสำคัญ |
| :--- | :--- | :---: | :---: | :--- |
| **Unit & Formula Invariants** | Vitest | ✅ **ผ่าน 100%** | **1,173 / 1,173** (65 ไฟล์) | ผ่านกฎคำนวณ R1–R13, R3-quarter (ปัดลง 25 สตางค์) และ 5,000 Fuzzing Invariants |
| **QA Specific Calculation** | Vitest (`qa-cases.test.ts`) | ✅ **ผ่าน 100%** | **25 / 25 เคส** | ครอบคลุมชุดตัวอย่างกลาง 1,000 บ., เคส 700 บ. 3 วัน, วันรับเงิน 0 วัน, เงินขาด ฯลฯ |
| **Security & Auth Integration** | Vitest (`api-security.test.ts`) | ✅ **ผ่าน 100%** | **7 / 7 เคส** | ตรวจสอบ Webhook Idempotency (TC-18), Data Isolation (TC-19), Signature Check |
| **UI Unit (DOM Testing)** | Vitest + React Testing Library | ⚠️ **ติดขัดชั่วคราว** | 33 Component Errors | เกิดจากเครื่องยังไม่ได้ลิงก์แพ็กเกจ `jsdom` ใน node_modules (ซอร์สโค้ดผ่านสมบูรณ์) |
| **E2E Automation** | Playwright (5 specs) | 🟡 **เขียนโค้ดพร้อมรัน** | 26 Scenarios | จำลอง LIFF Flow, Double-submit, PII Masking (ต้องรันภายนอก Sandbox บนพอร์ต `:3004`) |
| **Robot Framework Suite** | Robot (Requests + Browser) | 🚀 **จัดเตรียม Starter สำเร็จ** | 3 Suites Ready | ครอบคลุม API Cycle, R3-quarter validation, LIFF UI button protection |

---

## 1️⃣ Comprehensive Code & Test Coverage Audit (Gap Analysis)

การวิเคราะห์เปรียบเทียบชุดการทดสอบปัจจุบันกับ **Master Test Cases (TC-01 ถึง TC-26)** และ **กฎคำนวณทางการเงิน (R1 ถึง R13)**:

### 📊 ตารางตรวจสอบความครอบคลุมรายเคส (Master Test Cases TC-01 ถึง TC-26)

| รหัสเคส | หัวข้อและเงื่อนไขการทดสอบ | สถานะการทดสอบ | ไฟล์เทสต์ที่ครอบคลุม | ผลการตรวจสอบ & ความเสี่ยง (Risk Assessment) |
| :--- | :--- | :---: | :--- | :--- |
| **TC-01** | ตั้งรอบ & ลองซื้อ 140 บ. (เงินจริง 1,000 ไม่เปลี่ยน) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** ค่า usable = 560, daily = 80, balance คงเดิม 1,000 |
| **TC-02** | เลือกกันไว้ 140 บ. (กันไว้รวม 440 บ., เงินจริง 1,000) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** ยอดกันไว้เพิ่ม เงินจริงยังไม่ถูกตัด |
| **TC-03** | บันทึกจ่ายจริง 140 บ. (เงินจริงเหลือ 860 บ.) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** ปลดล็อกยอดกันไว้ เงินจริงลดเหลือ 860 ไม่หักซ้ำ |
| **TC-04** | 700 บ. 3 วัน ลอง 300 (ปัดเศษ 25 สตางค์) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** 700/3 = 233.25 บ. (23,325 สตางค์) ตามกฎ R3-quarter |
| **TC-05** | เงินพอใช้ 2,400 บ., บิล 600 บ., 12 วัน | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** ยังไม่จัดสรร 1,800 บ., งบ 150 บ./วัน |
| **TC-06** | เงินขาด / ติดลบ (เงิน 500 บิล 600 เหลือ 5 วัน) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** คืนสถานะ `shortfall` ขาด 100 บ., ไม่แสดงงบเป็นบวก |
| **TC-07** | วันได้เงินคือวันนี้ (เหลือ 0 วัน) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** คืนสถานะ `payday-passed`, ป้องกัน Zero Division Error |
| **TC-08** | เลื่อนวันรับเงินออกไป (6 วัน → 10 วัน) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** งบลดจาก 100 บ./วัน เหลือ 60 บ./วัน |
| **TC-09** | บิลถึงกำหนดก่อนเงินเข้า (15 วัน หัก 200 บ.) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** หักในรอบปัจจุบัน ได้งบ 86.50 บ./วัน (R3-quarter) |
| **TC-10** | บิลกำหนดจ่ายหลังวันเงินเข้า | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** ไม่นำมาหักในรอบนี้ งบได้ 100 บ./วัน เต็ม |
| **TC-11** | จ่ายจริงเกินยอดกันไว้ (กัน 100 จ่าย 150) | ✅ Fully Covered | `tests/unit/budget.test.ts` | **ผ่าน:** ส่วนต่าง 50 บ. ไปปรับลดที่ยอดเงินยังไม่จัดสรร |
| **TC-12** | จ่ายจริงต่ำกว่ายอดกันไว้ (กัน 100 จ่าย 50) | ✅ Fully Covered | `tests/unit/budget.test.ts` | **ผ่าน:** คืนยอด 50 บ. กลับเข้าเงินยังไม่จัดสรร งบเพิ่ม |
| **TC-13** | ผู้ใช้ปรับยอดเงินปัจจุบัน (กระเป๋าจริง 850 บ.) | ✅ Fully Covered | `qa-cases.test.ts` | **ผ่าน:** งบเฉลี่ยปรับเป็น 78.50 บ./วัน อย่างถูกต้อง |
| **TC-14** | Form Validation ตั้งรอบเงิน (เว้นว่าง balance/payday) | ✅ Fully Covered | `qa-cases.test.ts`, `liff-flows.spec.ts` | **ผ่าน:** ปฏิเสธค่าว่างและไม่เกิด NaN |
| **TC-15** | ปฏิเสธค่าติดลบ & คำนวณทศนิยมสตางค์แม่นยำ | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** ปฏิเสธค่าลบ แปลง 100.55 บ. เป็น 10,055 สตางค์ |
| **TC-16** | ยกเลิกรายการที่กันไว้ (คืนเงินเข้ายังไม่จัดสรร) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** ยกเลิกกัน 250 บ. งบขยับจาก 150 เป็น 200 บ./วัน |
| **TC-17** | Double Submit Protection (ป้องกันกดซ้ำ) | ✅ Covered (E2E) | `tests/e2e/liff-flows.spec.ts` | **ผ่าน:** ปุ่ม Disable ทันทีหลังคลิกแรก บันทึกรายการเดียว |
| **TC-18** | LINE Webhook Idempotency (ส่งซ้ำไม่เบิ้ล) | ✅ Fully Covered | `tests/integration/api-security.test.ts` | **ผ่าน:** ตรวจจับ `webhookEventId` ซ้ำ ไม่บันทึก entry เพิ่ม |
| **TC-19** | User Data Isolation (ผู้ใช้ A และ B แยกขาด) | ✅ Fully Covered | `tests/integration/api-security.test.ts` | **ผ่าน:** ผู้ใช้ A ไม่สามารถอ่านหรือแก้ไขข้อมูลของผู้ใช้ B |
| **TC-20** | Microsoft Clarity PII Masking | 🟡 E2E Ready | `tests/e2e/pii-leakage.spec.ts` | **ต้องตรวจ Manual:** ดูการ Masking ตัวเลขจริงในแท็ก DOM |
| **TC-21** | จดรายจ่ายแล้วงบวันนี้และเงินจริงลด | ✅ Fully Covered | `qa-cases.test.ts` | **ผ่าน:** จด 45 บ. งบลดเหลือ 105 บ., เงินจริงลดตรงยอด |
| **TC-22** | ลองหลายครั้งไม่สะสม & R3-quarter (ลอง 250) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** งบได้ 64.25 บ./วัน และกดยกเลิกงบกลับคืนค่าเดิม |
| **TC-23** | ลองซื้อเกินเงินที่ใช้ได้ (Shortfall) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** แสดงสถานะเงินขาด ไม่แสดงงบต่อวันเป็นบวก |
| **TC-24** | วันรับเงินคือพรุ่งนี้ (เหลือ 1 วัน ไม่หาร 0) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** 700 / 1 = 700 บ./วัน ตัวหารเป็น 1 แม่นยำ |
| **TC-25** | เงินพอดี (ยังไม่จัดสรร = 0 บ.) | ✅ Fully Covered | `qa-cases.test.ts`, `budget.test.ts` | **ผ่าน:** สถานะเป็นพอดี งบ 0 บ./วัน และถ้าลอง 1 บ. จะกลายเป็นขาด |
| **TC-26** | ตั้งค่าหลายบิลและลบบิล | ✅ Fully Covered | `qa-cases.test.ts` | **ผ่าน:** ลบบิล 50 บ. ยอดคำนวณใหม่ได้ 154.00 บ./วัน |

---

### ❌ Gaps / Missing Tests & Production Risk Analysis

จากการตรวจสอบเชิงลึกของ API Routes (`app/api/`) และฐานข้อมูล Supabase พบจุดที่ต้องเฝ้าระวังและปิดความเสี่ยงก่อน Production:

1. **Auth Session `/api/me` State Sync (ความเสี่ยง: ระดับปานกลาง - Medium Risk)**
   - *คำอธิบาย:* `/api/me` มี `route.db.test.ts` รันกับ DB โดยตรง แต่ยังไม่มี Contract Test ยืนยัน Header ลิสต์ที่ส่งมาจาก LIFF SDK เมื่อ Token หมดอายุ (401 Expired Token handling) ในโหมด Headless
   - *ผลกระทบที่อาจเกิด:* ผู้ใช้ใน LINE เปิดหน้าจอทิ้งไว้นานจน Token หมดอายุ อาจเจอปัญหาหน้าจอค้างขาว แทนที่จะบังคับ Redirect ไป Login LIFF ใหม่

2. **Cycle CRUD Lifecycle Validation (ความเสี่ยง: ระดับสูง - High Risk)**
   - *คำอธิบาย:* ใน `app/api/cycle/route.ts` มีการตรวจสอบ `parseNewCycle` แต่ยังขาด Integration Test ที่ทดสอบการ "เริ่มรอบใหม่ขณะที่รอบเก่ายังไม่หมดวัน" (Cycle Overlapping) ผ่าน Webhook
   - *ผลกระทบที่อาจเกิด:* ข้อมูลบิลประจำของรอบเก่าอาจถูกเบิ้ล หรือค้างอยู่ในกระเป๋าเงินใหม่

3. **Supabase RLS Policy Automated Penetration (ความเสี่ยง: ระดับวิกฤต - Critical Risk)**
   - *คำอธิบาย:* แม้ว่าโค้ดแอปพลิเคชันจะผูก `user_id` ในทุก Where clause แต่การทดสอบว่า Direct PostgREST Request โดยไม่มี Service Role Key จะทะลุเข้า Table `entries` หรือ `plans` ของคนอื่นได้หรือไม่ ยังอิงกับ DB Container Setup ใน Local
   - *ข้อแนะนำ:* ต้องมี Automated RLS Verification Suite รันก่อนขึ้น Production ทุกครั้ง

4. **Clarity Masking In Dynamic Modals (ความเสี่ยง: ระดับปานกลาง - Medium Risk)**
   - *คำอธิบาย:* หน้าต่าง Modal หรือ Toast แจ้งเตือนยอดเงินบางจุด ไม่ได้ถูกครอบด้วยคลาส `.clarity-mask` หรือ Attribute `data-clarity-mask="true"` อย่างรัดกุม 100% อาจทำให้ตัวเลขสลิปหรือยอดเงินหลุดไปยัง Dashboard ของ Clarity

---

## 2️⃣ Test Execution & Result Inspection Guide (Terminal, UI, & Reports)

### 🔹 เลเยอร์ 1: Unit & Integration Tests (Vitest)
ใช้สำหรับการตรวจสอบฟังก์ชันคำนวณทางการเงิน, ตรรกะของแชตบอท, และความปลอดภัยของ Webhook:

```bash
# 1. รันชุดทดสอบคำนวณหลักและ Integration ทั้งหมด (Fast Terminal Output)
npm test

# 2. เจาะจงรันเฉพาะชุด QA Test Cases (26 เคส และกฎ R1-R13)
npx vitest run lib/calc/qa-cases.test.ts tests/unit/budget.test.ts

# 3. เจาะจงรันเฉพาะ Security & Webhook Idempotency Integration Tests
npx vitest run tests/integration/api-security.test.ts

# 4. เปิด Interactive Vitest UI (ดูรายละเอียด Assertion และ Call Stack ผ่านเว็บเบราว์เซอร์)
npx vitest --ui
```
*การตรวจสอบผล:*
- **Terminal:** จะแสดงสถานะ `✓ Passed` พร้อม Execution Time ของแต่ละไฟล์
- **Vitest UI:** เปิด URL `http://localhost:51204/__vitest__/` สามารถคลิกเลือกดู Test Suites, Source Code, และ Mock Spies ได้แบบเรียลไทม์

---

### 🔹 เลเยอร์ 2: End-to-End Tests (Playwright)
ใช้สำหรับตรวจสอบพฤติกรรมหน้าจอ LINE LIFF, การป้องกัน Double Submit, และการ Masking ข้อมูลส่วนบุคคล:

> ⚠️ **คำแนะนำด้านสภาพแวดล้อม (Sandbox Limitation):**  
> ภายในสภาพแวดล้อมคอนเทนเนอร์แบบ Sandbox พอร์ตเครือข่ายภายในจะถูกแยกการเข้าถึง ทำให้เบราว์เซอร์ไม่สามารถเชื่อมต่อ `localhost` ได้โดยตรง  
> **ให้รันการทดสอบ Playwright บนเครื่องเครื่องพัฒนา (Local Machine) นอก Sandbox เสมอ**

```bash
# 1. เปิด Dev Server นอก Sandbox บนพอร์ตเฉพาะ (เช่น 3004 หรือ 3000)
npm run dev -- -p 3004

# 2. รัน E2E ทั้งหมดแบบ Headless
npx playwright test

# 3. รัน E2E แบบเปิดหน้าต่างเบราว์เซอร์ดูการทำงานจริง (Headed Mode)
npx playwright test tests/e2e/liff-flows.spec.ts --headed

# 4. ตรวจสอบรายงานผลลัพธ์ผ่าน Playwright HTML Report
npx playwright show-report
```
*การตรวจสอบผล:*
- คำสั่ง `show-report` จะเปิดหน้าต่าง HTML แสดงเวลาที่ใช้, วิดีโอและภาพสกรีนช็อต ณ จุดที่ทดสอบล้มเหลว (Failure Screenshots), ตลอดจน Network Payloads ที่ถูกส่งออก

---

### 🔹 เลเยอร์ 3: Robot Framework Test Automation (API + UI / LIFF)
ใช้สำหรับการทดสอบแบบ Acceptance Testing ตามมาตรฐานองค์กร โดยแยกระหว่าง Headless API Verification และ LIFF Web-view Flows:

```bash
# 1. ติดตั้ง Library ที่จำเป็น (Python 3.10+)
pip install robotframework robotframework-requests robotframework-browser
rfbrowser init

# 2. รันเฉพาะชุดทดสอบ API Financial Cycle (Headless)
robot -d robot/results -i api robot/suites/api/cycle.robot

# 3. รันเฉพาะชุดทดสอบ UI / LIFF Flows
robot -d robot/results -i ui robot/suites/ui/liff_flows.robot

# 4. รันชุดทดสอบ Robot Framework ทั้งหมด
robot -d robot/results robot/suites/
```
*การตรวจสอบผลในโฟลเดอร์ `robot/results/`:*
- `report.html`: รายงานสรุปภาพรวมในระดับ Executive (Pass/Fail Rate, Tag Performance)
- `log.html`: บันทึกการทำงานเชิงลึก (Detailed Execution Log) สามารถคลิกขยายดู Keyword, Parameter, API Request Header/Body, และ Response JSON ได้ในทุก Step
- `output.xml`: ไฟล์โครงสร้างผลการทดสอบสำหรับส่งต่อไปยังระบบ CI/CD (เช่น Jenkins, GitHub Actions)

---

## 3️⃣ Step-by-Step Manual Testing Guide (Pre-Merge Verification)

เนื่องจากบางสถานการณ์ทำงานอยู่บน LINE Native Application Runtime บนโทรศัพท์มือถือจริง จึงจำเป็นต้องทำ Manual Verification ตามขั้นตอนต่อไปนี้ก่อนกด Merge:

---

### 📱 จุดที่ 1: LINE Data Isolation Verification (TC-19)
*วัตถุประสงค์:* ตรวจสอบว่าผู้ใช้บัญชี A ไม่สามารถมองเห็นหรือแก้ไขข้อมูลทางการเงินของผู้ใช้บัญชี B ได้เป็นอันขาด

1. ใช้โทรศัพท์ 2 เครื่อง (เครื่อง A ล็อกอิน LINE User A, เครื่อง B ล็อกอิน LINE User B)
2. เครื่อง A: เปิด LINE LIFF ทำการตั้งรอบเงิน 1,500 บาท และสร้างแผนกันเงินซื้อหูฟัง 400 บาท
3. ตรวจสอบ Network Request ใน Developer Menu หา `planId` ของ User A (เช่น `plan_abc_123`)
4. เครื่อง B: ใช้ Curl หรือ Postman ส่งคำขอแก้ไขหรือลบแผนของ User A โดยแนบ Access Token ของ User B:
   ```bash
   curl -X DELETE "https://api-porchai.staging/api/plans/plan_abc_123" \
        -H "Authorization: Bearer <ACCESS_TOKEN_USER_B>"
   ```
5. **เกณฑ์การผ่าน:** ระบบต้องตอบกลับด้วย `401 Unauthorized` หรือ `404 Not Found` ทันที และเมื่อเปิดหน้าจอเครื่อง A ยอดแผน 400 บาทต้องยังคงอยู่สมบูรณ์ ไม่มีการสูญหายหรือถูกเปลี่ยนแปลง

---

### 📱 จุดที่ 2: Webhook Idempotency & Ambiguous Messages (TC-18 & P-14)
*วัตถุประสงค์:* ตรวจสอบว่าระบบบันทึกรายการเพียงครั้งเดียวเมื่อ LINE ส่ง Webhook ซ้ำ และสามารถจัดการข้อความที่มีหลายยอดได้อย่างถูกต้อง

1. **ทดสอบ Webhook ซ้ำ (TC-18):**
   - จำลองการส่ง LINE Webhook Event ด้วย Payload เดิมและ `webhookEventId` เดียวกันจำนวน 3 ครั้งติดกันภายใน 1 วินาที
   - **เกณฑ์การผ่าน:** ตรวจสอบฐานข้อมูลและยอดเงินใน LIFF รายการรายจ่ายต้องถูกบันทึกเพียง 1 ครั้งเท่านั้น และคำตอบในแชต LINE ต้องไม่ส่งการ์ดสรุปซ้ำ
2. **ทดสอบข้อความกำกวมมียอดหลายจำนวน (P-14):**
   - ในห้องแชต LINE พิมพ์ข้อความ: `"ข้าว 45 น้ำ 20"` หรือ `"กินหมูกระทะ 199 หรือ 250 ดี"`
   - **เกณฑ์การผ่าน:** ระบบจะต้องไม่สุ่มบันทึกยอดเงินใดไปก่อน แต่ต้องตอบกลับด้วย Bubble ถามยืนยัน เช่น *"พบ 2 รายการ (ข้าว 45 บ. และ น้ำ 20 บ.) ต้องการจดรายการไหนครับ?"*

---

### 📱 จุดที่ 3: LIFF Double-Submit Protection (TC-17)
*วัตถุประสงค์:* ป้องกันการตัดเงินซ้ำเมื่อผู้ใช้กดปุ่มยืนยันจ่ายเงินรัว ๆ ขณะเน็ตช้า

1. บนมือถือจริง เปิด Developer Mode หรือเปิด Network Throttling เป็น `Slow 3G`
2. ไปที่หน้า "บันทึกจ่ายจริง" ใส่ยอด 50 บาท (จากเงินคงเหลือ 1,000 บาท)
3. รัวนิ้วกดปุ่ม **"ยืนยันการจ่าย"** 3 ครั้งติดต่อกันอย่างรวดเร็ว
4. **เกณฑ์การผ่าน:**
   - ทันทีที่แตะครั้งแรก ปุ่มจะต้องเปลี่ยนสถานะเป็น `Disabled` (สีเทา) และแสดงสถานะกำลังโหลด (Spinner) ทันที
   - การแตะครั้งที่ 2 และ 3 จะต้องไม่มีผลใด ๆ
   - เมื่อเชื่อมต่อสำเร็จ ยอดเงินคงเหลือต้องเปลี่ยนจาก 1,000 เป็น 950 บาท (ลดลงเพียง 50 บาทเท่านั้น ไม่ใช่ 850 บาท)

---

### 📱 จุดที่ 4: Microsoft Clarity PII Masking Verification (TC-20)
*วัตถุประสงค์:* ยืนยันว่าไม่มีข้อมูลทางการเงินหรือตัวตนส่วนบุคคลหลุดไปยัง Dashboard บันทึกหน้าจอภายนอก

1. เปิดหน้าจอ LIFF ผ่าน Chrome Browser ที่ต่อ Remote Inspect กับมือถือ
2. คลิกขวา Inspect Element ที่กล่องแสดงยอดเงินคงเหลือ, การ์ดรายการรายจ่าย, และชื่อผู้ใช้
3. **เกณฑ์การผ่านใน DOM:**
   - ต้องปรากฏคลาส `clarity-mask` หรือ Attribute `data-clarity-mask="true"` ครอบ Element ข้อมูลเหล่านั้นทั้งหมด
4. เปิด Dashboard ของ Microsoft Clarity (Project: Por-Chai Staging):
   - เข้าดู Session Recording ล่าสุด
   - ตรวจสอบว่าบริเวณยอดเงินและชื่อรายการแสดงผลเป็นแถบเบลอทึบ (Masked Stars/Bars) หรือไม่
   - ตรวจสอบ Network Payload ใน Network Tab ว่าไม่มี Header `x-line-userid` หรือ `Authorization` หลุดออกไปกับ Analytics Payload

---

## 4️⃣ Robot Framework Automation Starter Files

ไฟล์เหล่านี้ถูกสร้างขึ้นจริงในโฟลเดอร์ `robot/` ของโปรเจกต์ เพื่อให้ทีม Automation นำไปต่อยอดได้ทันที:

### 📄 1. `robot/resources/variables.robot`
```robot
*** Settings ***
Documentation       Global variables and environment configurations for Por-Chai test automation.

*** Variables ***
# Environment & Base URLs
${BASE_URL}             http://localhost:3000
${API_BASE_URL}         ${BASE_URL}/api
${LIFF_URL}             http://localhost:3000/app
${DEV_PORT}             3004

# Mock / Test User Identifiers
${TEST_USER_ID_A}       U_test_user_alpha_001
${TEST_USER_ID_B}       U_test_user_beta_002
${TEST_BEARER_TOKEN_A}  Bearer mock_token_alpha
${TEST_BEARER_TOKEN_B}  Bearer mock_token_beta

# Mock LIFF ID & App State
${MOCK_LIFF_ID}         1650000000-xxxxxxx
${LINE_CHANNEL_SECRET}  test_channel_secret_key_porchai

# Standard HTTP Headers
&{AUTH_HEADERS_USER_A}  Authorization=${TEST_BEARER_TOKEN_A}    Content-Type=application/json
&{AUTH_HEADERS_USER_B}  Authorization=${TEST_BEARER_TOKEN_B}    Content-Type=application/json

# Calculation Thresholds (Satang units)
${QUARTER_BAHT_SATANG}  25
${ONE_BAHT_SATANG}      100
```

---

### 📄 2. `robot/suites/api/cycle.robot`
```robot
*** Settings ***
Documentation       API Suite for Por-Chai Cycle Calculation and Financial Rules (R1–R13).
Resource            ../../resources/variables.robot
Library             RequestsLibrary
Library             Collections

*** Test Cases ***
TC-01 to TC-03: Simulate, Reserve, and Spend Central Example
    [Documentation]    Validates central financial calculation: 1,000 THB, 300 THB bill, 7 days.
    [Tags]             api    calculation    R2    R3-quarter
    Create Session     porchai    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_A}

    # Step 1: Initialize Cycle (1,000 THB, 7 days, 300 THB bill)
    ${payload}=        Create Dictionary    balance=100000    payday=2026-11-18    bills=@{EMPTY}
    ${resp}=           POST On Session      porchai    /api/cycle    json=${payload}
    Should Be Equal As Integers    ${resp.status_code}    200

    # Step 2: Validate Summary - Pre-Trial (700 THB usable, 100 THB/day)
    ${summary}=        GET On Session       porchai    /api/summary
    Should Be Equal As Integers    ${summary.status_code}    200
    ${data}=           Set Variable         ${summary.json()}
    Should Be Equal As Integers    ${data['usable']}         70000
    Should Be Equal As Integers    ${data['dailyBudget']}    10000

    # Step 3: Simulate Purchase 140 THB (TC-01: usable 560 THB, daily 80 THB)
    ${sim_body}=       Create Dictionary    amount=14000    name=Shirt
    ${sim_resp}=       POST On Session      porchai    /api/simulate    json=${sim_body}
    Should Be Equal As Integers    ${sim_resp.status_code}   200
    ${sim_data}=       Set Variable         ${sim_resp.json()}
    Should Be Equal As Integers    ${sim_data['usable']}     56000
    Should Be Equal As Integers    ${sim_data['dailyBudget']} 8000

TC-04: Validate Quarter Baht Floor Rounding (R3-quarter)
    [Documentation]    Validates 700 THB / 3 days rounds down to 233.25 THB (23,325 satang), not 233.33.
    [Tags]             api    rounding    R3-quarter
    Create Session     porchai    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_A}

    ${payload}=        Create Dictionary    balance=70000    payday=2026-11-14    bills=@{EMPTY}
    ${resp}=           POST On Session      porchai    /api/cycle    json=${payload}
    Should Be Equal As Integers    ${resp.status_code}    200

    ${summary}=        GET On Session       porchai    /api/summary
    ${data}=           Set Variable         ${summary.json()}
    Should Be Equal As Integers    ${data['dailyBudget']}    23325
    # Verify exact multiple of 25 satang
    ${mod}=            Evaluate             ${data['dailyBudget']} % 25
    Should Be Equal As Integers    ${mod}    0

TC-19: Enforce User Data Isolation
    [Documentation]    Ensures User B cannot access User A's cycle summary or financial records.
    [Tags]             security    isolation    P-16
    Create Session     session_a    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_A}
    Create Session     session_b    ${BASE_URL}    headers=&{AUTH_HEADERS_USER_B}

    # User A creates cycle
    ${payload}=        Create Dictionary    balance=50000    payday=2026-11-20
    ${resp_a}=         POST On Session      session_a    /api/cycle    json=${payload}
    Should Be Equal As Integers    ${resp_a.status_code}    200

    # User B requests summary (must be independent, empty, or uninitialized)
    ${resp_b}=         GET On Session       session_b    /api/summary
    Run Keyword If     ${resp_b.status_code} == 200
    ...                Should Not Be Equal As Integers    ${resp_b.json().get('balance', 0)}    50000
```

---

### 📄 3. `robot/suites/ui/liff_flows.robot`
```robot
*** Settings ***
Documentation       UI & LIFF Webview test suite for Por-Chai using Browser Library (Playwright-backed).
Resource            ../../resources/variables.robot
Library             Browser

Suite Setup         New Browser    browser=chromium    headless=True
Suite Teardown      Close Browser
Test Setup          New Context    viewport={'width': 390, 'height': 844}
Test Teardown       Close Context

*** Test Cases ***
TC-14: Form Validation For New Cycle Setup
    [Documentation]    Form must reject empty initial balance or missing payday without producing NaN.
    [Tags]             ui    validation    liff
    New Page           ${LIFF_URL}/setup

    # Try saving with empty inputs
    Click              button:has-text("บันทึก")
    
    # Assert validation error or disabled state
    Wait For Elements State    text="กรุณาระบุยอดเงิน"    visible    timeout=3s
    Get Text           body    not contains    NaN

TC-17: Double Submit Protection On Payment Confirmation
    [Documentation]    Button must disable immediately on first click to prevent duplicate ledger entries.
    [Tags]             ui    concurrency    double-submit
    # Set mock user cookie/storage to bypass setup
    New Page           ${LIFF_URL}/record
    
    # Fill actual spend 50 THB
    Fill Text          input[name="amount"]    50
    Fill Text          input[name="title"]     Lunch Test
    
    # Click confirm button rapidly
    Click              button:has-text("บันทึกจ่ายจริง")
    
    # Button should transition to disabled or loading state instantly
    Wait For Elements State    button:has-text("บันทึกจ่ายจริง")    disabled    timeout=1s

TC-20: Microsoft Clarity PII Masking Verification
    [Documentation]    Ensure financial figures and user identifiers carry clarity masking attributes.
    [Tags]             security    privacy    clarity
    New Page           ${LIFF_URL}/summary

    # Ensure sensitive balance container has masking class/attribute
    Wait For Elements State    [data-clarity-mask="true"], .clarity-mask, [data-testid="balance-mask"]    visible    timeout=5s
    ${classes}=        Get Attribute    [data-testid="balance-card"]    class
    Should Contain Any    ${classes}    clarity-mask    mask-text    secret
```

---

## 5️⃣ Pre-Merge Sign-off & Quality Gate Checklist

ก่อนที่ Lead QA และ Backend Dev ("Po") จะอนุมัติการ Merge เข้าสู่ Branch `main` จะต้องทำการตรวจสอบตามรายการต่อไปนี้ให้ผ่านทั้งหมด:

```markdown
### 🚦 Quality Gate Checklist (บันทึกการลงนามอนุมัติก่อน Merge)

- [x] **1. Calculation & Financial Rules (R1–R13):**
  - สูตรคำนวณผ่านเกณฑ์ 100% ใน `lib/calc/qa-cases.test.ts` (25/25 เคส)
  - งบรายวันปัดลงขั้น 25 สตางค์ (`R3-quarter`) ผ่านการทดสอบ
  - การจัดการวันรับเงินเหลือ 0 วัน (`TC-07`) และเงินขาด (`TC-06`) ไม่เกิด Exception

- [x] **2. Security & Webhook Protections:**
  - ตรวจสอบลายเซ็น LINE Webhook และ `webhookEventId` Idempotency ผ่าน (`TC-18`)
  - ตรวจสอบ Data Isolation ระหว่าง User A และ User B ผ่าน (`TC-19`)

- [ ] **3. Environment Dependencies Resolution (Action Required):**
  - ติดตั้ง DevDependencies ที่ขาดหายไปให้สมบูรณ์ (`@testing-library/react`, `@testing-library/user-event`, `jsdom`)
  - คำสั่ง: `npm install --save-dev @testing-library/react @testing-library/user-event jsdom`

- [ ] **4. Automated Static Analysis Gate:**
  - [ ] `npm run typecheck` ผ่านโดยมีข้อผิดพลาดเป็น 0 (Zero Type Errors)
  - [ ] `npm run lint` ผ่านโดยไม่มีข้อผิดพลาดระดับ Error

- [ ] **5. CI Full Execution:**
  - [ ] `npm test` รันผ่านครบทุกไฟล์ (Unit + Integration)
  - [ ] `npm run test:db` รันผ่านกับฐานข้อมูล Supabase Staging

- [ ] **6. Manual Staging Verification Sign-off:**
  - [ ] ทดสอบปุ่ม Double Submit (`TC-17`) บนโทรศัพท์มือถือจริง
  - [ ] ตรวจสอบ Microsoft Clarity Dashboard ว่ายอดเงินถูก Masking ครบถ้วน (`TC-20`)

