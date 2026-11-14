# PorChai (พอใช้)

ผู้ช่วยการเงินสำหรับนักศึกษาบน LINE OA และหน้าจอ LIFF
LINE OA + Messaging API · LIFF · Next.js + TypeScript · Supabase PostgreSQL · AI API · Vercel · Microsoft Clarity · ทดสอบด้วย Vitest

## เริ่มรันบนเครื่อง

```bash
npm install
cp .env.example .env.local   # แล้วใส่ค่าจริง ห้าม commit ไฟล์นี้
npm run dev                  # http://localhost:3000
npm test                     # รันเทสต์ครั้งเดียว
npm run test:watch           # รันเทสต์ทุกครั้งที่แก้ไฟล์
```

`npm test` ไม่แตะฐานข้อมูล (ข้ามไฟล์ `*.db.test.ts`) เปิดฐานข้อมูลหรือไม่ก็ผ่าน

MINI App หลักอยู่ที่ `/app` บน `https://porchai.vercel.app` มีหน้าแผน จดรายจ่าย ลองก่อนจ่าย และตั้งค่า ส่วน `/miniapp` เป็นหน้าแนะนำแบบการ์ดพร้อมมาสคอต. โหมดพัฒนาใช้ mock เป็นค่าเริ่มต้น ส่วน production ใช้ live เสมอ.

ตั้ง `NEXT_PUBLIC_LIFF_ID` และ channel audience ตาม `.env.example`. LINE Developers Developing Endpoint ใช้ `https://porchai.vercel.app/app`; ปุ่ม OA ใช้ permanent links ที่สัมพันธ์กับ endpoint นี้. ล็อกอินใน browser กลับไปยัง path ที่ตรวจแล้วภายใต้ `/app` โดยตรง และ API ตรวจ ID token ฝั่งเซิร์ฟเวอร์. ดู [การ์ด OA และ LIFF](docs/LINE-CARDS.md) สำหรับรูปมาสคอตบน Vercel และวิธีทดสอบ.

## ฐานข้อมูลบนเครื่อง (Supabase)

