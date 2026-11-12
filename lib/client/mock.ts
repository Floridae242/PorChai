// In-memory PorchaiApi for building and demoing screens before the backend catches up.
// Every number goes through lib/calc (computeBudget / tryOut); state transitions mirror lib/db.
import type { Entry, NewCycleRequest, Plan, Summary, UserCategory } from "@/lib/api-types";
import { computeBudget, tryOut, type BudgetInput } from "@/lib/calc/budget";
import { balanceNow, heldThisCycle, reservedTotal, savingsFromPercent, spentOnDay } from "@/lib/calc/inputs";
import { addDays } from "@/lib/calc/time";
import { ApiError } from "./errors";
import {
  CONSENT_VERSION,
  CYCLE_DAYS,
  DEFAULT_CYCLE,
  DEFAULT_TODAY,
  MID_CYCLE_ENTRIES,
  PROMO_FIXTURES,
  REWARD_FIXTURES,
  START_POINTS,
  type PromoFixture,
} from "./mock-fixtures";
import type { CategoryTotal, PlanActionName, PorchaiApi, Promo, ReminderSettings, Reward } from "./types";

// Card 23: the server sends a fingerprint of the numbers; the mock only needs it to change when they do
const mockBasis = (input: object) => JSON.stringify(input);

export type MockScenario = "fresh" | "default" | "midCycle" | "shortfall" | "tight" | "paydayPassed";

export interface MockOptions {
  today?: string;
  scenario?: MockScenario;
  separateBills?: string[]; // bill titles paid from other money (status 'separate', not held)
  consented?: boolean;
}

interface Cycle {
  payday: string;
  emergencyBuffer: number;
  savings: number;
  essentialPerDay: number | null;
  anchor: { amount: number; asOf: Date };
}

interface StoredEntry extends Entry {
  cancelledAt: Date | null;
  at: Date; // when it was logged on the mock clock; compared with the balance anchor
}

type StoredPlan = Omit<Plan, "heldThisCycle">;

const MSG_NO_CONSENT = "ต้องยินยอมก่อนใช้งาน";
const PLAN_QUOTA_LIMIT = 3; // TODO(team): real server limit undecided (3 vs 5); the mock follows 3
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MSG_NO_CYCLE = "ยังไม่ได้ตั้งรอบเงิน ตั้งค่าก่อนเริ่มใช้";

// Why a plan action is refused, by the plan's current status (same texts as lib/db/plans)
const BLOCKED: Record<Plan["status"], string> = {
  paid: "แผนนี้จ่ายแล้ว ถ้ากดผิดให้ยกเลิกการจ่ายก่อน",
  cancelled: "แผนนี้ถูกยกเลิกแล้ว",
  separate: "บิลนี้จ่ายแยกแล้ว ไม่ได้กันเงินในแอป",
  reserved: "แผนนี้ยังไม่ได้จ่าย",
  postponed: "แผนนี้ยังไม่ได้จ่าย",
};

