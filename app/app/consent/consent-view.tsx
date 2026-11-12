"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/ui/mascot";
import { CONSENT_VERSION } from "@/lib/client/consent-version";
import { ApiError } from "@/lib/client/errors";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";

// Wording is copied from Figma A1 (DevLead/figma-spec/phase2-fixes.md Q2). The spec lists 4 lines under
// "สิ่งที่เก็บ" (it says 5 exist; the fifth was not readable), so only those 4 are shown.
const CONSENT_GROUPS = [
  {
    title: "สิ่งที่เก็บ",
    items: [
      "ยอดเงิน วันเงินเข้า และบิลที่คุณกรอก",
      "รายการรายรับ/รายจ่ายที่คุณจด",
      "รูปใบเสร็จ/สลิปที่คุณส่ง เพื่ออ่านยอดเป็นรายการร่าง",
      "LINE ID เพื่อให้เปิดแผนของคุณได้",
    ],
  },
  {
    title: "ใช้ข้อมูลอย่างไร",
    items: [
      "AI ช่วยอ่านข้อความและอธิบายผล ตัวเลขคิดด้วยระบบ",
      "ร้านค้าเห็นแค่ข้อมูลรวม ไม่เห็นชื่อหรือยอดเงินของคุณ",
      "เตือนผ่าน LINE และสะสมแต้มรายวัน ปิดเตือนได้ในหน้าตั้งค่า",
    ],
  },
  {
    title: "สิ่งที่ไม่ทำ",
    items: [
      "ไม่เชื่อมบัญชีธนาคาร · ส่งรูปใบเสร็จ/สลิปเฉพาะเมื่อคุณเลือกเอง",
      "เครื่องมือวัดการใช้งาน (Clarity) ปิดบังข้อความที่คุณกรอก",
    ],
  },
] as const;

const FULL_POLICY_HEADINGS = ["ข้อมูลที่เก็บและเหตุผล", "ระยะเวลาเก็บข้อมูล", "วิธีขอลบข้อมูล", "ติดต่อทีมงาน"] as const;

export function ConsentView() {
  const api = useApi();
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone who already consented must never be stranded here (e.g. "ออกก่อน" from setup).
  useEffect(() => {
    let cancelled = false;
    api
      .consent()
      .then((c) => {
        if (!cancelled && c.accepted) router.replace("/app");
      })
      .catch(() => {
        // cannot tell: show the consent form
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function start() {
    setError(null);
    const result = await submit(CONSENT_VERSION, async () => {
      await api.acceptConsent(CONSENT_VERSION);
      // Someone who already has a cycle (e.g. re-consenting after a version bump) goes back to the app.
      // If me() fails we cannot tell, so fall through to setup.
      try {
        return (await api.me()).hasActiveCycle;
      } catch {
        return false;
      }
    });
    if (result.ok) {
      // busy stays true: the page is unmounting, so a second tap cannot slip in.
      router.replace(result.value ? "/app" : "/app/setup/income");
      return;
    }
    if ("skipped" in result) return;
    setError(result.error instanceof ApiError ? result.error.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between gap-6 px-4 py-6 font-body">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl text-primary">ก่อนเริ่มใช้</h1>

        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <Mascot pose="greeting" size={80} />
          <p className="text-lg font-semibold text-primary">พอใช้เก็บข้อมูลเท่าที่จำเป็น</p>
          <p className="text-base text-secondary">เพื่อคำนวณว่าเงินพอใช้ถึงวันเงินเข้าไหม</p>
        </div>

        {CONSENT_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
            <h2 className="text-base font-semibold text-primary">{group.title}</h2>
            <ul className="flex flex-col gap-2 text-sm text-primary">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span aria-hidden="true" className="text-secondary">
                    •
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <button
            type="button"
            aria-expanded={policyOpen}
            onClick={() => setPolicyOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-link"
          >
            <span>อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม</span>
            <span aria-hidden="true">{policyOpen ? "▴" : "▾"}</span>
          </button>

          {policyOpen ? (
            <div className="flex flex-col gap-3 border-t border-line pt-3 text-sm">
              <p className="text-secondary">ฉบับเต็มกำลังจัดทำ แสดงหัวข้อไว้ก่อน</p>
              {FULL_POLICY_HEADINGS.map((heading) => (
                <div key={heading} className="flex flex-col gap-0.5">
                  <h3 className="font-semibold text-primary">{heading}</h3>
                  <p className="text-secondary">(รอทีมยืนยันข้อความ)</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-line bg-card p-3.5 text-sm text-primary">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => setTicked(e.target.checked)}
            className="size-6 shrink-0 accent-[var(--green-700)]"
          />
          <span>ฉันเข้าใจและยินยอม</span>
        </label>

        {error ? (
          <p role="alert" className="rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button variant="primary" block disabled={!ticked} busy={busy} onClick={start}>
          ยอมรับและเริ่ม
        </Button>
      </div>
    </main>
  );
}