ต้องมี Docker Desktop (เปิดอยู่) และ [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
supabase start      # ครั้งแรกโหลด image หลายนาที
supabase db reset   # สร้างตารางใหม่จาก supabase/migrations/ + ใส่ข้อมูลทดสอบ supabase/seed.sql (ล้างข้อมูลบนเครื่อง)
supabase stop
```

ข้อมูลทดสอบ (`supabase/seed.sql`) มีผู้ใช้เดโม 3 คนตามตัวเลข Figma: `U_demo_try` (ลอง), `U_demo_plan` (เลือกแผน), `U_demo_paid` (จ่ายจริง) · ใส่เฉพาะบนเครื่อง `supabase db push` ไม่ส่งขึ้น cloud · วันที่อิงวันที่ reset ถ้าเทสต์ข้ามวันให้ `supabase db reset` ใหม่ก่อน

เทสต์ฐานข้อมูล (`npm run test:db`) อ่านค่าจาก `.env.test.local` (ถูก `.gitignore` กันไว้ ห้าม commit)
สร้างไฟล์นี้เองจากผล `supabase status -o env` ตามนี้:

| ตัวแปรใน `.env.test.local` | ค่าจาก `supabase status -o env` |
|---|---|
| `SUPABASE_URL` | `API_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` |
| `SUPABASE_ANON_KEY` | `ANON_KEY` (ใช้ตรวจ RLS ในเทสต์เท่านั้น) |

ทุกตารางเปิด RLS และไม่มี policy: มีแต่ service role (ฝั่ง `app/api/`) ที่อ่าน/เขียนได้

## เส้น API ที่มีแล้ว

| เส้น | หน้าที่ |
|---|---|
| `POST /api/line/webhook` | รับ event จาก LINE OA: ตรวจลายเซ็น กันซ้ำด้วย `webhookEventId` แล้วตอบ 200 เร็วๆ |
| `GET /api/me` | รับ `Authorization: Bearer <ID token>` ตรวจกับ LINE แล้วตอบ `{ userId, hasActiveCycle }` (ไม่มี token หรือ token ผิด = 401) |

ทุกเส้นที่ต้องล็อกอินใช้ `userId` จาก `requireUser()` เท่านั้น ห้ามรับ `userId` จากคำขอ

## ตั้งค่าของจริง (ทำเองด้วยบัญชีของตัวเอง)

ชั้น 0 ถือว่าเสร็จเมื่อข้อ 5–7 ผ่านบนมือถือจริง ไม่ใช่แค่เทสต์เขียว

1. สร้างบัญชีและช่องทางที่ต้องใช้
   - LINE Developers: Messaging API channel (ผูกกับ LINE OA) และ LINE Login channel ที่มี LIFF app (Endpoint URL = โดเมน Vercel, scope `openid` และ `profile`)
     **ต้องสร้างสองช่องทางนี้ใต้ Provider เดียวกัน** เพราะ LINE user ID แยกตาม Provider ถ้าอยู่คนละ Provider `source.userId` ใน webhook กับ `sub` ใน ID token จะไม่ตรงกัน และนักศึกษา 1 คนจะกลายเป็น 2 users
   - Supabase: โปรเจกต์จริง 1 โปรเจกต์
   - Vercel: import repo นี้
2. ใส่ env ใน Vercel (Project Settings > Environment Variables) ห้ามใส่ในไฟล์ใน repo ชื่อตัวแปรตาม `.env.example`:
   `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `NEXT_PUBLIC_LIFF_ID`, `LINE_LOGIN_CHANNEL_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (`SUPABASE_ANON_KEY` ใช้เฉพาะเทสต์ ไม่ต้องใส่)
   Microsoft Clarity (ไม่บังคับ): `NEXT_PUBLIC_CLARITY_PROJECT_ID` ค่าว่าง = ปิด **ห้ามตั้งใน Production จนกว่ามินตราเซ็นผ่านการตรวจปิดบังข้อมูล** (ดูหัวข้อ Microsoft Clarity)
   AI (การ์ด 15): `GEMINI_API_KEY` (คีย์จาก Google AI Studio แผนฟรี พอถือ) · `GEMINI_MODEL` ไม่ใส่ก็ได้ (ค่าเริ่มต้น `gemini-3.5-flash-lite`) · ไม่มีคีย์ = ระบบตอบด้วยข้อความแม่แบบ ไม่พัง
3. สร้างตารางบนโปรเจกต์จริง: `supabase link --project-ref <ref>` แล้ว `supabase db push`
4. deploy preview บน Vercel (push branch) แล้วจดโดเมน
   คำเตือน: preview ของ Vercel เปิด Vercel Authentication ไว้เป็นค่าเริ่มต้น ทำให้ LINE กด Verify webhook แล้วได้ 401 ต้องปิด Deployment Protection ของ preview นั้น หรือใช้โดเมน production แทน
5. ตั้ง webhook ใน LINE Developers (Messaging API channel): Webhook URL = `https://<domain>/api/line/webhook` เปิด Use webhook แล้วกด **Verify** ต้องได้ Success
6. เปิดหน้า LIFF บนมือถือ เรียก `GET /api/me` ด้วย ID token จริง ต้องได้ `userId` และมีแถวใหม่ในตาราง `users`
   (ID token จริงได้จาก `liff.getIDToken()` ในหน้า LIFF เท่านั้น ข้อนี้จึงต้องรอให้มีหน้าจอเล็กๆ ที่เรียกฟังก์ชันนี้ก่อน)
7. ส่งข้อความหา LINE OA ในตาราง `line_events` ต้องมีแถวเพิ่ม 1 แถว

## โฟลเดอร์และเจ้าของ

| โฟลเดอร์ | เนื้อหา | ดูแลหลัก |
|---|---|---|
| `app/` (ยกเว้น `app/api/`) | หน้าจอ LIFF | Frontend |
| `app/api/` | ทางเข้าของระบบหลังบ้าน เช่น `app/api/line/webhook` | Backend |
| `lib/calc/` | สูตรคำนวณเงิน ใช้ร่วมกันทั้งแชตและหน้าจอ | Backend |
| `lib/db/` | ติดต่อฐานข้อมูล Supabase | Backend |
| `lib/line/` | ตรวจลายเซ็น ตรวจ ID token ส่งข้อความ LINE | Backend |

หน้าจอเรียกข้อมูลผ่าน `app/api/` เท่านั้น ไม่ต่อฐานข้อมูลตรง

## Microsoft Clarity (วัดการใช้งานหน้า MINI App)

- โหลดเฉพาะหน้า `/app` เท่านั้น (ไม่โหลดที่ `/`, `/miniapp`, `/business`, `/shop`, หน้ายินยอม) และโหลดหลังผู้ใช้กดยอมรับ + LIFF พร้อมแล้ว โค้ดอยู่ที่ `lib/clarity/` ที่เดียว ห้ามเรียก `clarity(` ที่อื่น ห้ามส่ง identify/tag/event (มีเทสต์กันไว้)
- เปิดใช้โดยตั้ง `NEXT_PUBLIC_CLARITY_PROJECT_ID` ค่านี้ฝังตอน build ต้อง deploy ใหม่เมื่อเปลี่ยน ค่าว่าง = ปิด
- ต้องตั้ง **Masking เป็น Strict** ที่หน้า Settings > Masking ของโปรเจกต์ Clarity เอง (ตั้งจากโค้ดไม่ได้ มีผลกับการบันทึกใหม่ อาจใช้เวลาถึง 1 ชม.) ป้าย `data-clarity-mask="true"` ในโค้ดเป็นชั้นที่สอง
- URL ถูกบันทึกและปิดบังไม่ได้: ห้ามใส่ยอด ชื่อ หรือข้อความส่วนตัวใน URL (ลิงก์โปรส่งแค่ `?promo=<id>` วันเงินเข้าใหม่เก็บในหน่วยความจำ ไม่ใส่ `?payday=`) มีเทสต์ตรวจ
- ทดสอบในเครื่อง: ใส่ Project ID ใน `.env.local` รัน `npm run dev` แล้วเปิด `/app/consent?scenario=fresh` กดยอมรับ เดินหน้าด้วยข้อมูลสมมติ ให้ผู้ตรวจดูภาพบันทึกว่าข้อความ ตัวเลข และช่องกรอกเป็นบล็อกทึบ
- ปิดฉุกเฉิน: ลบ `NEXT_PUBLIC_CLARITY_PROJECT_ID` จาก Vercel แล้ว deploy ใหม่
- เอกสาร Clarity ระบุว่าไม่ควรใช้กับผู้ใช้อายุต่ำกว่า 18 ปี ต้องให้ทีมหรืออาจารย์ตัดสินก่อนเปิดกับผู้ใช้จริง

## กฎของ repo

- repo นี้เป็น public: ห้าม commit `.env.local` หรือ key ใดๆ (`.gitignore` กันไว้แล้ว ยกเว้น `.env.example` ที่มีแค่ชื่อตัวแปร)
- แตก branch จาก `main` แล้ว merge กลับบ่อยๆ อย่าแยกกันหลายวัน
- สูตรเงินทุกตัวใน `lib/calc/` ต้องมีเทสต์
- วันที่และ "วันนี้" ใช้เวลาไทย (`Asia/Bangkok`) เสมอ

## ส่วนธุรกิจของเติ้ล (งาน 32 / 60)

เปิด `/business/demo` เพื่อดูข้อเสนอแคมเปญและคำนวณรายงานด้วยข้อมูลสมมติ.
แยกยอดดู/รับ/ใช้ คิดค่าบริการเฉพาะการใช้สำเร็จ และไม่สรุปกำไรหากยังไม่มีต้นทุน.
หน้านี้ไม่มีข้อมูลผู้ใช้จริงหรือการออก/ใช้คูปองจริง.
ดูขอบเขต สัญญาข้อมูล และงานส่งต่อทีมใน [docs/TLE-HANDOFF.md](docs/TLE-HANDOFF.md).

## ทดสอบ LINE ใน Developing

หน้า `/` เป็นหน้าแนะนำ ส่วน `/miniapp` เริ่ม LIFF และส่ง ID token ไป `POST /api/line/verify`.
เซิร์ฟเวอร์ส่ง token ไป LINE พร้อม `LINE_MINIAPP_CHANNEL_ID` และตรวจ issuer,
audience, expiry และ subject ก่อนคืนชื่อที่ยืนยันแล้ว ไม่เชื่อ profile ที่ client ส่งมา.
API ข้อมูลส่วนตัวตรวจ ID token ทุกครั้งผ่าน `requireUser()` และใช้เฉพาะ user ID ที่เซิร์ฟเวอร์ยืนยัน.

`POST /api/line/webhook` ตรวจ `x-line-signature` ด้วย HMAC-SHA256 บน raw bytes
ก่อน parse JSON. ลายเซ็นผิด/หายได้ 401, JSON หรือ events ผิดรูปแบบได้ 400,
ไม่ตั้ง secret ได้ 503 และ `events: []` ที่เซ็นถูกได้ 200.
OA แสดง Flex carousel เมื่อเพิ่มเพื่อนหรือส่งคำสั่งเมนู และรับรายจ่ายทีละรายการผ่านแชต. หลังบันทึกสำเร็จแสดงใบเสร็จพร้อมลิงก์ดู/แก้ไขรายการใน LIFF. การรับ event ซ้ำใช้ Supabase และ financial idempotency key; เมื่อประมวลผลไม่สำเร็จคืน marker และตอบ non-2xx เพื่อให้ LINE ส่งซ้ำ. หากบันทึกแล้วแต่ส่งคำตอบล้มเหลวจะไม่บันทึกรายจ่ายซ้ำ. ดู [คู่มือ LINE OA](docs/LINE-OA-DEVELOPING.md).

### Environment

คัดลอก `.env.example` เป็น `.env.local` แล้วตั้ง:

- `NEXT_PUBLIC_LIFF_ID=2012545254-6025ZG1r`
- `LINE_MINIAPP_CHANNEL_ID=2012545254` สำหรับตรวจ ID token (ห้ามใช้ Messaging API Channel ID แทน)
- `LINE_CHANNEL_SECRET` จาก Basic settings ของ Messaging API channel **2012545691**
- `LINE_CHANNEL_ACCESS_TOKEN` จาก Messaging API channel เดียวกัน สำหรับตอบข้อความ Developing

Secret และ Access Token อยู่ฝั่ง server เท่านั้น ห้ามตั้งชื่อขึ้นต้น `NEXT_PUBLIC_`.
ไม่ต้องตั้ง Supabase เพื่อทดสอบการเชื่อมต่อรอบนี้. Restart dev server หลังแก้ env;
LIFF ID เป็นค่า build-time จึงต้อง build ใหม่เมื่อเปลี่ยนใน production.

หลังรวม Backend: `LINE_LOGIN_CHANNEL_ID` คือ audience ที่ `requireUser()` ใช้กับ API ข้อมูลส่วนตัว ให้ตั้งตรงกับ channel ที่ออก ID token ของหน้าจอที่ใช้อยู่ (Developing MINI App ชุดนี้คือ `2012545254`). ห้ามใช้ Messaging API channel แทน. ถ้าเลือก LINE Login/LIFF อีก channel ต้องเปลี่ยนทั้ง LIFF ID และ audience ให้ตรงกัน.

Webhook จะบันทึก event ID และเชื่อมตัวตนผ่าน Backend เมื่อกำหนด Supabase URL และ service role key ครบ. ถ้าทั้งสองค่าว่าง ยังทดสอบ OA/LIFF โดยไม่ต่อ DB ได้; ถ้าขาดค่าใดค่าหนึ่งตอบ 503. การกัน event ซ้ำของ DB ไม่ขวางการ retry ส่ง OA reply ที่ครั้งแรกส่งไม่สำเร็จ.

### LINE Developers Console (ทำเมื่อมี HTTPS endpoint พร้อมแล้ว)

สถานะการตั้งค่าและผลตรวจจริงรอบล่าสุดอยู่ใน [LINE live setup](docs/LINE-LIVE-SETUP.md). ปัจจุบันใช้ HTTPS tunnel ชั่วคราว ไม่ใช่ hosting ถาวร. ตรวจซ้ำได้ด้วย `npm run line:check -- --url https://<dev-host> --live` โดยไม่แสดง credential.

1. รัน `npm run dev` บนเครื่อง. LINE ต้องเข้าถึง URL HTTPS สาธารณะได้;
   localhost อย่างเดียวใช้ทดสอบจาก LINE ไม่ได้. ใช้ dev tunnel ที่ทีมอนุมัติหรือ
   dev hosting ที่มีอยู่และรันโค้ดชุดนี้. ถ้าใช้ tunnel เครื่องและ process ต้องเปิดอยู่ตลอดการทดสอบ.
2. เปิด MINI App channel **2012545254** → Web app settings → **Developing**.
   ตั้ง Endpoint URL เป็น `https://<dev-host>/app` และตรวจ LIFF ID ว่าตรงกับ
   `2012545254-6025ZG1r`. แอปใช้ `openid` และ `profile` เพื่อรับ ID token และชื่อ
   (MINI App มีค่า scope ตามที่แพลตฟอร์มกำหนด ไม่ได้ปรับแยกแต่ละ internal channel แบบ LINE Login LIFF).
   บัญชีทดสอบต้องมีสิทธิ์ใน channel สำหรับ Developing.
   ถ้า LINE แจ้ง `User need to have developer role` ให้เพิ่มบัญชี LINE ที่ใช้ทดสอบเป็น Tester และยอมรับคำเชิญ; บัญชีนี้อาจคนละบัญชีกับที่ล็อกอิน Console.
3. เปิด Developing MINI App URL/QR จาก Console บน LINE ด้วยบัญชีทดสอบ.
   ยอมรับสิทธิ์แล้วควรเห็น “เชื่อมต่อ LINE สำเร็จ”. ใน external browser จะมีปุ่ม
   “เข้าสู่ระบบ LINE”. หากไม่พบ ID token ให้ตรวจ `openid` และ channel ที่เลือก.
4. เปิด Messaging API channel **2012545691** → Messaging API → Webhook settings.
   ตั้ง Webhook URL เป็น `https://<dev-host>/api/line/webhook` แล้วกด **Verify**.
   ควรเห็น Success: LINE ส่ง body ที่มี `events: []` พร้อมลายเซ็นและเซิร์ฟเวอร์ตอบ 200.
   เปิด Use webhook เมื่อต้องการรับ events จากการเพิ่มเพื่อน/ข้อความจริง.
5. เพิ่มเพื่อน OA และส่งข้อความทดสอบ เมื่อ env พร้อมควรได้ข้อความต้อนรับ/ช่วยเหลือและปุ่มเปิด MINI App. ทดสอบตาม [คู่มือ LINE OA](docs/LINE-OA-DEVELOPING.md). ถ้าไม่ได้รับข้อความ ตรวจการตั้งค่าข้อความต้อนรับ/ตอบกลับอัตโนมัติของ OA ที่อาจซ้ำกับ webhook.
   หลีกเลี่ยง log raw body, ID token, secret หรือ access token.

ถ้า Verify ไม่ผ่าน: 401 ให้ตรวจ secret ของ Messaging API channel; 503 ให้ตรวจ env
และ restart; 404 ให้ตรวจ URL/path; connection error ให้ตรวจ HTTPS และการเข้าถึง dev host.
ชื่อผู้ใช้ในหน้าแอปมาจากผลตรวจ token ฝั่ง server; ไม่แสดง token บนหน้าจอ.

### ตรวจบนเครื่อง

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

เทสต์ใช้ secret/token จำลอง และ mock การเรียก LINE ทั้งหมด ไม่ส่งข้อมูลจริงออกไป.
ผลเทสต์บนเครื่องไม่ยืนยันการตั้งค่า Console หรือการล็อกอินบน LINE จริง.
ผลตรวจจริงรอบล่าสุดแยกบันทึกไว้ใน [LINE live setup](docs/LINE-LIVE-SETUP.md): Console Verify ผ่าน, ID token จริงตรวจผ่าน และผู้ใช้ยืนยันว่าได้รับ OA reply และเปิด MINI App บนมือถือเห็นชื่อบัญชีจริงแล้ว.

เอกสารอ้างอิง:
[LIFF user data](https://developers.line.biz/en/docs/liff/using-user-profile/),
[ID token verification](https://developers.line.biz/en/reference/line-login/#verify-id-token),
[Webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/),
[MINI App development](https://developers.line.biz/en/docs/line-mini-app/develop/develop-overview/).

## หน้าแนะนำและ MINI App

อ้างอิงดีไซน์เพิ่มเติมจาก Figma หน้า Conversation; เฟรมที่ตรวจและส่วนที่นำมาใช้ระบุใน [Design references](docs/DESIGN-REFERENCES.md).

หน้าแนะนำมี desktop scroll showcase 6 ฉาก, ตัวเลือกบนมือถือ, การ์ดเลื่อนแนวนอน, สลับข้อมูลนักศึกษา/ร้านค้า, สถานการณ์สมมติ, FAQ และปุ่มกลับด้านบน. รองรับ reduced motion โดยปิด animation และช่วง pinned. `/miniapp` มีหน้าแนะนำแบบการ์ด มาสคอตเคลื่อนไหว สถานะ LINE และปุ่มเปิดหน้าการเงินจริงใน `/app`.

`/` คือหน้าแนะนำ PorChai พร้อมแชตตัวอย่างแบบสลับได้และ FAQ. `/miniapp` คือหน้าทดสอบที่ตรวจตัวตน LINE; `/business/demo` คือรายงานธุรกิจสมมติ. ตั้ง Console Endpoint URL เป็น `https://<dev-host>/app` เพื่อให้ LIFF เริ่มและรับ redirect ภายใต้ `/app` รวมถึงการเปิด MINI App URL ที่ไม่มีพารามิเตอร์. หากเคยตั้งเป็น root ให้เปลี่ยนก่อนทดสอบรอบนี้. ยังไม่ใช่การรับรอง MINI App หรือหลักฐานทดสอบ LINE จริง.
