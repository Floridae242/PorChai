/**
 * Shared LIFF + auth harness for the Por-Chai full-system E2E suite.
 *
 * What it gives every test:
 *  - `window.liff` injected before any page script runs (init / isLoggedIn / getIDToken / getProfile …),
 *    picked up by lib/line/liff-client.ts only when the dev server runs with NEXT_PUBLIC_E2E_LIFF_MOCK=1.
 *  - A per-test, per-user backend behind every same-origin `/api/*` call. It checks the `Authorization:
 *    Bearer <LIFF ID token>` header exactly like lib/auth.ts (no token / unknown token = 401) and scopes
 *    every read and write to the user that token belongs to. The money logic is the app's own:
 *    lib/client/mock.ts, which computes every number through lib/calc. No Supabase or LINE servers needed.
 *  - A log of every API call (method, path, idempotency key, which user, status) and of every
 *    request that tried to leave localhost, for double-submit and privacy assertions.
 *  - A fixed clock (Asia/Bangkok, 2026-11-11 10:00) shared by the browser and the backend, so every
 *    run produces the same numbers and the same video.
 *
 * Switching users: call `loginAs(USER_A)` for the default tester, `loginAs(USER_B)` for the isolation
 * account. Calling it again on the same page re-injects LIFF as the new user (reload to apply).
 */
import { test as base, expect, type Page, type Request, type Route, type TestInfo } from "@playwright/test";
import { createMockApi, type MockScenario } from "../../../lib/client/mock";
import type { PorchaiApi, PlanActionName } from "../../../lib/client/types";
import type { NewCycleRequest } from "../../../lib/api-types";
import { addDays } from "../../../lib/calc/time";
import { CONSENT_VERSION } from "../../../lib/client/consent-version";
import { CONSENT_STORAGE_KEY } from "../../../lib/client/consent-fallback";

// ---------------------------------------------------------------- clock

export const TODAY = "2026-11-11"; // Wednesday, Thai calendar date
export const FIXED_NOW = new Date(`${TODAY}T10:00:00+07:00`);
export const dayFromToday = (n: number) => addDays(TODAY, n);
/** Baht → satang, the unit every API body uses. */
export const baht = (amount: number) => Math.round(amount * 100);

// ---------------------------------------------------------------- users

export interface E2EUser {
  key: "A" | "B";
  lineUserId: string;
  displayName: string;
  idToken: string;
  accessToken: string;
}

const LIFF_CHANNEL = "2012545254"; // public value from .env.example

