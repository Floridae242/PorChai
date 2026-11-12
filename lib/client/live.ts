// Live PorchaiApi: calls the server routes in docs/frontend-api.md. Same-origin by default.
// Never put the token or a user id in a URL and never log them.
import { ApiError } from "./errors";
import type { PorchaiApi } from "./types";

export interface LiveApiOptions {
  getIdToken: () => Promise<string>;
  refreshIdToken: () => Promise<string>;
  fetch?: typeof fetch;
  baseUrl?: string; // default "" = same origin
}

const MSG_NETWORK = "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง";
const MSG_UNKNOWN = "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
const MSG_NOT_IMPLEMENTED = "ฟีเจอร์นี้ยังไม่พร้อมใช้งาน";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestSpec {
  method: Method;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

function notImplemented(): Promise<never> {
  return Promise.reject(new ApiError(501, "not_implemented", MSG_NOT_IMPLEMENTED));
}

export function createLiveApi(opts: LiveApiOptions): PorchaiApi {
  const baseUrl = opts.baseUrl ?? "";
  const doFetch = (...args: Parameters<typeof fetch>) => (opts.fetch ?? fetch)(...args);

  async function send(spec: RequestSpec, token: string): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let body: string | undefined;
    if (spec.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(spec.body);
    }
    if (spec.idempotencyKey !== undefined) headers["Idempotency-Key"] = spec.idempotencyKey;
    try {
      return await doFetch(`${baseUrl}${spec.path}`, { method: spec.method, headers, body });
    } catch {
      throw new ApiError(0, "network", MSG_NETWORK);
    }
  }

  async function request<T>(spec: RequestSpec): Promise<T> {
    let res = await send(spec, await opts.getIdToken());
    if (res.status === 401) {
      // token expired: refresh once, retry the same request once
      const fresh = await opts.refreshIdToken();
      res = await send(spec, fresh);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new ApiError(0, "network", MSG_NETWORK);
    }

    if (!res.ok) {
      const e = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error;
      if (e && typeof e.code === "string" && typeof e.message === "string") {
        throw new ApiError(res.status, e.code, e.message);
      }
      throw new ApiError(res.status, res.status === 401 ? "unauthorized" : "internal", MSG_UNKNOWN);
    }
    return data as T;
  }

  const seg = encodeURIComponent;

  return {
    me: async () => {
      const r = await request<{ hasActiveCycle: boolean }>({ method: "GET", path: "/api/me" });
      return { hasActiveCycle: r.hasActiveCycle };
    },
    createCycle: (req) => request({ method: "POST", path: "/api/cycle", body: req }),
    summary: () => request({ method: "GET", path: "/api/summary" }),
    entries: () => request({ method: "GET", path: "/api/entries" }),
    addEntry: (req, idempotencyKey) =>
      request({ method: "POST", path: "/api/entries", body: req, idempotencyKey }),
    editEntry: (id, req) => request({ method: "PATCH", path: `/api/entries/${seg(id)}`, body: req }),
    cancelEntry: (id) => request({ method: "DELETE", path: `/api/entries/${seg(id)}` }),
    adjustBalance: (req) => request({ method: "POST", path: "/api/cycle/balance", body: req }),
    simulate: (req) => request({ method: "POST", path: "/api/simulate", body: req }),
    setEssentials: (req) => request({ method: "PUT", path: "/api/cycle/essentials", body: req }),
    plans: () => request({ method: "GET", path: "/api/plans" }),
    addPlan: (req, idempotencyKey) =>
      request({ method: "POST", path: "/api/plans", body: req, idempotencyKey }),
    planAction: (id, action, body) =>
      request({ method: "POST", path: `/api/plans/${seg(id)}/${action}`, body }),

    // --- NOT ON THE SERVER YET (backend-gaps 13-20): wire each to its route when it ships ---
    consent: notImplemented,
    acceptConsent: notImplemented,
    points: notImplemented,
    claimPoints: notImplemented,
    promos: notImplemented,
    promo: notImplemented,
    claimPromo: notImplemented,
    rewards: notImplemented,
    redeemReward: notImplemented,
    shopRedeem: notImplemented,
    addIncome: notImplemented,
    dailySpend: notImplemented,
    categoryTotals: notImplemented,
    planQuota: notImplemented,
    reminderSettings: notImplemented,
    saveReminderSettings: notImplemented,
    deleteMyData: notImplemented,
    // --- end not-implemented block ---
  };
}
