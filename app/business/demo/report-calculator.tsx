"use client";

import { useState, type FormEvent } from "react";
import { demoReportInput } from "@/lib/campaigns/demo";
import { formatBaht, parseBaht } from "@/lib/campaigns/money";
import { calculateCampaignReport } from "@/lib/campaigns/report";

export default function ReportCalculator() {
  const [report, setReport] = useState<ReturnType<typeof calculateCampaignReport> | null>(() => calculateCampaignReport(demoReportInput));
  const [error, setError] = useState("");

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const count = (name: string) => {
        const raw = String(form.get(name) ?? "");
        const value = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value > 1000000) {
          throw new Error("กรอกจำนวนเต็มตั้งแต่ 0 ถึง 1,000,000 ในช่องยอดดู รับ และใช้สิทธิ์");
        }
        return value;
      };
      const views = count("views"), claimed = count("claimed"), redeemed = count("redeemed");
      if (redeemed > claimed) throw new Error("ยอดใช้สิทธิ์ต้องไม่มากกว่ายอดรับสิทธิ์");
      const costText = String(form.get("cost") ?? "").trim();
      const next = calculateCampaignReport({
        views, claimed, redeemed,
        feePerRedemptionSatang: demoReportInput.feePerRedemptionSatang,
        ...(costText ? { knownCostSatang: parseBaht(costText) } : {}),
      });
      setReport(next);
      setError("");
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : "ตรวจข้อมูลก่อนคำนวณใหม่");
    }
  }

  const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-400 bg-white p-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800";
  return (
    <section aria-labelledby="calculator-title" className="rounded-2xl border border-slate-300 bg-white p-5 sm:p-8">
      <h2 id="calculator-title" className="text-xl font-bold">ลองคำนวณรายงานแคมเปญ</h2>
      <p className="mt-2 text-slate-700">ข้อมูลสมมติสำหรับนำเสนอ ค่าบริการตัวอย่าง 5 บาทต่อการใช้สิทธิ์สำเร็จ ไม่ใช่ราคาที่ตกลงกับร้านจริง</p>
      <form onSubmit={calculate} className="mt-6 grid gap-4 sm:grid-cols-2">
        {([
          ["views", "ยอดดูข้อเสนอ", demoReportInput.views],
          ["claimed", "ยอดรับสิทธิ์", demoReportInput.claimed],
          ["redeemed", "ยอดใช้สิทธิ์ที่ร้านยืนยัน", demoReportInput.redeemed],
        ] as const).map(([name, label, initial]) => (
          <label key={name} className="font-medium" htmlFor={name}>
            {label}
            <input id={name} name={name} type="number" inputMode="numeric" required min="0" max="1000000" step="1" defaultValue={initial} className={inputClass} />
          </label>
        ))}
        <label htmlFor="cost" className="font-medium">ต้นทุนรวมที่ประเมินเอง (บาท)
          <input id="cost" name="cost" type="text" inputMode="decimal" aria-describedby="cost-help" placeholder="เว้นว่างถ้ายังไม่ทราบ" className={inputClass} />
        </label>
        <p id="cost-help" className="text-sm text-slate-700 sm:col-span-2">รวมต้นทุน LINE, AI, OCR, ระบบ และรางวัลตามสมมติฐานของทีมเอง ยังไม่มีราคาผู้ให้บริการในระบบ ช่องว่างหมายถึงยังไม่ทราบ; 0 หมายถึงคุณยืนยันต้นทุนศูนย์ ข้อมูลที่กรอกใช้ในหน้านี้เท่านั้น</p>
        <button className="min-h-12 rounded-xl bg-emerald-800 px-6 py-3 font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 sm:col-span-2" type="submit">คำนวณข้อมูลสมมติ</button>
      </form>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">{error}</p>}
      <div aria-live="polite" aria-atomic="true" className="mt-6">
        {report && <>
          <h3 className="font-bold">ผลคำนวณสมมติล่าสุด</h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            {[
              ["รายได้ค่าบริการของพอใช้", formatBaht(report.serviceRevenueSatang)],
              ["รับสิทธิ์แต่ยังไม่ใช้", `${report.unredeemed} สิทธิ์`],
              ["อัตราใช้สิทธิ์จากยอดรับ", report.redemptionRatePercent === null ? "ยังคำนวณไม่ได้ (ไม่มีผู้รับสิทธิ์)" : `${report.redemptionRatePercent.toFixed(1)}%`],
              ["ต้นทุนรวมที่กรอก", report.knownCostSatang === null ? "ยังไม่ทราบ" : formatBaht(report.knownCostSatang)],
              ["รายได้หักต้นทุนที่กรอก", report.contributionSatang === null ? "ยังสรุปไม่ได้ เพราะไม่มีต้นทุน" : formatBaht(report.contributionSatang)],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-100 p-4"><dt className="text-sm text-slate-700">{label}</dt><dd className="mt-1 text-lg font-bold">{value}</dd></div>)}
          </dl>
          <p className="mt-4 text-sm text-slate-700">สูตร: ใช้สำเร็จ {report.redeemed} ครั้ง × 5 บาท ร้านรับค่าสินค้าจากนักศึกษาแยกต่างหาก ยอดนี้ไม่รวมค่าสินค้า และไม่ใช่หลักฐานรายได้จริงหรือกำไรสุทธิ</p>
        </>}
      </div>
    </section>
  );
}