function b64url(value: object | string): string {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

export function makeUser(key: "A" | "B", lineUserId: string, displayName: string): E2EUser {
  const iat = Math.floor(FIXED_NOW.getTime() / 1000);
  // Shaped like a LINE ID token (header.payload.signature). The signature is fake: only this
  // harness accepts it. The real server would reject it (see the TC-19 real-server check).
  const idToken = [
    b64url({ alg: "HS256", typ: "JWT", kid: "e2e" }),
    b64url({ iss: "https://access.line.me", sub: lineUserId, aud: LIFF_CHANNEL, iat, exp: iat + 3600, name: displayName }),
    b64url(`e2e-signature-${key}`),
  ].join(".");
  return { key, lineUserId, displayName, idToken, accessToken: `e2e-access-token-${key}-${lineUserId.slice(-6)}` };
}

/** Default tester. */
export const USER_A = makeUser("A", "U0e2e00000000000000000000000000aa", "ผู้ทดสอบ A");
/** Second account, for data isolation tests. */
export const USER_B = makeUser("B", "U0e2e00000000000000000000000000bb", "ผู้ทดสอบ B");

// ---------------------------------------------------------------- browser-side LIFF

interface LiffConfig {
  userId: string;
  displayName: string;
  idToken: string;
  accessToken: string;
  inClient: boolean;
  liffChannel: string;
  iat: number;
}

// Runs inside the page before any app script (page.addInitScript). Must be self-contained.
function installLiffMock(cfg: LiffConfig) {
  type Calls = string[];
  const w = window as unknown as { liff?: unknown; __porchaiE2ELiffCalls?: Calls };
  const calls: Calls = (w.__porchaiE2ELiffCalls = []);
  let loggedIn = true;
  let liffId: string | null = null;
  const liff = {
    __porchaiE2E: true,
    get id() {
      return liffId;
    },
    ready: Promise.resolve(),
    async init(config: { liffId?: string }) {
      calls.push("init");
      liffId = config?.liffId ?? null;
    },
    isLoggedIn: () => loggedIn,
    isInClient: () => cfg.inClient,
    login: () => {
      calls.push("login");
      loggedIn = true;
    },
    logout: () => {
      calls.push("logout");
      loggedIn = false;
    },
    getIDToken: () => (loggedIn ? cfg.idToken : null),
    getDecodedIDToken: () =>
      loggedIn
        ? { iss: "https://access.line.me", sub: cfg.userId, aud: cfg.liffChannel, iat: cfg.iat, exp: cfg.iat + 3600, name: cfg.displayName }
        : null,
    getAccessToken: () => (loggedIn ? cfg.accessToken : null),
    async getProfile() {
      calls.push("getProfile");
      return { userId: cfg.userId, displayName: cfg.displayName, pictureUrl: undefined, statusMessage: "" };
    },
    getContext: () => ({
      type: cfg.inClient ? "utou" : "external",
      viewType: "full",
      userId: cfg.userId,
      liffId,
      endpointUrl: window.location.origin,
      accessTokenHash: "e2e",
      availability: {},
      scope: ["openid", "profile"],
    }),
    getOS: () => "ios",
    getLanguage: () => "th-TH",
    getAppLanguage: () => "th",
    getVersion: () => "2.32.0",
    getLineVersion: () => "14.19.0",
    isApiAvailable: () => false,
    closeWindow: () => calls.push("closeWindow"),
    openWindow: (params: { url: string }) => calls.push(`openWindow:${params?.url ?? ""}`),
    async sendMessages() {
      calls.push("sendMessages");
    },
    async shareTargetPicker() {
      calls.push("shareTargetPicker");
      return { status: "success" };
    },
    async scanCodeV2() {
      return { value: null };
    },
    permanentLink: {
      createUrl: () => window.location.href,
      async createUrlBy(url: string) {
        return url;
      },
      setExtraQueryParam() {},
    },
    use() {
      return liff;
    },
  };
  w.liff = liff;
}

// Seeds the app's consent flag once per tab (the server has no consent API yet; see consent-fallback.ts).
function seedConsentOnce(arg: { key: string; value: string }) {
  try {
    if (window.sessionStorage.getItem("porchai.e2e.consent-seeded")) return;
    window.localStorage.setItem(arg.key, arg.value);
    window.sessionStorage.setItem("porchai.e2e.consent-seeded", "1");
  } catch {
    // storage blocked: the consent page will show, which is still a valid flow
  }
}

// ---------------------------------------------------------------- backend

export interface ApiCall {
  method: string;
  path: string;
  search: string;
  user: "A" | "B" | null;
  hasAuth: boolean;
  idempotencyKey: string | null;
  status: number;
  body: unknown;
}

interface Session {
  user: E2EUser;
  api: PorchaiApi;
}

type Ctx = { body: any; key: string; query: URLSearchParams }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (api: PorchaiApi, m: RegExpMatchArray, ctx: Ctx) => Promise<unknown>;

const dec = decodeURIComponent;
// Mirrors lib/client/live.ts (the only client) and docs/frontend-api.md.
const ROUTES: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/me$/, (a) => a.me()],
  ["DELETE", /^\/api\/me$/, async (a) => (await a.deleteMyData(), { deleted: true })],
  ["POST", /^\/api\/cycle$/, (a, _m, c) => a.createCycle(c.body)],
  ["GET", /^\/api\/summary$/, (a) => a.summary()],
  ["GET", /^\/api\/entries$/, (a) => a.entries()],
  ["POST", /^\/api\/entries$/, (a, _m, c) => a.addEntry(c.body, c.key)],
  ["PATCH", /^\/api\/entries\/([^/]+)$/, (a, m, c) => a.editEntry(dec(m[1]), c.body)],
  ["DELETE", /^\/api\/entries\/([^/]+)$/, (a, m) => a.cancelEntry(dec(m[1]))],
  ["POST", /^\/api\/cycle\/balance$/, (a, _m, c) => a.adjustBalance(c.body)],
  ["PUT", /^\/api\/cycle\/payday$/, (a, _m, c) => a.changePayday(c.body)],
  ["PUT", /^\/api\/cycle\/essentials$/, (a, _m, c) => a.setEssentials(c.body)],
  ["POST", /^\/api\/simulate$/, (a, _m, c) => a.simulate(c.body)],
  ["GET", /^\/api\/plans$/, (a) => a.plans()],
  ["POST", /^\/api\/plans$/, (a, _m, c) => a.addPlan(c.body, c.key)],
  ["POST", /^\/api\/plans\/([^/]+)\/(pay|unpay|cancel|postpone|keep)$/, (a, m, c) => a.planAction(dec(m[1]), m[2] as PlanActionName, c.body ?? undefined)],
  ["POST", /^\/api\/income$/, (a, _m, c) => a.addIncome(c.body, c.key)],
  ["GET", /^\/api\/reminders$/, (a) => a.reminderSettings()],
  ["PUT", /^\/api\/reminders$/, (a, _m, c) => a.saveReminderSettings(c.body)],
  ["GET", /^\/api\/points$/, (a) => a.points()],
  ["POST", /^\/api\/points\/claim$/, (a, _m, c) => a.claimPoints(c.key)],
  ["GET", /^\/api\/points\/history$/, (a) => a.pointsHistory()],
  ["GET", /^\/api\/points\/connection$/, (a) => a.pointsConnection()],
  ["GET", /^\/api\/rewards$/, (a) => a.rewards()],
  ["POST", /^\/api\/rewards\/([^/]+)\/redeem$/, (a, m, c) => a.redeemReward(dec(m[1]), c.key)],
  ["GET", /^\/api\/categories$/, (a) => a.spendingCategories()],
  ["PUT", /^\/api\/categories$/, (a, _m, c) => a.saveSpendingCategory(c.body)],
  ["GET", /^\/api\/insights$/, (a, _m, c) => a.spendingInsights(c.query.get("ai") === "1")],
  ["GET", /^\/api\/reports$/, (a, _m, c) => a.report((c.query.get("period") ?? "month") as "day" | "month", c.query.get("date") ?? undefined)],
  ["GET", /^\/api\/notifications\/preferences$/, (a) => a.notificationPreferences()],
  ["PUT", /^\/api\/notifications\/preferences$/, (a, _m, c) => a.saveNotificationPreferences(c.body)],
  ["POST", /^\/api\/search$/, (a, _m, c) => a.search(c.body?.query, c.body?.mode, c.body?.period)],
  ["GET", /^\/api\/bills$/, (a) => a.billSchedules()],
  ["POST", /^\/api\/bills$/, (a, _m, c) => a.createBillSchedule(c.body, c.key)],
  ["PATCH", /^\/api\/bills\/([^/]+)$/, (a, m, c) => a.updateBillSchedule(dec(m[1]), c.body)],
];

