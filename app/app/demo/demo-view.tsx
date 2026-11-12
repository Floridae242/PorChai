"use client";

import Link from "next/link";
import { AppHeader } from "@/components/shell/app-header";
import { ListRow } from "@/components/ui/list-row";
import { Mascot } from "@/components/ui/mascot";

const DEMO_SECTIONS = [
  {
    title: "ลำดับเดโมหลัก (Final Demo Flow)",
    items: [
      { code: "A1–A1c", title: "ยินยอมก่อนเริ่มใช้งาน", href: "/app/consent" },
      { code: "A3a", title: "ตั้งค่า 1/4 · เงินเข้า", href: "/app/setup/income" },
      { code: "A3b", title: "ตั้งค่า 2/4 · เงินที่มี + บิลประจำ", href: "/app/setup/balance" },
      { code: "A3c", title: "ตั้งค่า 3/4 · กันเงินออม + เงินเผื่อ", href: "/app/setup/savings" },
      { code: "A3d", title: "ตั้งค่า 4/4 · ค่าจำเป็นต่อวัน", href: "/app/setup/essentials" },
      { code: "A4", title: "ตรวจสรุปก่อนเริ่ม (120 บาท/วัน · วงเงิน 600)", href: "/app/setup/review" },
      { code: "B1", title: "หน้าสรุปหลัก (Dashboard วันแรก)", href: "/app" },
      { code: "B1m", title: "หน้าสรุป · กราฟใช้ไปแต่ละวัน (กลางรอบ)", href: "/app?scenario=midCycle&view=cycle" },
      { code: "D1", title: "จดรายการใหม่ (เช่น ข้าว 45)", href: "/app/record/new?type=expense" },
      { code: "C1", title: "ลองก่อนจ่าย (รองเท้า 480 / หูฟัง 700)", href: "/app/try" },
      { code: "C2x", title: "ผลลองก่อนจ่าย · เกินวงเงิน (หูฟัง 700)", href: "/app/try/result?title=หูฟัง&amount=700" },
      { code: "C3", title: "เลือกทำอะไรต่อ (เก็บไว้ในแผน / ยืนยันจ่ายจริง)", href: "/app/try/decide" },
      { code: "C4", title: "เก็บไว้ในแผนแล้ว", href: "/app/try/saved" },
    ],
  },
  {
    title: "ฟีเจอร์ Final (สิทธิพิเศษ · ร้านค้า · แต้ม · การเตือน)",
    items: [
      { code: "P1", title: "สิทธิพิเศษ & แต้ม (ป้ายข้อเสนอจากผู้สนับสนุน)", href: "/app/perks" },
      { code: "P2", title: "รายละเอียดโปร (ชุดหมูกระทะ 129 บาท)", href: "/app/perks/promo-moo-krata" },
      { code: "P3", title: "รหัส/QR ใช้สิทธิ์ (PC-...)", href: "/app/perks/promo-moo-krata/code" },
      { code: "M1–M2", title: "ฝั่งร้านค้า · ยืนยันรหัสส่วนลด", href: "/app/shop/verify" },
      { code: "K1–K2", title: "แต้มของฉัน & แลกของรางวัล", href: "/app/points" },
      { code: "R1", title: "ตั้งค่าการเตือนตามพฤติกรรม", href: "/app/settings/notifications" },
    ],
  },
  {
    title: "แท็บแผนเงิน · ตั้งค่า · เคสขอบ (Edge States)",
    items: [
      { code: "H2", title: "แผนเงิน › รายการทั้งหมด", href: "/app/plan?tab=list" },
      { code: "H1", title: "แผนเงิน › รอจ่าย (ของในแผน + บิล)", href: "/app/plan?tab=pending" },
      { code: "H9", title: "แผนเงิน › ออม/เผื่อ", href: "/app/plan?tab=savings" },
      { code: "C3b", title: "โควตาเก็บไว้ในแผนครบ 3/3 รายการ", href: "/app/try/decide?quota=full" },
      { code: "S4", title: "สถานะเงินไม่พอหักบิล (Shortfall)", href: "/app?scenario=shortfall" },
      { code: "S10", title: "สถานะงบตึง (< 50 บาท/วัน)", href: "/app?scenario=tight" },
      { code: "B1b", title: "สถานะถึงวันเงินเข้า (Payday Passed)", href: "/app?scenario=paydayPassed" },
      { code: "E4", title: "ปรับยอดให้ตรงเงินจริง", href: "/app/balance/adjust" },
      { code: "H3", title: "หน้าตั้งค่าหลัก", href: "/app/settings" },
      { code: "UI", title: "คลังคอมโพเนนต์พื้นฐาน (UI Gallery)", href: "/app/demo/ui" },
    ],
  },
] as const;

export function DemoMenuView() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-4 font-body">
      <AppHeader title="เมนูเดโม (Z · ทางลัดทุกฉาก)" back="/app" tone="default" />

      <div className="flex items-center gap-3 rounded-md border border-line bg-subtle p-4">
        <Mascot pose="greeting" size={56} />
        <div className="text-xs text-secondary">
          <p className="font-semibold text-primary">หน้านี้มีไว้สำหรับทีมนำเสนอ (ไม่ใช่ส่วนของแอปจริง)</p>
          <p>แตะแถวใดก็ได้เพื่อกระโดดไปดูหน้าจอหรือสถานะเงื่อนไขนั้นทันที</p>
        </div>
      </div>

      {DEMO_SECTIONS.map((sec) => (
        <section key={sec.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-secondary">{sec.title}</h2>
          <div className="divide-y divide-line rounded-md border border-line bg-card px-4">
            {sec.items.map((item) => (
              <ListRow
                key={item.code}
                title={item.title}
                badge={item.code}
                href={item.href}
              />
            ))}
          </div>
        </section>
      ))}

      <Link href="/app" className="py-2 text-center text-sm font-semibold text-link underline">
        กลับหน้าสรุปหลัก (/app)
      </Link>
    </main>
  );
}