// Deterministic 4-char uppercase alphanumeric from a string (FNV-1a)
function shortCode(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

export function createMockApi(opts: MockOptions = {}): PorchaiApi {
  const scenario = opts.scenario ?? "default";
  const today = opts.today ?? (scenario === "midCycle" ? "2026-11-15" : DEFAULT_TODAY);
  const separate = new Set(opts.separateBills ?? []);
  let consented = opts.consented ?? scenario !== "fresh";

  // Mock clock: strictly increasing, so "logged after the balance anchor" is well defined
  let tick = 0;
  const at = (day: string) => new Date(Date.parse(`${day}T12:00:00+07:00`) + ++tick * 1000);
  const now = () => at(today);

  let nextId = 0;
  const newId = (prefix: string) => `${prefix}-${++nextId}`;

  let cycle: Cycle | null = null;
  const entries: StoredEntry[] = [];
  const plans: StoredPlan[] = [];
  const entryKeys = new Map<string, string>(); // idempotency key -> entry id
  const planKeys = new Map<string, string>();
  const incomeKeys = new Set<string>();
  let reminders: ReminderSettings = { enabled: false, time: "12:30", pausedUntil: null, habits: [] };

  function pushEntry(
    amount: number,
    category: Entry["category"],
    note: string | null,
    spentOn: string,
    source: Entry["source"],
    when: Date = now(),
  ): StoredEntry {
    const e: StoredEntry = {
      id: newId("entry"),
      amount,
      category,
      note,
      spentOn,
      source,
      createdAt: when.toISOString(),
      cancelledAt: null,
      at: when,
    };
    entries.push(e);
    return e;
  }

  function pushPlan(p: Pick<StoredPlan, "kind" | "title" | "amount" | "dueOn" | "category" | "status">): StoredPlan {
    const plan: StoredPlan = { id: newId("plan"), entryId: null, createdAt: now().toISOString(), ...p };
    plans.push(plan);
    return plan;
  }

  // ---- scenarios ----
  if (scenario !== "fresh") {
    const startDay = scenario === "midCycle" ? addDays(today, -4) : today;
    const balance = scenario === "shortfall" ? 50000 : scenario === "tight" ? 144000 : DEFAULT_CYCLE.balance;
    cycle = {
      payday: scenario === "paydayPassed" ? addDays(today, -1) : addDays(startDay, CYCLE_DAYS),
      emergencyBuffer: DEFAULT_CYCLE.emergencyBuffer,
      savings: DEFAULT_CYCLE.savings,
      essentialPerDay: DEFAULT_CYCLE.essentialPerDay,
      anchor: { amount: balance, asOf: new Date(`${startDay}T00:00:00+07:00`) },
    };
    for (const b of DEFAULT_CYCLE.bills) {
      pushPlan({
        kind: "bill",
        title: b.title,
        amount: b.amount,
        dueOn: null,
        category: null,
        status: separate.has(b.title) ? "separate" : "reserved",
      });
    }
    if (scenario === "midCycle") {
      for (const e of MID_CYCLE_ENTRIES) {
        const day = addDays(startDay, e.dayOffset);
        pushEntry(e.amount, e.category, e.note, day, "form", at(day));
      }
    }
  }

  // ---- state -> budget ----
  function requireCycle(): Cycle {
    if (!consented) throw new ApiError(403, "no_consent", MSG_NO_CONSENT);
    if (!cycle) throw new ApiError(409, "no_cycle", MSG_NO_CYCLE);
    return cycle;
  }

  function inputOf(c: Cycle): BudgetInput {
    const rows = entries
      .filter((e) => e.cancelledAt === null)
      .map((e) => ({ amount: e.amount, spentOn: e.spentOn, createdAt: e.at, fromPlan: e.source === "plan" }));
    return {
      balance: balanceNow(c.anchor, rows),
      spentToday: spentOnDay(rows, today),
      emergencyBuffer: c.emergencyBuffer,
      savings: c.savings,
      reserved: reservedTotal(plans, c.payday),
      essentialPerDay: c.essentialPerDay,
      today,
      payday: c.payday,
    };
  }

  function summaryOf(c: Cycle): Summary {
    const input = inputOf(c);
    return {
      today,
      payday: c.payday,
      balance: input.balance,
      balanceAsOf: c.anchor.asOf.toISOString(),
      spentToday: input.spentToday,
      savings: input.savings,
      emergencyBuffer: input.emergencyBuffer,
      reserved: input.reserved,
      essentialPerDay: input.essentialPerDay,
      basis: mockBasis(input), // card 23: the real server sends a hash of the inputs
      budget: computeBudget(input),
    };
  }

  const publicEntry = (e: StoredEntry): Entry => ({
    id: e.id,
    amount: e.amount,
    category: e.category,
    note: e.note,
    spentOn: e.spentOn,
    source: e.source,
    createdAt: e.createdAt,
  });
  const publicPlan = (c: Cycle, p: StoredPlan): Plan => ({
    ...p,
    heldThisCycle: heldThisCycle({ status: p.status, dueOn: p.dueOn }, c.payday),
  });
  const planOut = (c: Cycle, p: StoredPlan) => ({ plan: publicPlan(c, p), summary: summaryOf(c) });

  function findEntry(id: string): StoredEntry {
    const e = entries.find((x) => x.id === id);
    if (!e) throw new ApiError(404, "not_found", "ไม่พบรายการนี้");
    return e;
  }
  function findPlan(id: string): StoredPlan {
    const p = plans.find((x) => x.id === id);
    if (!p) throw new ApiError(404, "not_found", "ไม่พบแผนนี้");
    return p;
  }

  // ---- points / promos / rewards ----
  let points = START_POINTS;
  let claimedOn: string | null = null;
  const stock = new Map(REWARD_FIXTURES.map((r) => [r.id, r.stock]));
  const redeemed = new Map<string, { balance: number; code: string }>(); // idempotency key -> result
  const claimedCodes = new Map<string, string>(); // code -> promo id
  const usedCodes = new Set<string>();

  const promoCode = (id: string) => `PC-${shortCode(id)}`;

  function promoOf(f: PromoFixture): Promo {
    let fitsBudget: boolean | null = null;
    let leftAfter: number | null = null;
    let overBy: number | null = null;
    // Money facts stay hidden until consent, like the rest of the financial surface
    if (consented && cycle) {
      const budget = computeBudget(inputOf(cycle));
      if (budget.kind === "ok") {
        leftAfter = budget.todayRemaining - f.price;
        fitsBudget = leftAfter >= 0;
        overBy = Math.max(0, f.price - budget.todayRemaining);
      }
    }
    const { id, shop, title, price, validDays, terms } = f;
    return { id, shop, title, price, validDays, terms, sponsored: true, fitsBudget, leftAfter, overBy };
  }
  function findPromo(id: string): PromoFixture {
    const f = PROMO_FIXTURES.find((p) => p.id === id);
    if (!f) throw new ApiError(404, "not_found", "ไม่พบโปรนี้");
    return f;
  }
  const quotaUsed = () =>
    plans.filter((p) => p.kind === "purchase" && (p.status === "reserved" || p.status === "paid")).length;
  const rewardOf = (r: (typeof REWARD_FIXTURES)[number]): Reward => ({ ...r, stock: stock.get(r.id) ?? 0 });

  return {
    async me() {
      return { hasActiveCycle: cycle !== null };
    },

    async createCycle(req: NewCycleRequest) {
      if (!consented) throw new ApiError(403, "no_consent", MSG_NO_CONSENT);
      const savings =
        req.savingsAmount ?? (req.savingsPercent ? savingsFromPercent(req.balance, req.savingsPercent) : 0);
      const c: Cycle = {
        payday: req.payday,
        emergencyBuffer: req.emergencyBuffer ?? 0,
        savings,
        essentialPerDay: req.essentials ? req.essentials.food + req.essentials.transport : null,
        anchor: { amount: req.balance, asOf: now() },
      };
      cycle = c;
      // The mock keeps one cycle; a new one starts clean
      entries.length = 0;
      plans.length = 0;
      for (const b of req.bills ?? []) {
        const status = b.status === "separate" || b.status === "paid" ? b.status : "reserved";
        pushPlan({ kind: "bill", title: b.title, amount: b.amount, dueOn: b.dueOn ?? null, category: null, status });
      }
      for (const f of req.flexibleItems ?? []) {
        pushPlan({
          kind: "purchase",
          title: f.title,
          amount: f.amount,
          dueOn: f.dueOn ?? null,
          category: null,
          status: "reserved",
        });
      }
      return { summary: summaryOf(c) };
    },

    async summary() {
      return summaryOf(requireCycle());
    },

    async entries() {
      requireCycle();
      return { entries: entries.filter((e) => e.cancelledAt === null).map(publicEntry).reverse() };
    },

    async addEntry(req, key) {
      const c = requireCycle();
      const known = entryKeys.get(key);
      if (known) return { entry: publicEntry(findEntry(known)), summary: summaryOf(c) };
      const spentOn = req.spentOn ?? today;
      if (!(req.amount > 0)) throw new ApiError(422, "invalid_input", "จำนวนเงินไม่ถูกต้อง");
      if (spentOn > today) throw new ApiError(422, "invalid_input", "วันที่ใช้จ่ายต้องไม่เกินวันนี้");
      const e = pushEntry(req.amount, req.category, req.note ?? null, spentOn, "form");
      entryKeys.set(key, e.id);
      return { entry: publicEntry(e), summary: summaryOf(c) };
    },

    async editEntry(id, req) {
      const c = requireCycle();
      const e = findEntry(id);
      if (e.source === "plan") {
        if (e.category === "bills") throw new ApiError(409, "plan_entry", "รายการจ่ายบิลเปลี่ยนหมวดไม่ได้");
        if (Object.keys(req).some((k) => k !== "category")) {
          throw new ApiError(409, "plan_entry", "รายการนี้มาจากการจ่ายแผน เปลี่ยนได้แค่หมวด");
        }
      }
      if (e.cancelledAt) throw new ApiError(409, "entry_cancelled", "รายการนี้ถูกยกเลิกแล้ว");
      if (req.amount !== undefined) e.amount = req.amount;
      if (req.category !== undefined) e.category = req.category;
      if (req.note !== undefined) e.note = req.note ?? null;
      if (req.spentOn !== undefined) e.spentOn = req.spentOn;
      return { entry: publicEntry(e), summary: summaryOf(c) };
    },

    async cancelEntry(id) {
      const c = requireCycle();
      const e = findEntry(id);
      if (e.source === "plan") {
        throw new ApiError(409, "plan_entry", "รายการนี้มาจากการจ่ายแผน ให้ยกเลิกการจ่ายที่แผนแทน");
      }
      e.cancelledAt ??= now(); // cancelling twice returns the same entry
      return { entry: publicEntry(e), summary: summaryOf(c) };
    },

    async adjustBalance(req) {
      const c = requireCycle();
      c.anchor = { amount: req.balance, asOf: req.asOf ? new Date(req.asOf) : now() };
      return { summary: summaryOf(c) };
    },

    async simulate(req) {
      const c = requireCycle();
      const input = inputOf(c);
      const held = plans.filter((p) => heldThisCycle({ status: p.status, dueOn: p.dueOn }, c.payday));
      const postponed = (req.postponePlanIds ?? []).map((id) => {
        const p = held.find((x) => x.id === id);
        if (!p) throw new ApiError(422, "invalid_input", "แผนที่จะลองเลื่อนไม่ได้กันเงินอยู่ในรอบนี้");
        return p;
      });
      const kept = held.filter((p) => !postponed.includes(p));
      const dueOn = req.dueOn ?? null;
      const countsThisCycle = dueOn === null || dueOn <= c.payday;
      const tried = req.essentials
        ? { ...input, essentialPerDay: req.essentials.food + req.essentials.transport }
        : input;
      const result = tryOut(tried, {
        buy: countsThisCycle ? (req.amount ?? 0) : 0,
        release: postponed.reduce((s, p) => s + p.amount, 0),
      });
      const sum = (kind: "bill" | "purchase") => kept.filter((p) => p.kind === kind).reduce((s, p) => s + p.amount, 0);
      const after = result.after;
      return {
        basis: mockBasis(input),
        ...result,
        countsThisCycle,
        checks:
          after === null
            ? null
            : {
                bills: sum("bill"),
                billsCovered: after.kind === "ok",
                essentialPerDay: tried.essentialPerDay!,
                essentialsCovered: after.kind === "ok" && after.essentialShortPerDay === 0,
                savings: tried.savings,
                emergencyBuffer: tried.emergencyBuffer,
                otherPlans: sum("purchase"),
              },
      };
    },

    async setEssentials(req) {
      const c = requireCycle();
      c.essentialPerDay = req.food + req.transport;
      return { summary: summaryOf(c) };
    },

    async plans() {
      const c = requireCycle();
      return { plans: plans.map((p) => publicPlan(c, p)) };
    },

    async addPlan(req, key) {
      const c = requireCycle();
      const known = planKeys.get(key);
      if (known) return planOut(c, findPlan(known));
      const kind = req.kind ?? "purchase";
      const status = req.status ?? "reserved";
      if (kind === "purchase" && status === "reserved" && quotaUsed() >= PLAN_QUOTA_LIMIT) {
        throw new ApiError(409, "quota_full", "ใช้สิทธิ์เก็บไว้ในแผนครบ 3 รายการแล้ว");
      }
      const p = pushPlan({
        kind,
        title: req.title,
        amount: req.amount,
        dueOn: req.dueOn ?? null,
        category: kind === "purchase" ? (req.category ?? null) : null,
        status,
      });
      planKeys.set(key, p.id);
      return planOut(c, p);
    },

    async planAction(id, action: PlanActionName, body) {
      const c = requireCycle();
      const p = findPlan(id);
      const s = p.status;
      // Asking for the state the plan is already in changes nothing
      const same =
        (action === "pay" && s === "paid") ||
        (action === "cancel" && s === "cancelled") ||
        (action === "postpone" && s === "postponed") ||
        ((action === "keep" || action === "unpay") && s === "reserved");
      if (same) return planOut(c, p);
      const blocked =
        ((action === "pay" || action === "cancel") && s !== "reserved" && s !== "postponed") ||
        (action === "postpone" && s !== "reserved") ||
        (action === "keep" && s !== "postponed") ||
        (action === "unpay" && s !== "paid");
      if (blocked) throw new ApiError(409, "plan_status", BLOCKED[s]);

      if (action === "pay") {
        const category: Entry["category"] =
          p.kind === "bill" ? "bills" : ((body?.category ?? p.category ?? "other") as UserCategory);
        p.entryId = pushEntry(p.amount, category, p.title, today, "plan").id;
        p.status = "paid";
      } else if (action === "unpay") {
        if (p.entryId) findEntry(p.entryId).cancelledAt = now();
        p.entryId = null;
        p.status = "reserved";
      } else {
        p.status = action === "cancel" ? "cancelled" : action === "postpone" ? "postponed" : "reserved";
      }
      return planOut(c, p);
    },

    async consent() {
      return { accepted: consented, version: consented ? CONSENT_VERSION : null };
    },

    async acceptConsent() {
      consented = true;
    },

    async points() {
      return { balance: points, claimedToday: claimedOn === today };
    },

    async claimPoints() {
      // Once per day, whatever the key
      if (claimedOn !== today) {
        points += 1;
        claimedOn = today;
      }
      return { balance: points, claimedToday: true };
    },

    async promos() {
      return PROMO_FIXTURES.map(promoOf);
    },

    async promo(id) {
      return promoOf(findPromo(id));
    },

    async claimPromo(id) {
      const f = findPromo(id);
      const code = promoCode(f.id);
      claimedCodes.set(code, f.id);
      return { code, expiresAt: f.expiresOn };
    },

    async rewards() {
      return REWARD_FIXTURES.map(rewardOf);
    },

    async redeemReward(id, key) {
      const again = redeemed.get(key);
      if (again) return again;
      const r = REWARD_FIXTURES.find((x) => x.id === id);
      if (!r) throw new ApiError(404, "not_found", "ไม่พบของรางวัลนี้");
      if ((stock.get(r.id) ?? 0) <= 0) throw new ApiError(409, "out_of_stock", "ของหมดแล้ว");
      if (points < r.cost) throw new ApiError(409, "not_enough_points", "แต้มไม่พอ");
      points -= r.cost;
      stock.set(r.id, (stock.get(r.id) ?? 0) - 1);
      const result = { balance: points, code: `RW-${shortCode(`${r.id}:${key}`)}` };
      redeemed.set(key, result);
      return result;
    },

    async addIncome(req, key) {
      const c = requireCycle();
      if (incomeKeys.has(key)) return { summary: summaryOf(c) };
      const receivedOn = req.receivedOn ?? today;
      if (!(req.amount > 0)) throw new ApiError(422, "invalid_input", "จำนวนเงินไม่ถูกต้อง");
      if (receivedOn > today) throw new ApiError(422, "invalid_input", "วันที่รับเงินต้องไม่เกินวันนี้");
      // Income raises the money on hand: shift the balance anchor (entries after it still come off)
      c.anchor = { ...c.anchor, amount: c.anchor.amount + req.amount };
      incomeKeys.add(key);
      return { summary: summaryOf(c) };
    },

    async dailySpend() {
      const c = requireCycle();
      const rows = entries
        .filter((e) => e.cancelledAt === null)
        .map((e) => ({ amount: e.amount, spentOn: e.spentOn, createdAt: e.at, fromPlan: e.source === "plan" }));
      const budget = computeBudget(inputOf(c));
      const start = addDays(c.payday, -CYCLE_DAYS);
      const days = [];
      for (let date = start; date < c.payday; date = addDays(date, 1)) {
        const spent = date > today ? null : spentOnDay(rows, date);
        days.push({ date, spent, over: spent !== null && budget.kind === "ok" && spent > budget.dailyBudget });
      }
      return { days };
    },

    async categoryTotals() {
      requireCycle();
      const by = new Map<Entry["category"], CategoryTotal>();
      for (const e of entries) {
        if (e.cancelledAt !== null) continue;
        const t = by.get(e.category) ?? { category: e.category, amount: 0, count: 0 };
        t.amount += e.amount;
        t.count += 1;
        by.set(e.category, t);
      }
      return { items: [...by.values()].sort((a, b) => b.amount - a.amount) };
    },

    async planQuota() {
      if (!consented) throw new ApiError(403, "no_consent", MSG_NO_CONSENT);
      return { used: quotaUsed(), limit: PLAN_QUOTA_LIMIT };
    },

    async reminderSettings() {
      if (!consented) throw new ApiError(403, "no_consent", MSG_NO_CONSENT);
      return { ...reminders, habits: [...reminders.habits] };
    },

    async saveReminderSettings(req) {
      if (!consented) throw new ApiError(403, "no_consent", MSG_NO_CONSENT);
      if (!HHMM.test(req.time)) throw new ApiError(422, "invalid_input", "เวลาไม่ถูกต้อง");
      reminders = { enabled: req.enabled, time: req.time, pausedUntil: req.pausedUntil, habits: reminders.habits };
      return { ...reminders, habits: [...reminders.habits] };
    },

    async deleteMyData() {
      if (!consented) throw new ApiError(403, "no_consent", MSG_NO_CONSENT);
      consented = false;
      cycle = null;
      entries.length = 0;
      plans.length = 0;
      entryKeys.clear();
      planKeys.clear();
      incomeKeys.clear();
      reminders = { enabled: false, time: "12:30", pausedUntil: null, habits: [] };
      points = START_POINTS;
      claimedOn = null;
      for (const r of REWARD_FIXTURES) stock.set(r.id, r.stock);
      redeemed.clear();
      claimedCodes.clear();
      usedCodes.clear();
    },

    async shopRedeem(code) {
      const promoId = claimedCodes.get(code);
      if (!promoId) return { status: "invalid" };
      const f = findPromo(promoId);
      if (today > f.expiresOn) return { status: "expired", promoTitle: f.title };
      if (usedCodes.has(code)) return { status: "already_redeemed", promoTitle: f.title };
      usedCodes.add(code);
      return { status: "redeemed", promoTitle: f.title };
    },
  };
}