const json = (status: number, body: unknown) => ({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
const isApiError = (e: unknown): e is { status: number; code: string; message: string } =>
  typeof e === "object" && e !== null && typeof (e as { status?: unknown }).status === "number" && typeof (e as { code?: unknown }).code === "string";

export interface SeedCycle {
  balance: number; // baht
  paydayInDays: number;
  bills?: { title: string; amount: number }[]; // baht
  reservedItems?: { title: string; amount: number }[]; // baht; planned purchases already "กันไว้"
  savings?: number; // baht
  emergencyBuffer?: number; // baht
  /** Daily essentials in baht; the try-before-you-buy screen asks for it when unset. Default 0. */
  essentialsPerDay?: number | null;
}

export class FakePorchaiBackend {
  readonly calls: ApiCall[] = [];
  private readonly sessions = new Map<string, Session>();
  private readonly delays: { method: string; path: RegExp; ms: number }[] = [];

  /** Creates the account behind a user's ID token (idempotent). `fresh` = no money cycle yet. */
  register(user: E2EUser, opts: { scenario?: MockScenario } = {}): PorchaiApi {
    const existing = this.sessions.get(user.idToken);
    if (existing) return existing.api;
    // Real ids are UUIDs, unique across accounts; the prefix gives the mock the same property.
    const api = createMockApi({ today: TODAY, scenario: opts.scenario ?? "fresh", consented: true, idPrefix: `u${user.key.toLowerCase()}-` });
    this.sessions.set(user.idToken, { user, api });
    return api;
  }

  /** Direct server-side access to one user's data (seeding and assertions, never through the UI). */
  as(user: E2EUser): PorchaiApi {
    const s = this.sessions.get(user.idToken);
    if (!s) throw new Error(`user ${user.key} is not registered`);
    return s.api;
  }

  /** Creates the user's money cycle with plain baht numbers. */
  async seedCycle(user: E2EUser, seed: SeedCycle) {
    const api = this.register(user);
    const essentials = seed.essentialsPerDay === null ? undefined : { food: baht(seed.essentialsPerDay ?? 0), transport: 0 };
    const req: NewCycleRequest = {
      incomeSource: "family",
      incomeFrequency: "monthly",
      payday: dayFromToday(seed.paydayInDays),
      balance: baht(seed.balance),
      bills: (seed.bills ?? []).map((b) => ({ title: b.title, amount: baht(b.amount), status: "unpaid" as const })),
      flexibleItems: (seed.reservedItems ?? []).map((f) => ({ title: f.title, amount: baht(f.amount) })),
      ...(seed.savings ? { savingsAmount: baht(seed.savings) } : {}),
      emergencyBuffer: baht(seed.emergencyBuffer ?? 0),
      ...(essentials ? { essentials } : {}),
    };
    return (await api.createCycle(req)).summary;
  }

  /** Slows matching API calls down, e.g. a 1.5 s network for double-submit tests. */
  delay(method: string, path: RegExp, ms: number) {
    this.delays.push({ method, path, ms });
  }

  callsTo(method: string, path: RegExp): ApiCall[] {
    return this.calls.filter((c) => c.method === method && path.test(c.path));
  }

  async handle(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const headers = await req.allHeaders();
    const auth = headers["authorization"] ?? "";
    const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? null;
    const session = token ? this.sessions.get(token) : undefined;
    let body: unknown = null;
    try {
      body = req.postData() ? req.postDataJSON() : null;
    } catch {
      body = req.postData();
    }
    const call: ApiCall = {
      method,
      path: url.pathname,
      search: url.search,
      user: session?.user.key ?? null,
      hasAuth: auth !== "",
      idempotencyKey: headers["idempotency-key"] ?? null,
      status: 0,
      body,
    };
    this.calls.push(call);

    const slow = this.delays.find((d) => d.method === method && d.path.test(url.pathname));
    if (slow) await new Promise((r) => setTimeout(r, slow.ms));

    const reply = async (status: number, payload: unknown) => {
      call.status = status;
      await route.fulfill(json(status, payload)).catch(() => {}); // page may have navigated away
    };

    // Same contract as lib/auth.ts requireUser: identity comes ONLY from the verified token,
    // never from a user id in the URL, query or body.
    if (!session) return reply(401, { error: { code: "unauthorized", message: "กรุณาเข้าสู่ระบบผ่าน LINE ใหม่" } });

    const hit = ROUTES.find(([m, re]) => m === method && re.test(url.pathname));
    if (!hit) return reply(404, { error: { code: "not_found", message: "ไม่พบ API นี้" } });
    const [, re, handler] = hit;
    try {
      const out = await handler(session.api, url.pathname.match(re)!, {
        body,
        key: headers["idempotency-key"] ?? `no-key-${this.calls.length}`,
        query: url.searchParams,
      });
      return reply(200, out ?? {});
    } catch (e) {
      if (isApiError(e)) return reply(e.status, { error: { code: e.code, message: e.message } });
      return reply(500, { error: { code: "internal", message: String(e) } });
    }
  }
}

// ---------------------------------------------------------------- outbound / privacy log

export interface OutboundRequest {
  url: string;
  method: string;
  resourceType: string;
  headers: Record<string, string>;
  postData: string | null;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const isLocal = (u: string) => {
  try {
    return LOCAL_HOSTS.has(new URL(u).hostname);
  } catch {
    return true; // data:, blob:, about:
  }
};

// Stand-in for https://www.clarity.ms/tag/<id>: records every call the app makes to Clarity,
// so tests can inspect exactly what would be sent, without contacting Microsoft.
const CLARITY_STUB = `window.__clarityCalls = (window.clarity && window.clarity.q ? window.clarity.q.slice() : []);
window.clarity = function () { window.__clarityCalls.push(Array.prototype.slice.call(arguments)); };`;

// ---------------------------------------------------------------- fixtures

type Fixtures = {
  backend: FakePorchaiBackend;
  /** Every request the page made (all hosts). External ones never leave the machine. */
  outbound: OutboundRequest[];
  /** Inject LIFF as `user` (and register the account). Call before page.goto. */
  loginAs: (user: E2EUser, opts?: { consented?: boolean; inClient?: boolean }) => Promise<void>;
  /** Full-page screenshot attached to the HTML report under `label`. */
  snap: (label: string) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  backend: async ({}, use) => {
    await use(new FakePorchaiBackend());
  },

  outbound: async ({ page }, use) => {
    const log: OutboundRequest[] = [];
    page.on("request", (r: Request) => {
      log.push({ url: r.url(), method: r.method(), resourceType: r.resourceType(), headers: r.headers(), postData: r.postData() });
    });
    await use(log);
  },

  page: async ({ page, context, backend }, use, testInfo) => {
    // One clock for browser and backend: the setup screens compute "today" in the browser.
    await page.clock.setFixedTime(FIXED_NOW);
    // `next dev` floats its dev-tools badge over the bottom tab bar; hide it so taps reach the app
    // and the PM videos show the real screen. Runtime errors are still caught via `pageerror` below.
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal{display:none!important}";
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style), { once: true });
    });

    // Hermetic: nothing leaves the machine. Clarity gets a recording stub; anything else is blocked.
    await context.route(
      (url) => !isLocal(url.href),
      async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname.endsWith("clarity.ms")) {
          if (url.pathname.startsWith("/tag/")) return route.fulfill({ status: 200, contentType: "application/javascript", body: CLARITY_STUB });
          return route.fulfill({ status: 204, body: "" });
        }
        return route.abort("blockedbyclient");
      },
    );
    await page.route(
      (url) => isLocal(url.href) && url.pathname.startsWith("/api/"),
      (route) => backend.handle(route),
    );

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(`${err.name}: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await use(page);

    await attachJson(testInfo, "api-calls.json", backend.calls);
    if (consoleErrors.length) await attachJson(testInfo, "browser-console-errors.json", consoleErrors);
    if (pageErrors.length) await attachJson(testInfo, "uncaught-page-errors.json", pageErrors);
    // An uncaught exception in the app is a defect even when the flow happened to finish.
    expect(pageErrors, "uncaught JavaScript errors on the page").toEqual([]);
  },

  loginAs: async ({ page, backend }, use) => {
    await use(async (user, opts = {}) => {
      backend.register(user);
      await page.addInitScript(installLiffMock, {
        userId: user.lineUserId,
        displayName: user.displayName,
        idToken: user.idToken,
        accessToken: user.accessToken,
        inClient: opts.inClient ?? true,
        liffChannel: LIFF_CHANNEL,
        iat: Math.floor(FIXED_NOW.getTime() / 1000),
      } satisfies LiffConfig);
      if (opts.consented !== false) {
        await page.addInitScript(seedConsentOnce, {
          key: CONSENT_STORAGE_KEY,
          value: JSON.stringify({ version: CONSENT_VERSION, acceptedAt: FIXED_NOW.toISOString() }),
        });
      }
    });
  },

  snap: async ({ page }, use, testInfo) => {
    let n = 0;
    await use(async (label: string) => {
      n += 1;
      const body = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${String(n).padStart(2, "0")} · ${label}`, { body, contentType: "image/png" });
    });
  },
});

