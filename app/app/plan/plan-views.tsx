"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { useToast } from "@/components/shell/toast";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { InputField } from "@/components/ui/input-field";
import { ListRow } from "@/components/ui/list-row";
import { Mascot } from "@/components/ui/mascot";
import type { Entry, Plan, Summary } from "@/lib/api-types";
import { ApiError } from "@/lib/client/errors";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import type { PlanActionName, PlanQuota } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht, parseBahtInput, satangToInputString } from "@/lib/format/money";

const MSG_NOT_READY = "ยังไม่พร้อมใช้งาน";

export type PlanSubTab = "list" | "pending" | "savings";

const TABS = [
  { key: "list", label: "รายการ" },
  { key: "pending", label: "รอจ่าย" },
  { key: "savings", label: "ออม/เผื่อ" },
] as const;

const TAB_PANEL_ID = "plan-tabpanel";
const tabId = (key: PlanSubTab) => `plan-tab-${key}`;

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function isCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code;
}

// The row-menu entries per docs/frontend-api.md 3.2. "ยกเลิกการจ่าย" is only ever offered for a paid
// plan and only from this menu, never next to the visible "จ่ายแล้ว" button.
function menuActions(plan: Plan): { action: PlanActionName; label: string }[] {
  if (plan.status === "paid") return [{ action: "unpay", label: "ยกเลิกการจ่าย" }];
  if (plan.kind === "bill") return [];
  if (plan.status === "reserved") {
    return [
      { action: "postpone", label: "เลื่อนไปรอบหน้า" },
      { action: "cancel", label: "ยกเลิก" },
    ];
  }
  if (plan.status === "postponed") {
    return [
      { action: "keep", label: "เก็บไว้ในแผน" },
      { action: "cancel", label: "ยกเลิก" },
    ];
  }
  return [];
}

const ACTION_TOASTS: Record<PlanActionName, string> = {
  pay: "จ่ายแล้ว ✓",
  unpay: "ยกเลิกการจ่ายแล้ว",
  cancel: "ยกเลิกรายการในแผนแล้ว",
  postpone: "เลื่อนไปรอบหน้าแล้ว",
  keep: "เก็บไว้ในแผนแล้ว",
};

