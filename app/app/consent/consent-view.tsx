"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/ui/mascot";
import { CONSENT_VERSION } from "@/lib/client/consent-version";
import { ApiError } from "@/lib/client/errors";
import { useApi } from "@/lib/client/use-api";

const CONSENT_DETAILS = [
  {
    title: "1. ข้อมูลรายรับรายจ่ายและแผนเงิน",
    body: "เก็บยอดเงินที่มี วันเงินเข้า บิลประจำ เป้าออม เงินเผื่อ และรายการใช้จ่ายที่คุณบันทึก เพื่อคำนวณงบรายวันและวงเงินซื้อของ",
  },
  {
    title: "2. รูปใบเสร็จและสลิป (OCR)",
    body: "ใช้สกัดชื่อร้าน ยอดรวม และวันที่เพื่อสร้างรายการร่างให้คุณตรวจสอบและกดยืนยันก่อนบันทึกทุกครั้ง ไม่หักยอดอัตโนมัติ",
  },
  {
    title: "3. การถาม AI ก่อนจ่าย",
    body: "ใช้ AI ช่วยอ่านประโยคภาษาธรรมชาติและอธิบายทางเลือกเท่านั้น ส่วนตัวเลขเงินทุกตัวคำนวณด้วยโค้ดจากข้อมูลบัญชีของคุณคนเดียว",
  },
  {
    title: "4. สิทธิพิเศษและข้อมูลสถิติร้านค้า",
    body: "โปรโมชันในแอปแสดงป้าย 'ข้อเสนอจากผู้สนับสนุน' ชัดเจน ไม่ส่งโปรผ่านแชต และส่งรายงานให้ร้านค้าเป็นยอดรวมแบบไม่ระบุตัวตนเท่านั้น",
  },
  {
    title: "5. การเตือนตามพฤติกรรมและแต้มรายวัน",
    body: "ส่งข้อความเตือนรายการประจำหรือบิลเมื่อคุณเปิดใช้งาน และให้แต้มสะสมสูงสุด 1 แต้มต่อวันตามเวลาไทย คุณปิดเตือนหรือลบข้อมูลทั้งหมดได้ทุกเมื่อที่หน้าตั้งค่า",
  },
] as const;

export function ConsentView() {
  const api = useApi();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api.acceptConsent(CONSENT_VERSION);
      router.replace("/app/setup/income");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between gap-6 px-4 py-6 font-body">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl text-primary">พอใช้</span>
          <Link
            href="/app/demo"
            className="rounded-pill border border-line-strong bg-subtle px-3 py-1 text-xs font-semibold text-link"
          >
            DEMO
          </Link>
        </div>

        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <Mascot pose="greeting" size={80} />
          <h1 className="font-display text-3xl text-primary">ก่อนเริ่มใช้พอใช้</h1>
          <p className="text-base text-secondary">
            พอใช้เก็บข้อมูลรายรับรายจ่ายที่คุณบันทึกไว้เพื่อคำนวณเงินที่ใช้ได้ในแต่ละวัน และไม่นำไปให้ผู้อื่น
          </p>
        </div>

        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <ul className="flex flex-col gap-2 text-sm text-primary">
            <li className="flex items-start gap-2">
              <span className="font-semibold text-status-ok" aria-hidden="true">
                ✓
              </span>
              <span>คำนวณงบรายวันด้วยโค้ดที่ตรวจสอบได้ ไม่ใช้ AI คิดเลข</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-status-ok" aria-hidden="true">
                ✓
              </span>
              <span>ไม่เชื่อมบัญชีธนาคาร และไม่เปิดเผยข้อมูลรายบุคคลให้ร้านค้า</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-status-ok" aria-hidden="true">
                ✓
              </span>
              <span>แก้ไขเวลาเตือนหรือลบข้อมูลทั้งหมดได้ตลอดเวลาที่หน้าตั้งค่า</span>
            </li>
          </ul>

          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="self-start text-sm font-semibold text-link underline underline-offset-4"
          >
            {expanded ? "ซ่อนรายละเอียดการใช้ข้อมูล ▴" : "อ่านรายละเอียดการใช้ข้อมูล ▾"}
          </button>

          {expanded ? (
            <div className="flex flex-col gap-3 border-t border-line pt-3 text-sm">
              {CONSENT_DETAILS.map((item) => (
                <div key={item.title} className="flex flex-col gap-0.5">
                  <h2 className="font-semibold text-primary">{item.title}</h2>
                  <p className="text-secondary">{item.body}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-card p-3.5 text-sm text-primary">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => setTicked(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--green-700)]"
          />
          <span>ยอมรับข้อตกลงการใช้ข้อมูลเพื่อเริ่มต้นใช้งานพอใช้</span>
        </label>

        {error ? (
          <p role="alert" className="rounded-sm bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
            {error}
          </p>
        ) : null}

        <Button variant="primary" block disabled={!ticked} busy={busy} onClick={start}>
          เริ่มต้นใช้งาน
        </Button>
      </div>
    </main>
  );
}