export { expect };

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, { body: JSON.stringify(value, null, 2), contentType: "application/json" });
}

// ---------------------------------------------------------------- page helpers

/** Waits for the home summary and opens the "ดูวิธีคิด" breakdown (balance / reserved / savings / buffer). */
export async function openHome(page: Page) {
  await page.goto("/app");
  await expect(page.getByTestId("today-hero")).toBeVisible();
  await expandMath(page);
}

export async function expandMath(page: Page) {
  const toggle = page.getByRole("button", { name: /ดูวิธีคิด/ });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByTestId("hero-balance")).toBeVisible();
}

/** Asserts the home hero. Values are the exact strings the app renders (formatBaht), e.g. "1,000", "78.50". */
export async function expectHero(
  page: Page,
  want: { todayRemaining?: string; daily?: string; spentToday?: string; daysLeft?: string; balance?: string; reserved?: string; savings?: string; buffer?: string },
) {
  if (want.todayRemaining !== undefined) await expect(page.getByTestId("hero-today-remaining")).toHaveText(want.todayRemaining);
  if (want.daily !== undefined) await expect(page.getByTestId("hero-budget-line")).toContainText(`จากงบวันนี้ ${want.daily} บาท ·`);
  if (want.spentToday !== undefined) await expect(page.getByTestId("hero-budget-line")).toContainText(`ใช้ไปแล้ว ${want.spentToday} บาท`);
  if (want.daysLeft !== undefined) await expect(page.getByTestId("hero-days-line")).toContainText(`อีก ${want.daysLeft} วันถึงวันเงินเข้า`);
  if (want.balance !== undefined) await expect(page.getByTestId("hero-balance")).toHaveText(`${want.balance} บาท`);
  if (want.reserved !== undefined) await expect(page.getByTestId("hero-reserved")).toHaveText(`−${want.reserved} บาท`);
  if (want.savings !== undefined) await expect(page.getByTestId("hero-savings")).toHaveText(`−${want.savings} บาท`);
  if (want.buffer !== undefined) await expect(page.getByTestId("hero-buffer")).toHaveText(`−${want.buffer} บาท`);
}
