import type { Liff } from "@line/liff";
import { ApiError } from "./errors";

const MSG_LOGIN_FAILED = "เข้าสู่ระบบ LINE ไม่สำเร็จ";
const MSG_EXPIRED = "หมดเวลาเข้าสู่ระบบ ปิดแล้วเปิดพอใช้ใหม่อีกครั้ง";
export const LOGIN_FLAG = "porchai.login-attempted";

function flag(op: "get" | "set" | "clear"): boolean {
  try {
    if (op === "set") window.sessionStorage.setItem(LOGIN_FLAG, "1");
    else if (op === "clear") window.sessionStorage.removeItem(LOGIN_FLAG);
    else return window.sessionStorage.getItem(LOGIN_FLAG) === "1";
  } catch {
    // storage blocked: without the guard we may log in once more, which is the safe direction
  }
  return false;
}

// Token functions for createLiveApi. Never log the token or put it in a URL.
export function createLiffAuth(getLiff: () => Promise<Liff>) {
  // Sends the user to LINE login; the page navigates away, so this never resolves.
  async function loginAndWait(): Promise<never> {
    const liff = await getLiff();
    liff.login({ redirectUri: window.location.href });
    return new Promise<never>(() => {});
  }

  async function getIdToken(): Promise<string> {
    const liff = await getLiff();
    if (!liff.isLoggedIn()) return loginAndWait();
    const token = liff.getIDToken();
    if (!token) throw new ApiError(401, "unauthorized", MSG_LOGIN_FAILED);
    flag("clear");
    return token;
  }

  // LIFF caches the ID token, so a fresh login is the only refresh. Inside the LINE client
  // liff.login() does not navigate for a logged-in user, so fail instead of hanging.
  async function refreshIdToken(): Promise<string> {
    const liff = await getLiff();
    if (liff.isInClient() || flag("get")) throw new ApiError(401, "unauthorized", MSG_EXPIRED);
    flag("set");
    return loginAndWait();
  }

  return { getIdToken, refreshIdToken };
}
