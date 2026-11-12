"use client";

// Card 23 flow: E1a (days until the new payday) -> E2 (try: simulate) -> confirm with that try's basis -> E3.
// Screens show only the numbers the server returns. The one thing computed here is a calendar date
// (today + N days), through lib/calc/time.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { Mascot, type MascotPose } from "@/components/ui/mascot";
import type { SimulateResponse, Summary } from "@/lib/api-types";
import type { BudgetResult } from "@/lib/calc/budget";
import type { Satang } from "@/lib/calc/money";
import { addDays } from "@/lib/calc/time";
import { ApiError } from "@/lib/client/errors";
import { essentialsFromDaily, parseEssentialsInput } from "@/lib/client/essentials";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht } from "@/lib/format/money";

export const MSG_STALE = "ข้อมูลเปลี่ยนไปแล้ว ลองดูผลใหม่อีกครั้ง";
const MSG_DAYS = "ใส่จำนวนวันเป็นเลขจำนวนเต็ม 1–366";
const MAX_DAYS = 366;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function isCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code;
}

type Router = ReturnType<typeof useRouter>;

// no_cycle / no_consent keep the neutral loading state while the redirect happens
function redirectFor(err: unknown, router: Router): boolean {
  if (isCode(err, "no_cycle")) {
    router.replace("/app/setup/income");
    return true;
  }
  if (isCode(err, "no_consent")) {
    router.replace("/app/consent");
    return true;
  }
  return false;
}

function parseDays(text: string): number | null {
  const t = text.trim().replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)));
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_DAYS ? n : null;
}

function isRealDate(s: string): boolean {
  return ISO_DATE.test(s) && addDays(s, 0) === s;
}

function dailyOf(b: BudgetResult | null): Satang | null {
  return b !== null && b.kind === "ok" ? b.dailyBudget : null;
}

function Loading({ title, back }: { title: string; back?: string }) {
  return (
    <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
      <AppHeader title={title} back={back} tone="default" />
      <div aria-hidden="true" className="h-24 rounded-md bg-subtle motion-safe:animate-pulse" />
      <div aria-hidden="true" className="h-16 rounded-md bg-subtle motion-safe:animate-pulse" />
      <p className="text-sm text-secondary">กำลังโหลด…</p>
    </main>
  );
}

// ---------------------------------------------------------------- E1a

