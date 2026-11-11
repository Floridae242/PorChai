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
