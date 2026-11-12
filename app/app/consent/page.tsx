"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONSENT_VERSION } from "@/lib/client/mock-fixtures";
import { useApi } from "@/lib/client/use-api";

// Temporary stub: replaced by the designed consent screen later.
export default function ConsentPage() {
  const api = useApi();
  const router = useRouter();
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await api.acceptConsent(CONSENT_VERSION);
      router.replace("/app");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="font-display text-3xl">ก่อนเริ่มใช้พอใช้</h1>
      <p className="font-body text-base text-secondary">
        พอใช้เก็บข้อมูลรายรับรายจ่ายที่คุณบันทึกไว้เพื่อคำนวณเงินที่ใช้ได้ในแต่ละวัน และไม่นำไปให้ผู้อื่น
      </p>
      <label className="flex items-center gap-3 font-body text-base">
        <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="size-5" />
        ยอมรับ
      </label>
      <button
        type="button"
        disabled={!ticked || busy}
        onClick={start}
        className="self-start rounded-pill bg-action-primary px-6 py-3 font-body font-semibold text-on-action disabled:opacity-40"
      >
        เริ่มต้นใช้งาน
      </button>
    </main>
  );
}
