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

## ส่วนธุรกิจของเติ้ล (งาน 32 / 60)

เปิด `/business/demo` เพื่อดูข้อเสนอแคมเปญและคำนวณรายงานด้วยข้อมูลสมมติ.
แยกยอดดู/รับ/ใช้ คิดค่าบริการเฉพาะการใช้สำเร็จ และไม่สรุปกำไรหากยังไม่มีต้นทุน.
หน้านี้ไม่มีข้อมูลผู้ใช้จริงหรือการออก/ใช้คูปองจริง.
ดูขอบเขต สัญญาข้อมูล และงานส่งต่อทีมใน [docs/TLE-HANDOFF.md](docs/TLE-HANDOFF.md).

## ทดสอบ LINE ใน Developing

หน้า `/` เป็นหน้าแนะนำ ส่วน `/miniapp` เริ่ม LIFF และส่ง ID token ไป `POST /api/line/verify`.
เซิร์ฟเวอร์ส่ง token ไป LINE พร้อม `LINE_MINIAPP_CHANNEL_ID` และตรวจ issuer,
audience, expiry และ subject ก่อนคืนชื่อที่ยืนยันแล้ว ไม่เชื่อ profile ที่ client ส่งมา.
ยังไม่สร้าง session: API ข้อมูลส่วนตัวในอนาคตต้องตรวจ token หรือ session ของตัวเองทุกครั้ง.

`POST /api/line/webhook` ตรวจ `x-line-signature` ด้วย HMAC-SHA256 บน raw bytes
ก่อน parse JSON. ลายเซ็นผิด/หายได้ 401, JSON หรือ events ผิดรูปแบบได้ 400,
ไม่ตั้ง secret ได้ 503 และ `events: []` ที่เซ็นถูกได้ 200.
รุ่น Developing ตอบข้อความต้อนรับเมื่อเพิ่มเพื่อนและข้อความช่วยเหลือเมื่อได้รับข้อความตัวอักษร พร้อมปุ่มเปิด MINI App. ยังไม่บันทึกรายจ่าย. เมื่อส่งล้มเหลว redelivery ลองส่งใหม่ได้ภายในข้อจำกัด reply token ของ LINE; มี cache คำตอบที่สำเร็จใน process เพื่อลดการตอบซ้ำ แต่ไม่มีคิวถาวรหรือ cache ร่วมข้าม instance. รายละเอียดใน [คู่มือ LINE OA](docs/LINE-OA-DEVELOPING.md).

### Environment

คัดลอก `.env.example` เป็น `.env.local` แล้วตั้ง:

- `NEXT_PUBLIC_LIFF_ID=2012545254-6025ZG1r`
- `LINE_MINIAPP_CHANNEL_ID=2012545254` สำหรับตรวจ ID token (ห้ามใช้ Messaging API Channel ID แทน)
- `LINE_CHANNEL_SECRET` จาก Basic settings ของ Messaging API channel **2012545691**
- `LINE_CHANNEL_ACCESS_TOKEN` จาก Messaging API channel เดียวกัน สำหรับตอบข้อความ Developing

Secret และ Access Token อยู่ฝั่ง server เท่านั้น ห้ามตั้งชื่อขึ้นต้น `NEXT_PUBLIC_`.
ไม่ต้องตั้ง Supabase เพื่อทดสอบการเชื่อมต่อรอบนี้. Restart dev server หลังแก้ env;
LIFF ID เป็นค่า build-time จึงต้อง build ใหม่เมื่อเปลี่ยนใน production.

### LINE Developers Console (ทำเมื่อมี HTTPS endpoint พร้อมแล้ว)

สถานะการตั้งค่าและผลตรวจจริงรอบล่าสุดอยู่ใน [LINE live setup](docs/LINE-LIVE-SETUP.md). ปัจจุบันใช้ HTTPS tunnel ชั่วคราว ไม่ใช่ hosting ถาวร. ตรวจซ้ำได้ด้วย `npm run line:check -- --url https://<dev-host> --live` โดยไม่แสดง credential.

1. รัน `npm run dev` บนเครื่อง. LINE ต้องเข้าถึง URL HTTPS สาธารณะได้;
   localhost อย่างเดียวใช้ทดสอบจาก LINE ไม่ได้. ใช้ dev tunnel ที่ทีมอนุมัติหรือ
   dev hosting ที่มีอยู่และรันโค้ดชุดนี้. ถ้าใช้ tunnel เครื่องและ process ต้องเปิดอยู่ตลอดการทดสอบ.
2. เปิด MINI App channel **2012545254** → Web app settings → **Developing**.
   ตั้ง Endpoint URL เป็น `https://<dev-host>/miniapp` และตรวจ LIFF ID ว่าตรงกับ
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

หน้าแนะนำมี desktop scroll showcase 6 ฉาก, ตัวเลือกบนมือถือ, การ์ดเลื่อนแนวนอน, สลับข้อมูลนักศึกษา/ร้านค้า, สถานการณ์สมมติ, FAQ และปุ่มกลับด้านบน. รองรับ reduced motion โดยปิด animation และช่วง pinned. `/miniapp` มีหน้าล็อกอิน สถานะเชื่อมต่อ และหน้าหลัก/โปร/เกี่ยวกับหลังตรวจตัวตนสำเร็จ.

`/` คือหน้าแนะนำ PorChai พร้อมแชตตัวอย่างแบบสลับได้และ FAQ. `/miniapp` คือหน้าทดสอบที่ตรวจตัวตน LINE; `/business/demo` คือรายงานธุรกิจสมมติ. ตั้ง Console Endpoint URL เป็น `https://<dev-host>/miniapp` เพื่อให้ LIFF เริ่มและรับ redirect ที่หน้าเดียวกันทุกครั้ง รวมถึงการเปิด MINI App URL ที่ไม่มีพารามิเตอร์. หากเคยตั้งเป็น root ให้เปลี่ยนก่อนทดสอบรอบนี้. ยังไม่ใช่การรับรอง MINI App หรือหลักฐานทดสอบ LINE จริง.
