"use client";

import { useEffect, useState } from "react";
import { MiniAppWelcome } from "./miniapp-welcome";
import { initializeLiff } from "@/lib/line/liff-client";
import { verifyMiniAppUser, type MiniAppUser } from "@/lib/line/miniapp-user";
import { appReturnPath, loginRedirectUri } from "@/lib/liff/login-redirect";

type Connection =
  | { status: "loading" }
  | { status: "login" }
  | { status: "ready"; user: MiniAppUser }
  | { status: "error"; message: string };

export default function MiniApp() {
  const [connection, setConnection] = useState<Connection>({
    status: "loading",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE กรุณาติดต่อทีมพอใช้");
        const liff = await initializeLiff(liffId);
        if (!liff.isLoggedIn()) {
          if (active) setConnection({ status: "login" });
          return;
        }
        const user = await verifyMiniAppUser(liff.getIDToken());
        const returnTo = appReturnPath(
          new URLSearchParams(window.location.search).get("returnTo"),
        );
        if (active && returnTo) {
          window.location.replace(returnTo);
          return;
        }
        if (active) setConnection({ status: "ready", user });
      } catch (error) {
        if (active)
          setConnection({
            status: "error",
            message:
              error instanceof Error ? error.message : "เชื่อมต่อ LINE ไม่สำเร็จ",
          });
      }
    }
    void connect();
    return () => {
      active = false;
    };
  }, []);

  async function login(path: string) {
    if (busy) return;
    setBusy(true);
    try {
      const liff = await initializeLiff(process.env.NEXT_PUBLIC_LIFF_ID!);
      const returnTo = appReturnPath(
        new URLSearchParams(window.location.search).get("returnTo"),
      );
      liff.login({
        redirectUri: loginRedirectUri(window.location.origin, returnTo ?? path),
      });
    } catch {
      setBusy(false);
      setConnection({
        status: "error",
        message: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
      });
    }
  }

  return (
    <MiniAppWelcome
      status={connection.status}
      name={connection.status === "ready" ? connection.user.name : null}
      error={connection.status === "error" ? connection.message : null}
      busy={busy}
      onLogin={(path) => void login(path)}
    />
  );
}
