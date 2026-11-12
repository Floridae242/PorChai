"use client";

import { useEffect, useState } from "react";
import { LIFF_ID } from "@/lib/liff/config";
import { initializeLiff } from "@/lib/line/liff-client";

// Card 06 evidence page (temporary, not a real screen): open in LINE via
// https://liff.line.me/2012545176-udYyTUiA/dev/liff-check and it shows whether
// the server accepts this LINE account, and rejects a forged token.

interface Step {
  label: string;
  ok: boolean;
  detail: string;
}

async function call(
  path: string,
  token: string,
): Promise<{ status: number; body: string }> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.text() };
}

export default function LiffCheck() {
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    const add = (s: Step) => setSteps((prev) => [...prev, s]);
    (async () => {
      try {
        const liff = await initializeLiff(LIFF_ID);
        add({
          label: "เปิด LIFF",
          ok: true,
          detail: liff.isInClient() ? "เปิดในแอป LINE" : "เปิดในเบราว์เซอร์",
        });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const token = liff.getIDToken();
        if (!token) {
          add({
            label: "ขอ ID token",
            ok: false,
            detail: "ไม่ได้ token — ตรวจว่า LIFF app เปิด scope openid",
          });
          return;
        }
        add({ label: "ขอ ID token", ok: true, detail: "ได้ token จาก LINE" });

        const me = await call("/api/me", token);
        add({
          label: "เข้าระบบด้วย token จริง (ต้องได้ 200)",
          ok: me.status === 200,
          detail: `${me.status} ${me.body}`,
        });

        const forged = await call("/api/me", `${token.slice(0, -4)}AAAA`);
        add({
          label: "token ปลอม (ต้องถูกปฏิเสธ 401)",
          ok: forged.status === 401,
          detail: `${forged.status} ${forged.body}`,
        });

        const none = await fetch("/api/me");
        add({
          label: "ไม่มี token (ต้องถูกปฏิเสธ 401)",
          ok: none.status === 401,
          detail: `${none.status}`,
        });
      } catch (err) {
        add({ label: "เกิดข้อผิดพลาด", ok: false, detail: String(err) });
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-md p-4 font-sans leading-relaxed">
      <h1 className="mb-1 text-lg font-semibold">ตรวจการเข้าระบบผ่าน LINE</h1>
      <p className="mb-4 text-sm text-zinc-500">
        หน้าทดสอบการ์ด 06 · ไม่ใช่หน้าจริงของแอป
      </p>
      {steps.length === 0 && <p>กำลังตรวจ…</p>}
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="rounded border border-zinc-200 p-3">
            <div className="font-medium">
              {s.ok ? "✅" : "❌"} {s.label}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-zinc-600">
              {s.detail}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
