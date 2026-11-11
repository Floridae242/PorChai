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
