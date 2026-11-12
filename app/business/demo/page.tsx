import type { Metadata } from "next";
import { demoCampaign, demoReportPeriod } from "@/lib/campaigns/demo";
import { formatBaht } from "@/lib/campaigns/money";
import ReportCalculator from "./report-calculator";

export const metadata: Metadata = {
  title: "ข้อเสนอแคมเปญตัวอย่าง | พอใช้",
  robots: { index: false, follow: false },
};

export default function BusinessDemo() {
  return (
    <main lang="th" className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <header>
          <p className="font-semibold text-emerald-800">พอใช้ · สำหรับอธิบายธุรกิจให้ทีมและร้านค้า</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight">นักศึกษาใช้เครื่องมือหลักฟรี<br />ร้านค้าจ่ายเพื่อแคมเปญที่วัดผลได้</h1>
          <p className="mt-5 rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950">เดโมด้วยข้อมูลสมมติทั้งหมด ไม่มีร้านค้าจริง ไม่มีคูปองที่นำไปใช้ซื้อได้ และไม่มีผลทดลองผู้ใช้จริง</p>
        </header>
        <section aria-labelledby="offer-title" className="rounded-2xl border border-slate-300 bg-white p-5 sm:p-8">
          <p className="text-sm font-semibold text-emerald-800">ข้อเสนอจากผู้สนับสนุน · ตัวอย่าง</p>
          <h2 id="offer-title" className="mt-2 text-2xl font-bold">{demoCampaign.title}</h2>
          <p className="mt-2">{demoCampaign.merchantLabel} · ราคาเสนอ {formatBaht(demoCampaign.priceSatang)} ต่อคน</p>
          <ul className="mt-5 list-disc space-y-2 pl-5">{demoCampaign.terms.map(term => <li key={term}>{term}</li>)}</ul>
          <p className="mt-5 font-semibold">{demoCampaign.payer}</p>
          <p className="mt-2 text-slate-700">{demoCampaign.reporting}</p>
          <p className="mt-4 text-sm text-slate-700">เป้าหมายตัวอย่าง: ใช้สิทธิ์สำเร็จ 20 ครั้ง ต้องให้ร้านยืนยันราคา เงื่อนไข และช่วงเวลา ก่อนเปิดให้ผู้ใช้รับสิทธิ์</p>
        </section>
        <section aria-labelledby="evidence-title" className="rounded-2xl border border-slate-300 bg-white p-5 sm:p-8">
          <h2 id="evidence-title" className="text-xl font-bold">ขอบเขตรายงานที่ร้านเห็น</h2>
          <p className="mt-3">ชุดสมมติ: ดู 60 ครั้ง รับ 30 สิทธิ์ ใช้สำเร็จ 20 สิทธิ์</p>
          <p className="mt-2">ช่วงรายงาน: {demoReportPeriod} · วันและรอบรายงานยึดเวลาไทย</p>
          <p className="mt-2 text-slate-700">ยอดดูเป็นจำนวนครั้ง ไม่ใช่จำนวนผู้ใช้ไม่ซ้ำ ยอดใช้ต้องมาจากร้านยืนยันสำเร็จแล้ว รายงานนี้ไม่มีชื่อ LINE user ID ข้อความแชต หรือรายการใช้จ่ายส่วนตัว</p>
          <p className="mt-3 text-slate-700">ตัวอย่างนี้ยังไม่พิสูจน์ว่าร้านมีลูกค้าน้อยวันอังคาร ต้องตรวจข้อมูลบันทึกแบบรวมของผู้ใช้ควบคู่กับยอดขายร้านก่อนตัดสินใจจัดโปร</p>
        </section>
        <ReportCalculator />
        <footer className="text-sm leading-6 text-slate-700">ส่วนนี้เป็นข้อเสนอธุรกิจและเครื่องคำนวณเดโม การออกโค้ด การหมดอายุ และการยืนยันใช้สิทธิ์จริงรอเชื่อมระบบหลังบ้าน ยังไม่มีการซื้อหรือส่งข้อมูลให้ร้านค้า</footer>
      </div>
    </main>
  );
}
