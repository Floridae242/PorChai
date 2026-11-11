# PorChai (พอใช้)

ผู้ช่วยการเงินสำหรับนักศึกษาบน LINE MINI App และ LINE OA
Next.js + TypeScript บน Vercel · Supabase Postgres · Vitest

## เริ่มรันบนเครื่อง

```bash
npm install
cp .env.example .env.local   # แล้วใส่ค่าจริง ห้าม commit ไฟล์นี้
npm run dev                  # http://localhost:3000
npm test                     # รันเทสต์ครั้งเดียว
npm run test:watch           # รันเทสต์ทุกครั้งที่แก้ไฟล์
```

`npm test` ไม่แตะฐานข้อมูล (ข้ามไฟล์ `*.db.test.ts`) เปิดฐานข้อมูลหรือไม่ก็ผ่าน

## ฐานข้อมูลบนเครื่อง (Supabase)

ต้องมี Docker Desktop (เปิดอยู่) และ [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
supabase start      # ครั้งแรกโหลด image หลายนาที
supabase db reset   # สร้างตารางใหม่จาก supabase/migrations/ (ล้างข้อมูลบนเครื่อง)
supabase stop
```

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
   - LINE Developers: Messaging API channel (ผูกกับ LINE OA) และ MINI App channel (ถ้าสร้าง MINI App ในไทยไม่ได้ ให้ใช้ LIFF/LINE Login แทน)
     **ต้องสร้างสองช่องทางนี้ใต้ Provider เดียวกัน** เพราะ LINE user ID แยกตาม Provider ถ้าอยู่คนละ Provider `source.userId` ใน webhook กับ `sub` ใน ID token จะไม่ตรงกัน และนักศึกษา 1 คนจะกลายเป็น 2 users
   - Supabase: โปรเจกต์จริง 1 โปรเจกต์
   - Vercel: import repo นี้
2. ใส่ env ใน Vercel (Project Settings > Environment Variables) ห้ามใส่ในไฟล์ใน repo ชื่อตัวแปรตาม `.env.example`:
   `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `NEXT_PUBLIC_LIFF_ID`, `LINE_MINIAPP_CHANNEL_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (`SUPABASE_ANON_KEY` ใช้เฉพาะเทสต์ ไม่ต้องใส่)
3. สร้างตารางบนโปรเจกต์จริง: `supabase link --project-ref <ref>` แล้ว `supabase db push`
4. deploy preview บน Vercel (push branch) แล้วจดโดเมน
   คำเตือน: preview ของ Vercel เปิด Vercel Authentication ไว้เป็นค่าเริ่มต้น ทำให้ LINE กด Verify webhook แล้วได้ 401 ต้องปิด Deployment Protection ของ preview นั้น หรือใช้โดเมน production แทน
5. ตั้ง webhook ใน LINE Developers (Messaging API channel): Webhook URL = `https://<domain>/api/line/webhook` เปิด Use webhook แล้วกด **Verify** ต้องได้ Success
6. เปิด MINI App บนมือถือ เรียก `GET /api/me` ด้วย ID token จริง ต้องได้ `userId` และมีแถวใหม่ในตาราง `users`
   (ID token จริงได้จาก `liff.getIDToken()` ในฝั่ง MINI App เท่านั้น ข้อนี้จึงต้องรอให้มีหน้าจอเล็กๆ ที่เรียกฟังก์ชันนี้ก่อน)
7. ส่งข้อความหา LINE OA ในตาราง `line_events` ต้องมีแถวเพิ่ม 1 แถว

## โฟลเดอร์และเจ้าของ

| โฟลเดอร์ | เนื้อหา | ดูแลหลัก |
|---|---|---|
| `app/` (ยกเว้น `app/api/`) | หน้าจอ MINI App | Frontend |
| `app/api/` | ทางเข้าของระบบหลังบ้าน เช่น `app/api/line/webhook` | Backend |
| `lib/calc/` | สูตรคำนวณเงิน ใช้ร่วมกันทั้งแชตและหน้าจอ | Backend |
| `lib/db/` | ติดต่อฐานข้อมูล Supabase | Backend |
| `lib/line/` | ตรวจลายเซ็น ตรวจ ID token ส่งข้อความ LINE | Backend |

หน้าจอเรียกข้อมูลผ่าน `app/api/` เท่านั้น ไม่ต่อฐานข้อมูลตรง

## กฎของ repo

- repo นี้เป็น public: ห้าม commit `.env.local` หรือ key ใดๆ (`.gitignore` กันไว้แล้ว ยกเว้น `.env.example` ที่มีแค่ชื่อตัวแปร)
- แตก branch จาก `main` แล้ว merge กลับบ่อยๆ อย่าแยกกันหลายวัน
- สูตรเงินทุกตัวใน `lib/calc/` ต้องมีเทสต์
- วันที่และ "วันนี้" ใช้เวลาไทย (`Asia/Bangkok`) เสมอ
