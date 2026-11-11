"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [state, setState] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [message, setMessage] = useState("กำลังเชื่อมต่อ LINE…");

  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error("ยังไม่ได้ตั้งค่า LIFF ID");
        const { default: liff } = await import("@line/liff");
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          if (active) setState("login");
          return;
        }
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error("ไม่พบ ID token กรุณาตรวจสิทธิ์ openid ใน LINE Console");
        const response = await fetch("/api/line/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error("ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่");
        const { user } = await response.json();
        if (active) {
          setMessage(`เชื่อมต่อ LINE สำเร็จ${user.name ? ` สวัสดี ${user.name}` : ""}`);
          setState("ready");
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ");
          setState("error");
        }
      }
    }
    void connect();
    return () => { active = false; };
  }, []);

  async function login() {
    try {
      const { default: liff } = await import("@line/liff");
      liff.login();
    } catch {
      setMessage("เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาลองใหม่");
      setState("error");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">พอใช้ · PorChai</h1>
      <p>จดรายจ่าย และช่วยคิดก่อนจ่ายสำหรับนักศึกษา</p>
      <p role={state === "error" ? "alert" : "status"} aria-live="polite">
        {state === "login" ? "เข้าสู่ระบบ LINE เพื่อเริ่มใช้งาน" : message}
      </p>
      {state === "login" && <button className="rounded-xl bg-green-700 p-3 text-white" onClick={login}>เข้าสู่ระบบ LINE</button>}
      {state === "error" && <button className="rounded-xl border p-3" onClick={() => window.location.reload()}>ลองใหม่</button>}
      {state === "ready" && <p>พร้อมทดสอบการเชื่อมต่อแล้ว ฟีเจอร์จดรายจ่ายจะเพิ่มในขั้นต่อไป</p>}
    </main>
  );
}