export function PaydayInputView() {
  const api = useApi();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [daysText, setDaysText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .summary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((err) => {
        if (cancelled || redirectFor(err, router)) return;
        setLoadError(errorText(err, "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt]);

  if (loadError) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="แก้วันเงินเข้า" back="/app/plan/edit" tone="default" />
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
      </main>
    );
  }
  if (!summary) return <Loading title="แก้วันเงินเข้า" back="/app/plan/edit" />;

  const days = parseDays(daysText);
  const newPayday = days !== null ? addDays(summary.today, days) : null;

  function handleNext() {
    if (!summary) return;
    const n = parseDays(daysText);
    if (n === null) {
      setError(MSG_DAYS);
      return;
    }
    setError(null);
    router.push(`/app/plan/edit/review?payday=${addDays(summary.today, n)}`);
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="แก้วันเงินเข้า" back="/app/plan/edit" tone="default" />

      <section className="flex flex-col gap-1 rounded-md border border-line bg-card p-4 text-sm">
        <p className="text-secondary">
          วันเงินเข้าตอนนี้: <strong className="text-primary">{formatThaiDate(summary.payday, "long")}</strong>
        </p>
        {summary.budget.kind === "ok" ? (
          <p className="text-xs text-secondary">ถัดไปอีก {summary.budget.daysLeft} วัน (รวมวันนี้)</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <InputField
          label="วันเงินเข้าใหม่"
          inputMode="numeric"
          placeholder="เช่น 15"
          value={daysText}
          onChange={(e) => {
            setDaysText(e.target.value);
            if (error) setError(null);
          }}
          state={error ? "error" : daysText ? "filled" : "default"}
          helper={error ?? "อีก __ วัน (นับรวมวันนี้)"}
        />
        {newPayday ? <p className="text-sm text-primary">ตรงกับวันที่ {formatThaiDate(newPayday, "long")}</p> : null}
      </section>

      <Button variant="primary" block onClick={handleNext}>
        ดูสรุปแผนใหม่
      </Button>
    </main>
  );
}

// ---------------------------------------------------------------- E2 / E2b

function CompareBox({ label, daily, shortfall }: { label: string; daily: Satang | null; shortfall: Satang | null }) {
  return (
    <div className="flex flex-1 flex-col items-start gap-1 rounded-md border border-line bg-card p-4">
      <span className="text-xs font-semibold text-secondary">{label}</span>
      {daily !== null ? (
        <>
          <span className="text-4xl font-bold tabular-nums text-primary">{formatBaht(daily)}</span>
          <span className="text-sm font-semibold text-secondary">บาท/วัน</span>
        </>
      ) : shortfall !== null ? (
        <span className="text-xl font-bold text-danger">ขาดอีก {formatBaht(shortfall)} บาท</span>
      ) : (
        <span className="text-sm text-secondary">ยังคำนวณไม่ได้</span>
      )}
    </div>
  );
}

function essentialsShortText(sim: SimulateResponse): string {
  const perDay = sim.after?.kind === "ok" ? sim.after.essentialShortPerDay : null;
  const parts: string[] = [];
  if (sim.overLimitBy !== null) parts.push(`เงินไม่พอค่าจำเป็นตลอดรอบ ขาดรวม ${formatBaht(sim.overLimitBy)} บาท`);
  if (perDay !== null) parts.push(`งบต่อวันต่ำกว่าค่าจำเป็นวันละ ${formatBaht(perDay)} บาท`);
  return parts.length > 0 ? parts.join(" · ") : "งบต่อวันต่ำกว่าค่าจำเป็นต่อวัน";
}

export function PaydayReviewView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paydayParam = searchParams?.get("payday") ?? null;
  const payday = paydayParam !== null && isRealDate(paydayParam) ? paydayParam : null;

  const [sim, setSim] = useState<SimulateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stale, setStale] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const { submit, busy, reset } = useSubmit<Summary>();

  // The ask/essentials answer is sent as `essentials` on the next simulate (this try only).
  const [essentialsAnswer, setEssentialsAnswer] = useState<Satang | null>(null);
  const [essentialsText, setEssentialsText] = useState("");
  const [essentialsError, setEssentialsError] = useState<string | null>(null);

  useEffect(() => {
    if (!payday) {
      router.replace("/app/plan/edit/payday");
      return;
    }
    let cancelled = false;
    api
      .simulate({
        payday,
        ...(essentialsAnswer !== null ? { essentials: essentialsFromDaily(essentialsAnswer) } : {}),
      })
      .then((res) => {
        if (cancelled) return;
        setSim(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled || redirectFor(err, router)) return;
        setLoadError(errorText(err, "คำนวณไม่สำเร็จ ลองใหม่อีกครั้ง"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, payday, essentialsAnswer, attempt]);

  // Run the try again: neutral loading state first, then the effect fetches a fresh result.
  function rerun() {
    setSim(null);
    setLoading(true);
    setLoadError(null);
    setAttempt((n) => n + 1);
  }

  function tryWithEssentials() {
    const parsed = parseEssentialsInput(essentialsText);
    if (!parsed.ok) {
      setEssentialsError(parsed.message);
      return;
    }
    setEssentialsError(null);
    setEssentialsAnswer(parsed.satang);
    rerun();
  }

  async function handleConfirm() {
    if (!sim || !payday) return;
    setConfirmError(null);
    setStale(false);
    const basis = sim.basis;
    const res = await submit({ payday, basis }, async () => (await api.changePayday({ payday, basis })).summary);
    if (res.ok) {
      // busy stays true: the page is unmounting, so no second tap can slip in
      router.replace("/app/plan/edit/done");
      return;
    }
    if ("skipped" in res) return;
    if (isCode(res.error, "stale")) {
      // The numbers moved: never confirm the old result. Show the new one first.
      reset();
      setStale(true);
      rerun();
      return;
    }
    setConfirmError(errorText(res.error, "ยืนยันไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }

  const header = <AppHeader title="ตรวจแผนใหม่" back="/app/plan/edit/payday" tone="default" />;
  const staleBanner = stale ? <Banner kind="warn" text={MSG_STALE} /> : null;

  if (!payday || loading) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
        {header}
        {staleBanner}
        <div aria-hidden="true" className="h-36 rounded-md bg-subtle motion-safe:animate-pulse" />
        <p className="text-sm text-secondary">กำลังคำนวณแผนใหม่…</p>
      </main>
    );
  }

  if (loadError || !sim) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        {header}
        {staleBanner}
        <Banner kind="error" text={loadError ?? "คำนวณไม่สำเร็จ ลองใหม่อีกครั้ง"} />
        <Button variant="primary" block onClick={rerun}>
          ลองใหม่
        </Button>
        <Button variant="secondary" block onClick={() => router.push("/app")}>
          ยกเลิก
        </Button>
      </main>
    );
  }

  const paydayPassed = sim.needs.includes("payday");

  if (sim.verdict === "ask" || paydayPassed) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        {header}
        {staleBanner}
        {paydayPassed ? (
          <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
            <Banner kind="warn" text="ถึงวันเงินเข้าแล้ว ยังลองคำนวณไม่ได้ ถ้าเงินเข้าแล้วให้ตั้งรอบเงินใหม่ก่อน" />
            <Link href="/app/cycle/new" className={buttonClass("primary", true)}>
              ตั้งรอบเงินใหม่
            </Link>
          </section>
        ) : null}
        {sim.needs.includes("essentials") ? (
          <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
            <p className="text-sm text-primary">ต้องรู้ค่ากินและค่ารถที่ต้องใช้ทุกวันก่อน จึงจะเทียบแผนใหม่ได้</p>
            <InputField
              label="ค่าจำเป็นต่อวัน (บาท)"
              inputMode="decimal"
              placeholder="เช่น 70"
              value={essentialsText}
              onChange={(e) => {
                setEssentialsText(e.target.value);
                setEssentialsError(null);
              }}
              state={essentialsError ? "error" : essentialsText ? "filled" : "default"}
              helper={essentialsError ?? "รวมทุกอย่างที่ต้องจ่ายทุกวันไว้ในช่องเดียว"}
            />
            <Button variant="primary" block onClick={tryWithEssentials}>
              ลองคำนวณอีกครั้ง
            </Button>
          </section>
        ) : null}
        <Button variant="secondary" block onClick={() => router.push("/app")}>
          ยกเลิก
        </Button>
      </main>
    );
  }

  const afterShortfall = sim.after?.kind === "shortfall" ? sim.after.shortfall : null;

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      {header}
      {staleBanner}

      <p className="text-sm text-secondary">
        วันเงินเข้าใหม่: <strong className="text-primary">{formatThaiDate(payday, "long")}</strong>
      </p>

      <div className="flex gap-3">
        <CompareBox
          label="ก่อน"
          daily={dailyOf(sim.before)}
          shortfall={sim.before?.kind === "shortfall" ? sim.before.shortfall : null}
        />
        <CompareBox label="หลัง" daily={dailyOf(sim.after)} shortfall={afterShortfall} />
      </div>

      {sim.verdict === "shortfall" ? (
        <Banner
          kind="error"
          text={
            afterShortfall !== null
              ? `เงินไม่พอหักบิล เงินออม และเงินเผื่อตลอดรอบใหม่ ขาดอีก ${formatBaht(afterShortfall)} บาท`
              : "เงินไม่พอหักบิล เงินออม และเงินเผื่อตลอดรอบใหม่"
          }
        />
      ) : sim.verdict === "essentials_short" ? (
        <Banner kind="warn" text={essentialsShortText(sim)} />
      ) : (
        <Banner kind="info" text="ดูตัวเลขก่อนและหลังด้านบน แล้วกดยืนยันถ้าถูกต้อง" />
      )}

      {sim.verdict === "shortfall" || sim.verdict === "essentials_short" ? (
        <p className="text-xs text-secondary">การยืนยันนี้เปลี่ยนแค่วันเงินเข้า ไม่ได้เปลี่ยนเงินในแอป</p>
      ) : null}

      {confirmError ? <Banner kind="error" text={confirmError} /> : null}

      <div className="flex flex-col gap-2">
        <Button variant="primary" block busy={busy} onClick={handleConfirm}>
          ยืนยันแผนใหม่
        </Button>
        <Button variant="secondary" block disabled={busy} onClick={() => router.push("/app")}>
          ยกเลิก
        </Button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- E3 / E3b / E5

// "(เงินที่มี − บิล − ออม − เผื่อ) ÷ N วัน": display composition of the server's own values, no arithmetic.
// Left out when any value is missing, or when today's spending is not 0 (the server then adds it back, so
// this line would not match the number shown).
export function footnoteOf(s: Summary): string | null {
  if (s.budget.kind !== "ok") return null;
  const parts = [s.balance, s.reserved, s.savings, s.emergencyBuffer, s.spentToday, s.budget.daysLeft];
  if (parts.some((v) => typeof v !== "number")) return null;
  if (s.spentToday !== 0) return null;
  return `(${formatBaht(s.balance)} − ${formatBaht(s.reserved)} − ${formatBaht(s.savings)} − ${formatBaht(s.emergencyBuffer)}) ÷ ${s.budget.daysLeft} วัน ปัดลงเป็นช่วง 0.25 บาท`;
}

export function UpdatedSummaryView({ title, pose }: { title: string; pose: MascotPose }) {
  const api = useApi();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .summary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((err) => {
        if (cancelled || redirectFor(err, router)) return;
        setLoadError(errorText(err, "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt]);

  if (loadError) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title={title} tone="default" />
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
        <Link href="/app" className={buttonClass("secondary", true)}>
          กลับ Dashboard
        </Link>
      </main>
    );
  }
  if (!summary) return <Loading title={title} />;

  const b = summary.budget;
  const footnote = footnoteOf(summary);

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title={title} tone="default" />
      <div className="flex justify-center">
        <Mascot pose={pose} size={72} />
      </div>
      <section className="flex flex-col items-center gap-2 rounded-md border border-line-strong bg-card p-5 text-center">
        <span className="text-sm font-semibold text-secondary">ใช้ได้วันละ</span>
        {b.kind === "ok" ? (
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold tabular-nums text-primary">{formatBaht(b.dailyBudget)}</span>
            <span className="text-base font-semibold text-secondary">บาท/วัน</span>
          </div>
        ) : b.kind === "shortfall" ? (
          <span className="text-xl font-bold text-danger">เงินไม่พอ ขาดอีก {formatBaht(b.shortfall)} บาท</span>
        ) : (
          <span className="text-sm text-secondary">ถึงวันเงินเข้าแล้ว ยังคำนวณไม่ได้</span>
        )}
        {footnote ? <p className="text-xs text-secondary">{footnote}</p> : null}
      </section>
      <Link href="/app" className={buttonClass("primary", true)}>
        กลับ Dashboard
      </Link>
    </main>
  );
}

export const PlanEditDoneView = () => <UpdatedSummaryView title="อัปเดตแล้ว" pose="saveCoins" />;
export const BalanceDoneView = () => <UpdatedSummaryView title="ปรับยอดแล้ว" pose="budgetOk" />;