function PlanRow({
  plan,
  busy,
  menuOpen,
  onToggleMenu,
  onAction,
}: {
  plan: Plan;
  busy: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onAction: (plan: Plan, action: PlanActionName) => void;
}) {
  const items = menuActions(plan);
  const isBill = plan.kind === "bill";
  const status =
    plan.status === "reserved"
      ? isBill
        ? "ยังไม่จ่าย · กันเงินไว้แล้ว"
        : "เก็บไว้ในแผน · หักจากงบรอบนี้แล้ว"
      : plan.status === "postponed"
        ? `รอจ่าย · ${plan.dueOn ? formatThaiDate(plan.dueOn, "short") : "รอบหน้า"} (รอบหน้า)`
        : plan.status === "paid"
          ? "จ่ายแล้ว ✓"
          : plan.status === "separate"
            ? "จ่ายแยก · ไม่หักงบ"
            : "ยกเลิกแล้ว";
  const menuId = `plan-menu-${plan.id}`;

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary">{plan.title}</p>
          <p className="text-xs text-secondary">{status}</p>
        </div>
        <span className="text-sm font-bold tabular-nums text-primary">{formatBaht(plan.amount)} บาท</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {plan.status === "reserved" ? (
          <Button variant={isBill ? "secondary" : "primary"} busy={busy} onClick={() => onAction(plan, "pay")}>
            จ่ายแล้ว
          </Button>
        ) : null}
        {items.length > 0 ? (
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={`แก้แผน ${plan.title}`}
            disabled={busy}
            onClick={onToggleMenu}
            className="inline-flex h-11 items-center rounded-pill px-3 text-sm font-semibold text-link outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] disabled:opacity-40"
          >
            แก้แผน {menuOpen ? "▴" : "▾"}
          </button>
        ) : null}
      </div>

      {menuOpen && items.length > 0 ? (
        <div id={menuId} className="flex flex-wrap gap-2 rounded-sm bg-subtle p-2">
          {items.map((it) => (
            <Button key={it.action} variant="secondary" disabled={busy} onClick={() => onAction(plan, it.action)}>
              {it.label}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function PlanMainView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const paramTab = searchParams?.get("tab");
  const urlTab: PlanSubTab = paramTab === "pending" || paramTab === "savings" ? paramTab : "list";

  const [selectedTab, setSelectedTab] = useState<PlanSubTab | null>(null);
  const tab = selectedTab ?? urlTab;

  const [filter, setFilter] = useState<"all" | "expense" | "income">("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [quota, setQuota] = useState<PlanQuota | null>(null); // null = unknown: show nothing about it
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Per-plan in-flight guard. A ref (not state) so two taps in the same tick cannot both pass; it is
  // released after every outcome because the row stays on screen and can be acted on again.
  const inFlight = useRef<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.summary(), api.entries(), api.plans()])
      .then(([s, e, p]) => {
        if (cancelled) return;
        setSummary(s);
        setEntries(e.entries);
        setPlans(p.plans);
        setLoadState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        // Redirects keep the neutral loading state: no error flash while navigating.
        if (isCode(err, "no_cycle")) {
          router.replace("/app/setup/income");
          return;
        }
        if (isCode(err, "no_consent")) {
          router.replace("/app/consent");
          return;
        }
        setLoadError(errorText(err, "โหลดข้อมูลแผนเงินไม่สำเร็จ ลองใหม่อีกครั้ง"));
        setLoadState("error");
      });
    api
      .planQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {
        // not implemented / failed: no quota banner, no counter
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt]);

  async function handlePlanAction(plan: Plan, action: PlanActionName) {
    if (inFlight.current.has(plan.id)) return;
    inFlight.current.add(plan.id);
    setBusyId(plan.id);
    setActionError(null);
    setMenuOpenId(null);
    try {
      // pay: the plan's own category when it has one (none = the server's default)
      const body = action === "pay" && plan.kind === "purchase" && plan.category ? { category: plan.category } : null;
      const res = body ? await api.planAction(plan.id, action, body) : await api.planAction(plan.id, action);
      setPlans((prev) => prev.map((p) => (p.id === res.plan.id ? res.plan : p)));
      setSummary(res.summary);
      toast.show(ACTION_TOASTS[action], action === "pay" ? { mascot: "budgetOk" } : undefined);
      if (action === "pay" || action === "unpay") {
        // The spend list changed; a failed refresh is not a failed action.
        api
          .entries()
          .then((e) => setEntries(e.entries))
          .catch(() => {});
      }
      api
        .planQuota()
        .then(setQuota)
        .catch(() => {});
    } catch (err) {
      setActionError(errorText(err, "ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง"));
    } finally {
      inFlight.current.delete(plan.id);
      setBusyId(null);
    }
  }

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length].key;
    setSelectedTab(next);
    document.getElementById(tabId(next))?.focus();
  }

  const purchasePlans = plans.filter((p) => p.kind === "purchase" && p.status !== "cancelled");
  const billPlans = plans.filter((p) => p.kind === "bill");

  // API entries are expenses only: the income filter shows the normal empty state.
  const filteredEntries = filter === "income" ? [] : entries;

  return (
    <main className="flex flex-col gap-4 py-4 font-body">
      <div
        style={{ backgroundImage: "var(--hero-gradient)" }}
        className="flex flex-col gap-3 rounded-md px-5 py-4 text-on-hero"
      >
        <AppHeader title="แผนเงิน" tone="onDark" />
        <div role="tablist" aria-label="ส่วนของแผนเงิน" className="grid h-10 grid-cols-3 gap-1 rounded-pill bg-white/15 p-[3px]">
          {TABS.map((item, index) => (
            <button
              key={item.key}
              id={tabId(item.key)}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              aria-controls={TAB_PANEL_ID}
              tabIndex={tab === item.key ? 0 : -1}
              onClick={() => setSelectedTab(item.key)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
              className={`h-[34px] rounded-pill text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white ${
                tab === item.key ? "bg-action-primary text-on-action" : "text-on-hero"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div id={TAB_PANEL_ID} role="tabpanel" aria-labelledby={tabId(tab)} className="flex flex-col gap-4">
        {loadState === "loading" ? (
          <div className="flex flex-col gap-3 py-2" aria-busy="true">
            <p className="text-sm text-secondary">กำลังโหลดข้อมูลแผนเงิน…</p>
            <div aria-hidden="true" className="h-16 rounded-md bg-subtle motion-safe:animate-pulse" />
            <div aria-hidden="true" className="h-16 rounded-md bg-subtle motion-safe:animate-pulse" />
          </div>
        ) : loadState === "error" ? (
          <div className="flex flex-col gap-3">
            <Banner kind="error" text={loadError ?? "โหลดข้อมูลแผนเงินไม่สำเร็จ"} />
            <Button
              variant="primary"
              block
              onClick={() => {
                setLoadState("loading");
                setLoadError(null);
                setAttempt((n) => n + 1);
              }}
            >
              ลองใหม่
            </Button>
          </div>
        ) : tab === "list" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
                ทั้งหมด
              </Chip>
              <Chip selected={filter === "expense"} onClick={() => setFilter("expense")}>
                รายจ่าย
              </Chip>
              <Chip selected={filter === "income"} onClick={() => setFilter("income")}>
                รายรับ
              </Chip>
            </div>

            {filteredEntries.length === 0 ? (
              <EmptyState
                title="ยังไม่มีรายการในหมวดนี้"
                body="กดปุ่ม ＋ จด ด้านล่างเพื่อบันทึกรายจ่ายหรือรายรับของคุณ"
                mascotPose="greeting"
              />
            ) : (
              <section className="divide-y divide-line rounded-md border border-line bg-card px-4">
                {filteredEntries.map((entry) => (
                  <ListRow
                    key={entry.id}
                    title={entry.note ?? CATEGORY_LABELS[entry.category]}
                    subtitle={`${CATEGORY_LABELS[entry.category]} · ${formatThaiDate(entry.spentOn, "short")}`}
                    amount={`−${formatBaht(entry.amount)} บาท`}
                    href={`/app/record/${entry.id}`}
                  />
                ))}
              </section>
            )}
          </div>
        ) : tab === "pending" ? (
          <div className="flex flex-col gap-4">
            {quota && quota.used >= quota.limit ? (
              <Banner
                kind="info"
                text={`ใช้สิทธิ์แผนฟรีแล้ว ${quota.used}/${quota.limit} ในรอบนี้`}
                action={{ label: "ดู Plus ›", href: "/app/plus" }}
              />
            ) : null}

            {actionError ? <Banner kind="error" text={actionError} /> : null}

            <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-primary">รายการที่เก็บไว้ในแผน</h2>
                {quota ? (
                  <span className="text-xs text-secondary">
                    {quota.used}/{quota.limit} รายการฟรี
                  </span>
                ) : null}
              </div>

              {purchasePlans.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีของที่เก็บไว้ในแผน"
                  body="ใช้ฟีเจอร์ลองก่อนจ่ายเพื่อเช็กผลกระทบและกันเงินไว้ล่วงหน้าได้"
                  mascotPose="saveCoins"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {purchasePlans.map((plan) => (
                    <PlanRow
                      key={plan.id}
                      plan={plan}
                      busy={busyId === plan.id}
                      menuOpen={menuOpenId === plan.id}
                      onToggleMenu={() => setMenuOpenId((cur) => (cur === plan.id ? null : plan.id))}
                      onAction={handlePlanAction}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-primary">บิลประจำในรอบนี้</h2>
                <Link href="/app/settings/bills" className="text-xs font-semibold text-link">
                  จัดการบิล ›
                </Link>
              </div>
              <ul className="divide-y divide-line">
                {billPlans.map((bill) => (
                  <PlanRow
                    key={bill.id}
                    plan={bill}
                    busy={busyId === bill.id}
                    menuOpen={menuOpenId === bill.id}
                    onToggleMenu={() => setMenuOpenId((cur) => (cur === bill.id ? null : bill.id))}
                    onAction={handlePlanAction}
                  />
                ))}
              </ul>
            </section>

            <Link href="/app/try" className={buttonClass("primary", true)}>
              ลองก่อนจ่าย
            </Link>
          </div>
        ) : summary ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-md border border-line-strong bg-card p-5">
              <h2 className="text-base font-semibold text-primary">เงินออม + เงินเผื่อรอบนี้</h2>
              <p className="text-xs text-secondary">
                หักไว้ตั้งแต่ต้นรอบ ไม่นับในงบใช้จ่ายรายวัน และแอปจะไม่ดึงมาใช้ซื้อของ
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-sm bg-subtle p-3">
                  <span className="text-xs text-secondary">เป้าออมรอบนี้</span>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatBaht(summary.savings)} บาท</p>
                </div>
                <div className="rounded-sm bg-subtle p-3">
                  <span className="text-xs text-secondary">เงินเผื่อฉุกเฉิน</span>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                    {formatBaht(summary.emergencyBuffer)} บาท
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
                <span className="text-secondary">ค่าใช้จ่ายจำเป็นต่อวัน</span>
                <span className="font-semibold tabular-nums text-primary">
                  {summary.essentialPerDay !== null ? `${formatBaht(summary.essentialPerDay)} บาท/วัน` : "ยังไม่ตั้ง"}
                </span>
              </div>
            </section>

            <Link href="/app/settings/savings" className={buttonClass("primary", true)}>
              ปรับเงินออม / เงินเผื่อ
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- E1

export function PlanEditView() {
  const router = useRouter();
  const [reason, setReason] = useState<"balance" | "payday" | "income">("balance");
  const [notReady, setNotReady] = useState(false);

  function handleContinue() {
    if (reason === "balance") {
      router.push("/app/balance/adjust");
    } else if (reason === "payday") {
      // E1a: there is no API to move the payday of a running cycle yet (docs 7). Do not route to the
      // setup flow: POST /api/cycle would answer cycle_exists.
      setNotReady(true);
    } else {
      // E1b: the income form reports ยังไม่พร้อมใช้งาน itself while addIncome is not_implemented.
      router.push("/app/record/new?type=income");
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="แก้แผน" back="/app" tone="default" />

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">ต้องการแก้เรื่องไหน</h2>

        {(
          [
            {
              key: "balance",
              title: "ปรับยอดให้ตรงเงินจริง",
              desc: "เงินในกระเป๋าหรือบัญชีตอนนี้ไม่ตรงกับในแอป",
            },
            {
              key: "payday",
              title: "เปลี่ยนวันเงินเข้า",
              desc: "เงินเดือนหรือเงินทางบ้านเลื่อนวันเข้าเร็วขึ้นหรือช้าลง",
            },
            {
              key: "income",
              title: "เพิ่มรายรับนอกรอบ",
              desc: "ได้เงินพิเศษเพิ่มระหว่างรอบ เช่น ค่าจ้างงานพิเศษ",
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.key}
            className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3.5 text-sm ${
              reason === opt.key ? "border-line-strong bg-selected" : "border-line bg-card"
            }`}
          >
            <input
              type="radio"
              name="editReason"
              checked={reason === opt.key}
              onChange={() => {
                setReason(opt.key);
                setNotReady(false);
              }}
              className="mt-1 size-4 accent-[var(--green-700)]"
            />
            <div>
              <p className="font-semibold text-primary">{opt.title}</p>
              <p className="text-xs text-secondary">{opt.desc}</p>
            </div>
          </label>
        ))}
      </section>

      {notReady ? <Banner kind="info" text={`${MSG_NOT_READY} — ตอนนี้ยังเปลี่ยนวันเงินเข้าไม่ได้`} /> : null}

      <Button variant="primary" block onClick={handleContinue}>
        ไปกรอกข้อมูล
      </Button>
    </main>
  );
}

// ---------------------------------------------------------------- E4

export function BalanceAdjustView() {
  const api = useApi();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [balanceText, setBalanceText] = useState("");
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null); // amount field
  const [saveError, setSaveError] = useState<string | null>(null); // server
  const { submit, busy } = useSubmit<Summary>();

  useEffect(() => {
    let cancelled = false;
    api
      .summary()
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        // The input takes a positive amount: a balance that is zero or below is not put in it.
        if (s.balance > 0) setBalanceText(satangToInputString(s.balance));
      })
      .catch((err) => {
        if (cancelled) return;
        if (isCode(err, "no_cycle")) {
          router.replace("/app/setup/income");
          return;
        }
        setLoadError(errorText(err, "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt]);

  async function handleSave() {
    const parsed = parseBahtInput(balanceText);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setError(null);
    setSaveError(null);
    const res = await submit(parsed.satang, async () => (await api.adjustBalance({ balance: parsed.satang })).summary);
    if (res.ok) {
      // busy stays true: no second tap after success. Numbers shown are the server's.
      setResult(res.value);
    } else if (!("skipped" in res)) {
      setSaveError(errorText(res.error, "ปรับยอดไม่สำเร็จ ลองใหม่อีกครั้ง"));
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ปรับยอดให้ตรงเงินจริง" back="/app" tone="default" />

      {result ? (
        <section className="flex flex-col items-center gap-4 rounded-md border border-line-strong bg-card p-6 text-center">
          <Mascot pose="budgetOk" size={72} />
          <h2 className="font-display text-3xl text-primary">ปรับยอดแล้ว ✓</h2>
          <p className="text-sm text-secondary">
            ยอดเงินจริงปัจจุบันคือ {formatBaht(result.balance)} บาท
            {result.budget.kind === "ok" ? ` · งบต่อวันใหม่คือ ${formatBaht(result.budget.dailyBudget)} บาท/วัน` : ""}
          </p>
          <Link href="/app" className={buttonClass("primary", true)}>
            กลับหน้าสรุป
          </Link>
        </section>
      ) : loadError ? (
        <>
          <Banner kind="error" text={loadError} />
          <Button
            variant="primary"
            block
            onClick={() => {
              setLoadError(null);
              setAttempt((n) => n + 1);
            }}
          >
            ลองใหม่
          </Button>
        </>
      ) : !summary ? (
        <p className="py-8 text-sm text-secondary" aria-busy="true">
          กำลังโหลด…
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
            <p className="text-xs text-secondary">
              ยอดในแอปตอนนี้: <strong className="text-primary">{formatBaht(summary.balance)} บาท</strong>
            </p>
            <InputField
              label="เงินที่มีอยู่จริงตอนนี้ (บาท)"
              inputMode="decimal"
              placeholder="เช่น 2300"
              value={balanceText}
              onChange={(e) => {
                setBalanceText(e.target.value);
                if (error) setError(null);
              }}
              state={error ? "error" : balanceText ? "filled" : "default"}
              helper={error ?? "ระบบจะคำนวณงบรายวันใหม่จากยอดเงินจริงนี้ทันที"}
            />
          </section>

          {saveError ? <Banner kind="error" text={saveError} /> : null}

          <Button variant="primary" block busy={busy} onClick={handleSave}>
            ยืนยันปรับยอด
          </Button>
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- B4

export function NewCycleConfirmView() {
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="เริ่มรอบเงินใหม่" back="/app" tone="default" />

      <section className="flex flex-col items-center gap-3 rounded-md border border-line bg-card p-6 text-center">
        <Mascot pose="greeting" size={72} />
        <h2 className="font-display text-2xl text-primary">ถึงวันเงินเข้าแล้ว เริ่มรอบใหม่กันเลย</h2>
        <p className="text-sm text-secondary">
          ตรวจสอบยอดเงินรอบใหม่ บิลประจำ และเป้าออม เพื่อเริ่มคำนวณงบรายวันของรอบถัดไป
        </p>
        <div className="flex w-full flex-col gap-2 pt-2">
          <Link href="/app/setup/income" className={buttonClass("primary", true)}>
            ตั้งค่ารอบเงินใหม่
          </Link>
          <Link href="/app" className={buttonClass("ghost", true)}>
            ไว้ทีหลัง
          </Link>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------- C5

// Only wording that exists in Figma C5: the quota line and the two buttons "ซื้อ Plus 29 บาท" / "ไว้ก่อน".
// There is no purchase API, so buying says ยังไม่พร้อมใช้งาน. C6/C7 were not read from Figma.
export function PlusView() {
  const api = useApi();
  const [quota, setQuota] = useState<PlanQuota | null>(null);
  const [notReady, setNotReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .planQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {
        // not implemented / failed: no quota line
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="พอใช้ Plus" back="/app" tone="default" />

      {quota && quota.used >= quota.limit ? (
        <Banner kind="info" text={`รอบนี้ใช้สิทธิ์แผนฟรีครบแล้ว (${quota.used}/${quota.limit})`} />
      ) : null}

      {notReady ? <Banner kind="info" text={`${MSG_NOT_READY} — ตอนนี้ยังซื้อ Plus ไม่ได้`} /> : null}

      <div className="flex flex-col gap-4">
        <Button variant="primary" block onClick={() => setNotReady(true)}>
          ซื้อ Plus 29 บาท
        </Button>
        <Link href="/app" className={buttonClass("secondary", true)}>
          ไว้ก่อน
        </Link>
      </div>
    </main>
  );
}
