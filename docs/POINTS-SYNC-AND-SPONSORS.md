# แต้มร่วมกัน วิธีใช้หลายรายการ และโฆษณาสาธิต

คำถาม “จดหลายรายการพร้อมกันได้หรือไม่” ใช้คำตอบวิธีใช้จากระบบก่อน flow จดหรือ AI เสมอ รองรับชื่อ/ยอดชัดเจน 2–5 รายการ แสดงร่างแล้วกดจดทั้งหมด ตัวอย่างในคู่มือไม่สร้างรายการหรือเพิ่มแต้ม

หน้าสรุป สิทธิพิเศษ และหน้าแต้มใช้ snapshot ต่อ API/account เดียวกัน ไม่สมมติ 0 เมื่อโหลดไม่สำเร็จ ถ้ามียอดเก่าที่เชื่อถือได้จะคงไว้พร้อมข้อความอัปเดตล้มเหลว รีเฟรชร่วมกันหลัง mutation สำเร็จ เมื่อกลับจาก LINE/visibility change และทุก 30 วินาทีที่หน้าจอเปิดอยู่ Request ซ้อนรวมกัน; epoch ป้องกัน GET เก่าเขียนทับยอดที่เพิ่งยืนยัน การลบบัญชีล้าง snapshot และไม่ใช้ข้อมูลข้าม API instance

Manual claim แสดงยอดที่เซิร์ฟเวอร์ยืนยัน ไม่กล่าวว่า +1 เมื่อเซิร์ฟเวอร์อาจคืนผลรับไปแล้ววันเดียวกัน การจดอัตโนมัติยังใช้ trigger ใน `20261116040000_personal_categories_auto_points.sql` ต้อง apply บนฐานจริงก่อนจึงจะทำงานออนไลน์

## ตรวจ 0 กับ 1 ระหว่างแชตและ MINI App

- เปิดหน้าแต้ม เลือก “แต้มไม่ตรงกับแชต? ตรวจการเชื่อมต่อ” แล้วพิมพ์ `ตรวจแต้ม` ใน OA
- ทั้งสองอ่าน balance ปัจจุบันโดยตรง รหัสบัญชีและรหัสระบบควรตรงกัน ใช้ hash ไม่แสดง LINE user ID, host, key หรือ token และ endpoint `/api/points/connection` ต้องผ่าน LINE auth / private no-store
- ถ้ารหัสบัญชีต่าง ตรวจว่า Login/MINI App/Messaging channels อยู่ provider เดียวกันและใช้บัญชีเดียวกัน ห้ามรวมบัญชีอัตโนมัติจากชื่อหรือรูปโปรไฟล์
- ถ้ารหัสระบบต่าง ตรวจ webhook URL และ Supabase environment ของแต่ละ deployment ถ้าเวอร์ชันต่าง ตรวจ deployment/alias และ code ที่ channel ชี้อยู่
- ถ้ารหัสตรงแต่ยอดชั่วคราวต่าง ให้รีเฟรชทั้งสองฝั่ง หลังจบ write ควรได้ยอดเดียวกัน; ข้อความแชตเก่าไม่แก้ยอดย้อนหลัง

ค่าเริ่มต้นเมื่อไม่ได้กำหนด LIFF ID เปลี่ยนเป็น Developing MINI App `2012545254-6025ZG1r`; ยังรองรับ standalone LIFF เมื่อระบุ ID นั้นใน environment อย่างชัดเจน เพื่อไม่เปิดช่องทาง Login เก่าโดยเงียบ ๆ

## Sponsor mock ที่ผู้ใช้ร้องขอ

`ดูโปร`, `ดูคูปอง`, `ดูโฆษณา` ส่ง Flex Carousel ผู้สนับสนุนสมมติ เฉพาะคำขอที่ชัดเจน AI infer ไม่เลือก promotions เอง ไม่มี scheduled advertising push, merchant action หรือ service message

หน้าแรก MINI App มีแบนเนอร์ AD แบบกะทัดรัด ปิดได้ และหน้าอ่านอย่างเดียว `/app/sponsors` ทุกข้อเสนอระบุข้อมูลจำลองและใช้ซื้อจริงไม่ได้ ไม่มีรหัสแลกจริงหรือการหักแต้ม เส้นทาง `/app/promotions` เดิมยังเป็น dev-only แยกจากตัวอย่างโฆษณาที่ผู้ใช้ขอให้แสดง

ส่วนหัวแชตของแอป LINE แบบภาพ Wise เป็นพื้นที่แพลตฟอร์ม LINE แอปเราไม่แทรกหรือแทนที่พื้นที่นั้น ทางเลือกที่ทำคือ Flex ภายในบทสนทนาและแบนเนอร์ภายใน MINI App ไม่ใช้ MINI App Service Messages ส่งโฆษณา ตาม [LINE service-message conditions](https://developers.line.biz/en/docs/line-mini-app/develop/service-messages/) และ [OA rich messages](https://developers.line.biz/en/docs/line-mini-app/service/line-mini-app-oa/)

## สถานะตรวจระบบจริง

โค้ดชุดนี้ทดสอบกับ Supabase local และ LINE/AI จำลอง ยังไม่ deploy หรือแก้ environment/ฐานออนไลน์ การตรวจ Vercel ที่เชื่อมอยู่ไม่พบ project/deployment PorChai และ CLI credential ใช้งานไม่ได้ จึงยังยืนยัน production commit หรือข้อมูล 0/1 จริงไม่ได้ GitHub ไม่พบ commit status หรือ deployment record ของ commit merge ที่ตรวจ การไม่มีข้อมูลเหล่านี้ไม่ใช่หลักฐานว่า deploy ล้มเหลว

LINE Console ที่อ่านได้ยืนยัน MINI App provider/endpoint แต่ยังไม่ได้ยืนยัน Messaging provider และ webhook URL ปัจจุบันครบทุกช่องทาง การแก้ frontend และเทสต์บัญชีเดียวกันผ่าน ไม่ใช่หลักฐานว่าค่า production ทุกจุดตรงกันแล้ว
