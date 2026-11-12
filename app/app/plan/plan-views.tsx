"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
import { CATEGORY_LABELS, summarizeCategories } from "@/lib/client/summary-helpers";
import { useApi } from "@/lib/client/use-api";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht, parseBahtInput } from "@/lib/format/money";

export type PlanSubTab = "list" | "pending" | "savings";

export function PlanMainView() {
  const api = useApi();
  const searchParams = useSearchParams();
  const toast = useToast();

  const paramTab = searchParams?.get("tab");
  const urlTab: PlanSubTab =
    paramTab === "pending" || paramTab === "savings" ? paramTab : "list";

  const [selectedTab, setSelectedTab] = useState<PlanSubTab | null>(null);
  const tab = selectedTab ?? urlTab;
  const setTab = (next: PlanSubTab) => setSelectedTab(next);

  const [filter, setFilter] = useState<"all" | "expense" | "income">("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.summary(), api.entries(), api.plans()])
      .then(([s, e, p]) => {
        if (cancelled) return;
        setSummary(s);
        setEntries(e.entries);
        setPlans(p.plans);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function handlePlanAction(id: string, action: "pay" | "postpone" | "cancel" | "keep") {
    setBusyPlanId(id);
    try {
      const res = await api.planAction(id, action);
      setSummary(res.summary);
      const [e, p] = await Promise.all([api.entries(), api.plans()]);
      setEntries(e.entries);
      setPlans(p.plans);
      if (action === "pay") toast.show("ยืนยันจ่ายจริงแล้ว ✓", { mascot: "budgetOk" });
      if (action === "postpone") toast.show("เลื่อนไปรอบหน้าแล้ว");
      if (action === "cancel") toast.show("ยกเลิกรายการในแผนแล้ว");
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusyPlanId(null);
    }
  }

  const purchasePlans = plans.filter((p) => p.kind === "purchase" && p.status !== "cancelled");
  const reservedPurchases = purchasePlans.filter((p) => p.status === "reserved");
  const billPlans = plans.filter((p) => p.kind === "bill");

  const filteredEntries =
    filter === "income" ? [] : entries; // API entries are expenses

  return (
    <main className="flex flex-col gap-4 py-4 font-body">
      <div
        style={{ backgroundImage: "var(--hero-gradient)" }}
        className="flex flex-col gap-3 rounded-md px-5 py-4 text-on-hero"
      >
        <AppHeader title="แผนเงิน" tone="onDark" />
        <div role="tablist" aria-label="ส่วนของแผนเงิน" className="grid grid-cols-3 gap-1 rounded-pill bg-white/15 p-1">
          {(
            [
              { key: "list", label: "รายการ" },
              { key: "pending", label: "รอจ่าย" },
              { key: "savings", label: "ออม/เผื่อ" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-pill py-1.5 text-xs font-semibold ${
                tab === item.key ? "bg-action-primary text-on-action" : "text-on-hero"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-sm text-secondary" aria-busy="true">
          กำลังโหลดข้อมูลแผนเงิน…
        </p>
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
          {reservedPurchases.length >= 3 ? (
            <Banner
              kind="info"
              text="ใช้สิทธิ์แผนฟรีแล้ว 3/3 รายการในรอบนี้"
              action={{ label: "ดู Plus ›", href: "/app/plus" }}
            />
          ) : null}

          <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-primary">รายการที่เก็บไว้ในแผน</h2>
              <span className="text-xs text-secondary">{reservedPurchases.length}/3 รายการฟรี</span>
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
                  <li key={plan.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-primary">{plan.title}</p>
                        <p className="text-xs text-secondary">
                          {plan.status === "reserved"
                            ? "เก็บไว้ในแผน · หักจากงบรอบนี้แล้ว"
                            : plan.status === "postponed"
                              ? `รอจ่าย · ${plan.dueOn ? formatThaiDate(plan.dueOn, "short") : "รอบหน้า"} (รอบหน้า)`
                              : "ยืนยันจ่ายจริงแล้ว ✓"}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-primary">
                        {formatBaht(plan.amount)} บาท
                      </span>
                    </div>

                    {plan.status === "reserved" || plan.status === "postponed" ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="primary"
                          busy={busyPlanId === plan.id}
                          onClick={() => handlePlanAction(plan.id, "pay")}
                        >
                          ยืนยันจ่ายจริง
                        </Button>
                        {plan.status === "reserved" ? (
                          <Button
                            variant="secondary"
                            disabled={busyPlanId === plan.id}
                            onClick={() => handlePlanAction(plan.id, "postpone")}
                          >
                            เลื่อนไปรอบหน้า
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            disabled={busyPlanId === plan.id}
                            onClick={() => handlePlanAction(plan.id, "keep")}
                          >
                            ดึงกลับมารอบนี้
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          disabled={busyPlanId === plan.id}
                          onClick={() => handlePlanAction(plan.id, "cancel")}
                        >
                          ยกเลิก
                        </Button>
                      </div>
                    ) : null}
                  </li>
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
                <li key={bill.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-primary">{bill.title}</p>
                    <p className="text-xs text-secondary">
                      {bill.status === "paid"
                        ? "จ่ายแล้ว ✓"
                        : bill.status === "separate"
                          ? "จ่ายแยก · ไม่หักงบ"
                          : "ยังไม่จ่าย · กันเงินไว้แล้ว"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-primary">
                      {formatBaht(bill.amount)} บาท
                    </span>
                    {bill.status === "reserved" ? (
                      <button
                        type="button"
                        disabled={busyPlanId === bill.id}
                        onClick={() => handlePlanAction(bill.id, "pay")}
                        className="rounded-pill border border-line-strong bg-subtle px-3 py-1 text-xs font-semibold text-link"
                      >
                        จ่ายแล้ว
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <Link href="/app/try" className={buttonClass("primary", true)}>
            ลองก่อนจ่าย
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-md border border-line-strong bg-card p-5">
            <h2 className="text-base font-semibold text-primary">เงินออม + เงินเผื่อรอบนี้</h2>
            <p className="text-xs text-secondary">
              หักไว้ตั้งแต่ต้นรอบ ไม่นับในงบใช้จ่ายรายวัน และแอปจะไม่ดึงมาใช้ซื้อของ
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-sm bg-subtle p-3">
                <span className="text-xs text-secondary">เป้าออมรอบนี้</span>
                <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                  {summary ? formatBaht(summary.savings) : "0"} บาท
                </p>
              </div>
              <div className="rounded-sm bg-subtle p-3">
                <span className="text-xs text-secondary">เงินเผื่อฉุกเฉิน</span>
                <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                  {summary ? formatBaht(summary.emergencyBuffer) : "0"} บาท
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-secondary">ค่าใช้จ่ายจำเป็นต่อวัน</span>
              <span className="font-semibold tabular-nums text-primary">
                {summary?.essentialPerDay !== null && summary?.essentialPerDay !== undefined
                  ? `${formatBaht(summary.essentialPerDay)} บาท/วัน`
                  : "ยังไม่ตั้ง"}
              </span>
            </div>
          </section>

          <Link href="/app/settings/savings" className={buttonClass("primary", true)}>
            ปรับเงินออม / เงินเผื่อ
          </Link>
        </div>
      )}
    </main>
  );
}

export function PlanEditView() {
  const router = useRouter();
  const [reason, setReason] = useState<"balance" | "payday" | "income">("balance");

  function handleContinue() {
    if (reason === "balance") {
      router.push("/app/balance/adjust");
    } else if (reason === "payday") {
      router.push("/app/setup/income");
    } else {
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
              onChange={() => setReason(opt.key)}
              className="mt-1 size-4 accent-[var(--green-700)]"
            />
            <div>
              <p className="font-semibold text-primary">{opt.title}</p>
              <p className="text-xs text-secondary">{opt.desc}</p>
            </div>
          </label>
        ))}
      </section>

      <Button variant="primary" block onClick={handleContinue}>
        ไปกรอกข้อมูล
      </Button>
    </main>
  );
}

export function BalanceAdjustView() {
  const api = useApi();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [balanceText, setBalanceText] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .summary()
      .then((s) => {
        setSummary(s);
        setBalanceText(formatBaht(s.balance).replace(/,/g, ""));
      })
      .catch(() => {});
  }, [api]);

  async function handleSave() {
    const parsed = parseBahtInput(balanceText);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.adjustBalance({ balance: parsed.satang });
      setSummary(res.summary);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ปรับยอดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ปรับยอดให้ตรงเงินจริง" back="/app" tone="default" />

      {done && summary ? (
        <section className="flex flex-col items-center gap-4 rounded-md border border-line-strong bg-card p-6 text-center">
          <Mascot pose="budgetOk" size={72} />
          <h2 className="font-display text-3xl text-primary">ปรับยอดแล้ว ✓</h2>
          <p className="text-sm text-secondary">
            ยอดเงินจริงปัจจุบันคือ {formatBaht(summary.balance)} บาท
            {summary.budget.kind === "ok"
              ? ` · งบต่อวันใหม่คือ ${formatBaht(summary.budget.dailyBudget)} บาท/วัน`
              : ""}
          </p>
          <Link href="/app" className={buttonClass("primary", true)}>
            กลับหน้าสรุป
          </Link>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
            {summary ? (
              <p className="text-xs text-secondary">
                ยอดในแอปตอนนี้: <strong className="text-primary">{formatBaht(summary.balance)} บาท</strong>
              </p>
            ) : null}
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

          <Button variant="primary" block busy={busy} onClick={handleSave}>
            ยืนยันปรับยอด
          </Button>
        </>
      )}
    </main>
  );
}

export function CategoriesSummaryView() {
  const api = useApi();
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    api
      .entries()
      .then((res) => setEntries(res.entries))
      .catch(() => {});
  }, [api]);

  const cats = summarizeCategories(entries);

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="สรุปหมวดหมู่" back="/app" tone="default" />

      {cats.length === 0 ? (
        <EmptyState
          title="ยังไม่มีข้อมูลใช้จ่ายแยกตามหมวด"
          body="เมื่อคุณจดรายการใช้จ่าย ระบบจะสรุปยอดแต่ละหมวดหมู่ให้ที่นี่"
          mascotPose="greeting"
        />
      ) : (
        <section className="divide-y divide-line rounded-md border border-line bg-card px-4">
          {cats.map((c) => (
            <ListRow
              key={c.category}
              title={c.label}
              subtitle={`${c.count} รายการในรอบนี้`}
              amount={`${formatBaht(c.amount)} บาท`}
            />
          ))}
        </section>
      )}
    </main>
  );
}

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

export function PlusView() {
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="พอใช้ Plus" back="/app" tone="default" />

      <section className="flex flex-col gap-3 rounded-md border border-line-strong bg-card p-5">
        <span className="self-start rounded-pill bg-accent-reward px-3 py-1 text-xs font-bold text-primary">
          พอใช้ Plus · 39 บาท/เดือน
        </span>
        <h2 className="text-xl font-bold text-primary">เก็บของไว้ในแผนได้ไม่จำกัดรายการ</h2>
        <ul className="flex flex-col gap-2 text-sm text-secondary">
          <li>✓ เก็บรายการไว้ในแผนได้มากกว่า 3 รายการต่อรอบ</li>
          <li>✓ เปรียบเทียบผลกระทบหลายรายการพร้อมกัน</li>
          <li>✓ จดรายการและลองก่อนจ่ายยังใช้ฟรีไม่จำกัดเหมือนเดิม</li>
        </ul>
        <Link href="/app" className={buttonClass("primary", true)}>
          รับทราบ · กลับหน้าหลัก
        </Link>
      </section>
    </main>
  );
}
