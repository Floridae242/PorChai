import type { Liff } from "@line/liff";
import { ApiError } from "./errors";
import { loginRedirectUri } from "@/lib/liff/login-redirect";

const MSG_LOGIN_FAILED = "เข้าสู่ระบบ LINE ไม่สำเร็จ";
const MSG_EXPIRED = "หมดเวลาเข้าสู่ระบบ ปิดแล้วเปิดพอใช้ใหม่อีกครั้ง";
const MSG_LIFF = "เชื่อมต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง";
export const LOGIN_FLAG = "porchai.login-attempted";

// Anything that is not already an ApiError becomes one, so raw LIFF errors never reach screens.
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "liff", MSG_LIFF);
  }
}

// Token functions for createLiveApi. Never log the token or put it in a URL.
export function createLiffAuth(getLiff: () => Promise<Liff>) {
  // Backs up sessionStorage: when storage is blocked this still allows one login redirect per page load.
  let attemptedThisLoad = false;

  function flag(op: "get" | "set" | "clear"): boolean {
    if (op === "set") attemptedThisLoad = true;
    else if (op === "clear") attemptedThisLoad = false;
    try {
      if (op === "set") window.sessionStorage.setItem(LOGIN_FLAG, "1");
      else if (op === "clear") window.sessionStorage.removeItem(LOGIN_FLAG);
      else
        return (
          attemptedThisLoad || window.sessionStorage.getItem(LOGIN_FLAG) === "1"
        );
    } catch {
      // storage blocked: the in-memory flag still stops a loop within one page load
    }
    return false;
  }

  // Sends the user to LINE login; the page navigates away, so this never resolves.
  async function loginAndWait(liff: Liff): Promise<never> {
    liff.login({
      redirectUri: loginRedirectUri(
        window.location.origin,
        window.location.pathname,
      ),
    });
    return new Promise<never>(() => {});
  }

  function getIdToken(): Promise<string> {
    return guarded(async () => {
      const liff = await getLiff();
      if (!liff.isLoggedIn()) {
        if (flag("get"))
          throw new ApiError(401, "unauthorized", MSG_LOGIN_FAILED);
        flag("set");
        return loginAndWait(liff);
      }
      const token = liff.getIDToken();
      if (!token) throw new ApiError(401, "unauthorized", MSG_LOGIN_FAILED);
      flag("clear");
      return token;
    });
  }

  // LIFF caches the ID token, so a fresh login is the only refresh. Inside the LINE client
  // liff.login() does not navigate for a logged-in user, so fail instead of hanging.
  function refreshIdToken(): Promise<string> {
    return guarded(async () => {
      const liff = await getLiff();
      if (liff.isInClient() || flag("get"))
        throw new ApiError(401, "unauthorized", MSG_EXPIRED);
      flag("set");
      return loginAndWait(liff);
    });
  }

  return { getIdToken, refreshIdToken };
}
