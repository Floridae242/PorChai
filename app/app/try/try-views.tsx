"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { Mascot } from "@/components/ui/mascot";
import type { PlanQuota } from "@/lib/client/types";
import type { SimulateResponse, Summary } from "@/lib/api-types";
import type { Satang } from "@/lib/calc/money";
import { ApiError } from "@/lib/client/errors";
import { clearTryDraft, loadTryDraft, saveTryDraft, type TryItemDraft } from "@/lib/client/try-draft";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import { formatBaht, parseBahtInput, type ParseBahtResult } from "@/lib/format/money";

// Shown when the user leaves the name empty. A label, not data.
const DEFAULT_TITLE = "ของที่อยากซื้อ";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function isCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code;
}

type AmountFailure = Extract<ParseBahtResult, { ok: false }>["reason"];

const AMOUNT_MESSAGES: Record<AmountFailure, string> = {
  empty: "ใส่ราคาของที่จะซื้อก่อน",
  not_number: "ใส่เป็นตัวเลข เช่น 480",
  not_positive: "ใส่ราคามากกว่า 0",
  too_many_decimals: "ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง",
  too_large: "ราคาสูงเกินไป ตรวจตัวเลขอีกครั้ง",
};

// "No daily essentials at all" is a real answer (docs 5: set 0), but parseBahtInput rejects zero.
const ZERO_TEXT = /^[0๐]+(\.[0๐]*)?$/;
const MSG_ESSENTIALS_EMPTY = "ใส่ค่าจำเป็นต่อวันก่อน (ถ้าไม่มีเลยให้ใส่ 0)";

function parseEssentialsInput(text: string): { ok: true; satang: Satang } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, message: MSG_ESSENTIALS_EMPTY };
  if (ZERO_TEXT.test(trimmed)) return { ok: true, satang: 0 };
  const parsed = parseBahtInput(trimmed);
  if (parsed.ok) return { ok: true, satang: parsed.satang };
  return { ok: false, message: AMOUNT_MESSAGES[parsed.reason].replace("ราคา", "ค่าจำเป็น") };
}

// Backend gap #2: the API takes food and transport separately, the screen asks for one total
// ("ค่าจำเป็นต่อวัน" as in Figma H8). The whole total goes in `food` until the contract has a total field.
function essentialsFromTotal(total: Satang): { food: Satang; transport: Satang } {
  return { food: total, transport: 0 };
}

// ---------------------------------------------------------------- C1

export function TryInputView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [title, setTitle] = useState(() => searchParams?.get("title") ?? "");
  const [amountText, setAmountText] = useState(() => searchParams?.get("amount") ?? "");
  const [dueOn, setDueOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const parsed = parseBahtInput(amountText);
    if (!parsed.ok) {
      setError(AMOUNT_MESSAGES[parsed.reason]);
      return;
    }
    setError(null);
    saveTryDraft({
      title: title.trim() || DEFAULT_TITLE,
      amount: parsed.satang,
      dueOn: dueOn.trim() ? dueOn.trim() : null,
    });
    router.push("/app/try/result");
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ลองก่อนจ่าย" back="/app" tone="default" />

      <div className="flex items-center gap-3 rounded-md border border-line bg-subtle p-4">
        <Mascot pose="thinking" size={56} />
        <div className="flex flex-col gap-0.5 text-sm">
          <p className="font-semibold text-primary">จะซื้ออะไร ลองเช็กผลกระทบก่อนได้</p>
          <p className="text-xs text-secondary">การลองคำนวณยังไม่เปลี่ยนยอดเงินจริงของคุณ</p>
        </div>
      </div>

      <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
        <InputField
          label="ชื่อของที่จะซื้อ (ไม่บังคับ)"
          placeholder="เช่น รองเท้า"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          state={title ? "filled" : "default"}
        />

        <InputField
          label="ราคา (บาท)"
          inputMode="decimal"
          placeholder="เช่น 480"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value);
            if (error) setError(null);
          }}
          state={error ? "error" : amountText ? "filled" : "default"}
          helper={error ?? undefined}
        />

        <InputField
          label="วันที่จะใช้เงิน (ไม่บังคับ)"
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          state={dueOn ? "filled" : "default"}
          helper="ถ้าไม่ระบุ จะคำนวณโดยหักจากงบรอบปัจจุบัน"
        />
      </section>

      <Button variant="primary" block onClick={handleSubmit}>
        ดูผลกระทบต่องบ
      </Button>
    </main>
  );
}

// ---------------------------------------------------------------- C2

export function TryResultView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qAmount = searchParams?.get("amount") ?? null;
  const qTitle = searchParams?.get("title") ?? null;

  const [item, setItem] = useState<TryItemDraft | null>(null);
  const [sim, setSim] = useState<SimulateResponse | null>(null);
  const [choice, setChoice] = useState<"buy" | "skip">("buy");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The ask/essentials answer, sent as `essentials` on the next simulate (this try only until "จำไว้").
  const [essentialsAnswer, setEssentialsAnswer] = useState<Satang | null>(null);
  const [essentialsText, setEssentialsText] = useState("");
  const [essentialsError, setEssentialsError] = useState<string | null>(null);
  const remember = useSubmit<void>();

  // Read the draft (or the link's ?title=&amount=) after mount so server and client markup match.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (qAmount) {
        const parsed = parseBahtInput(qAmount);
        if (parsed.ok) {
          const d: TryItemDraft = { title: qTitle?.trim() || DEFAULT_TITLE, amount: parsed.satang, dueOn: null };
          saveTryDraft(d);
          setItem(d);
          return;
        }
      }
      const d = loadTryDraft();
      if (d) setItem(d);
      else router.replace("/app/try");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qAmount, qTitle]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    api
      .simulate({
        amount: item.amount,
        dueOn: item.dueOn,
        ...(essentialsAnswer !== null ? { essentials: essentialsFromTotal(essentialsAnswer) } : {}),
      })
      .then((res) => {
        if (cancelled) return;
        setSim(res);
        setLoading(false);
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
        setError(errorText(err, "คำนวณไม่สำเร็จ ลองใหม่อีกครั้ง"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, item, essentialsAnswer, attempt]);

  // Run the simulation again: back to the neutral state first, then the effect fetches.
  function rerun() {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }

  function tryAgainWithEssentials() {
    const parsed = parseEssentialsInput(essentialsText);
    if (!parsed.ok) {
      setEssentialsError(parsed.message);
      return;
    }
    setEssentialsError(null);
    setEssentialsAnswer(parsed.satang);
    rerun();
  }

  async function rememberEssentials() {
    const parsed = parseEssentialsInput(essentialsText);
    if (!parsed.ok) {
      setEssentialsError(parsed.message);
      return;
    }
    setEssentialsError(null);
    const result = await remember.submit(parsed.satang, async () => {
      await api.setEssentials(essentialsFromTotal(parsed.satang));
    });
    if (result.ok) {
      setEssentialsAnswer(parsed.satang);
      rerun();
    } else if (!("skipped" in result)) {
      setEssentialsError(errorText(result.error, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"));
    }
  }

  if (!item || loading) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
        <AppHeader title="ผลเปรียบเทียบ" back="/app/try" tone="default" />
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Mascot pose="thinking" size={56} />
          <p className="text-sm text-secondary">กำลังคำนวณผลกระทบ…</p>
        </div>
      </main>
    );
  }

  if (error || !sim) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="ผลเปรียบเทียบ" back="/app/try" tone="default" />
        <Banner kind="error" text={error ?? "เกิดข้อผิดพลาด"} />
        <Button variant="primary" block onClick={rerun}>
          ลองใหม่
        </Button>
      </main>
    );
  }

  const paydayPassed = sim.needs.includes("payday") || sim.after?.kind === "payday-passed";

  // ask: nothing can be compared yet. Never fall through to an empty comparison.
  if (sim.verdict === "ask" || paydayPassed) {
    const needsEssentials = sim.needs.includes("essentials");
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="ผลเปรียบเทียบ" back="/app/try" tone="default" />
        <div className="flex flex-col items-center gap-2 text-center">
          <Mascot pose="thinking" size={56} />
          <h2 className="text-base font-semibold text-primary">
            ลองซื้อ &quot;{item.title}&quot; ราคา {formatBaht(item.amount)} บาท
          </h2>
        </div>

        {paydayPassed ? (
          <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
            <Banner kind="warn" text="ถึงวันเงินเข้าแล้ว ยังลองคำนวณไม่ได้ ถ้าเงินเข้าแล้วให้ตั้งรอบเงินใหม่ก่อน" />
            <Link href="/app/cycle/new" className={buttonClass("primary", true)}>
              ตั้งรอบเงินใหม่
            </Link>
          </section>
        ) : null}

        {needsEssentials ? (
          <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
            <p className="text-sm text-primary">
              ต้องรู้ค่ากินและค่ารถที่ต้องใช้ทุกวันก่อน จึงจะบอกได้ว่าซื้อของชิ้นนี้ได้ไหม
            </p>
            <InputField
              label="ค่าจำเป็นต่อวัน (บาท)"
              inputMode="decimal"
              placeholder="เช่น 70"
              value={essentialsText}
              onChange={(e) => {
                setEssentialsText(e.target.value);
                setEssentialsError(null);
                remember.reset();
              }}
              state={essentialsError ? "error" : essentialsText ? "filled" : "default"}
              helper={essentialsError ?? "รวมทุกอย่างที่ต้องจ่ายทุกวันไว้ในช่องเดียว"}
            />
            <Button variant="primary" block onClick={tryAgainWithEssentials}>
              ลองคำนวณอีกครั้ง
            </Button>
            <Button variant="secondary" block busy={remember.busy} onClick={rememberEssentials}>
              จำไว้
            </Button>
          </section>
        ) : null}

        {!paydayPassed && !needsEssentials ? (
          <>
            <Banner kind="warn" text="ตอนนี้ยังคำนวณให้ไม่ได้ ลองใหม่อีกครั้ง" />
            <Button variant="primary" block onClick={rerun}>
              ลองใหม่
            </Button>
          </>
        ) : null}
      </main>
    );
  }

  const isShortfall = sim.verdict === "shortfall";
  const isEssentialsShort = sim.verdict === "essentials_short";
  const beforeDaily = sim.before && sim.before.kind === "ok" ? sim.before.dailyBudget : null;
  const afterDaily = sim.after && sim.after.kind === "ok" ? sim.after.dailyBudget : null;
  const afterShortfall = sim.after && sim.after.kind === "shortfall" ? sim.after.shortfall : null;
  const checks = sim.checks;

  function leave() {
    clearTryDraft();
    router.push("/app");
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ผลเปรียบเทียบ" back="/app/try" tone="default" />

      <div className="flex flex-col items-center gap-2 text-center">
        <Mascot pose={isEssentialsShort || isShortfall ? "budgetTight" : "thinking"} size={isEssentialsShort || isShortfall ? 56 : 48} />
        <h2 className="text-base font-semibold text-primary">
          ลองซื้อ &quot;{item.title}&quot; ราคา {formatBaht(item.amount)} บาท
        </h2>
      </div>

      {isShortfall ? (
        <Banner
          kind="error"
          text={
            afterShortfall !== null
              ? `เงินไม่พอหักบิลและรายการนี้ ขาดอีก ${formatBaht(afterShortfall)} บาท`
              : "เงินไม่พอหักบิลและรายการนี้"
          }
        />
      ) : isEssentialsShort ? (
        <Banner
          kind="warn"
          text={
            sim.overLimitBy !== null
              ? `เกินวงเงินที่ซื้อได้โดยไม่กระทบค่าจำเป็นไป ${formatBaht(sim.overLimitBy)} บาท`
              : "เกินวงเงินที่ซื้อได้โดยไม่กระทบค่าจำเป็น"
          }
        />
      ) : null}

      {!sim.countsThisCycle ? (
        <Banner kind="info" text="ของชิ้นนี้ครบกำหนดหลังวันเงินเข้า จึงไม่กระทบงบรอบนี้" />
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          aria-pressed={choice === "buy"}
          onClick={() => setChoice("buy")}
          className={`flex flex-col items-start gap-2 rounded-md border p-4 text-left ${
            choice === "buy" ? "border-line-strong bg-selected" : "border-line bg-card"
          }`}
        >
          <span className="text-xs font-semibold text-secondary">
            ถ้าซื้อ {item.title} ({formatBaht(item.amount)} บาท)
          </span>
          {afterDaily !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tabular-nums text-primary">{formatBaht(afterDaily)}</span>
              <span className="text-sm font-semibold text-secondary">บาท/วัน</span>
            </div>
          ) : afterShortfall !== null ? (
            <span className="text-xl font-bold text-status-danger">ขาดอีก {formatBaht(afterShortfall)} บาท</span>
          ) : null}
          <span className="text-xs text-secondary">งบรายวันตลอดรอบที่เหลือ</span>
        </button>

        <button
          type="button"
          aria-pressed={choice === "skip"}
          onClick={() => setChoice("skip")}
          className={`flex flex-col items-start gap-2 rounded-md border p-4 text-left ${
            choice === "skip" ? "border-line-strong bg-selected" : "border-line bg-card"
          }`}
        >
          <span className="text-xs font-semibold text-secondary">ถ้ายังไม่ซื้อ</span>
          {beforeDaily !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tabular-nums text-primary">{formatBaht(beforeDaily)}</span>
              <span className="text-sm font-semibold text-secondary">บาท/วัน</span>
            </div>
          ) : null}
          <span className="text-xs text-secondary">งบรายวันคงเดิม ไม่เปลี่ยนแปลง</span>
        </button>
      </div>

      {checks ? (
        <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4 text-sm">
          <h3 className="font-semibold text-primary">ถ้าซื้อ {formatBaht(item.amount)} บาท จะกระทบอะไร</h3>
          <ul className="flex flex-col gap-1.5 text-xs">
            <li className="flex items-center gap-2">
              <span className={checks.billsCovered ? "font-bold text-status-ok" : "font-bold text-status-danger"}>
                {checks.billsCovered ? "✓" : "✕"}
              </span>
              <span className="text-primary">
                บิลประจำ {formatBaht(checks.bills)} บาท {checks.billsCovered ? "ยังพอจ่ายครบ" : "เงินไม่พอจ่ายบิล"}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className={checks.essentialsCovered ? "font-bold text-status-ok" : "font-bold text-status-warn"}>
                {checks.essentialsCovered ? "✓" : "⚠"}
              </span>
              <span className="text-primary">
                {checks.essentialsCovered
                  ? `ค่าจำเป็น ${formatBaht(checks.essentialPerDay)} บาท/วัน ยังพอ${afterDaily !== null ? ` (เหลือวันละ ${formatBaht(afterDaily)} บาท)` : ""}`
                  : `ค่าจำเป็น ${formatBaht(checks.essentialPerDay)} บาท/วัน ไม่พอ${
                      sim.after?.kind === "ok" && sim.after.essentialShortPerDay
                        ? ` (ขาดวันละ ${formatBaht(sim.after.essentialShortPerDay)} บาท)`
                        : ""
                    }`}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="font-bold text-status-ok">✓</span>
              <span className="text-primary">
                เป้าออม {formatBaht(checks.savings)} บาท และเงินเผื่อ {formatBaht(checks.emergencyBuffer)} บาท ไม่ถูกแตะ
              </span>
            </li>
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2">
        {choice === "buy" ? (
          <Button variant="primary" block onClick={() => router.push("/app/try/decide")}>
            เลือกวิธีจัดการรายการนี้
          </Button>
        ) : (
          <Button variant="primary" block onClick={leave}>
            ไม่ซื้อ · กลับหน้าสรุป
          </Button>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- C3 / C3b

type Decision = "pay" | "keep" | "postpone";

const OPTIONS: { key: Decision; title: string; desc: string }[] = [
  { key: "pay", title: "ยืนยันจ่ายจริง", desc: "จ่ายไปแล้ว หักจากเงินที่มีทันที" },
  { key: "keep", title: "เก็บไว้ในแผน", desc: "ยังไม่จ่าย แต่กันเงินไว้ก่อน" },
  { key: "postpone", title: "เลื่อนไปรอบหน้า", desc: "ยังไม่หักรอบนี้ ค่อยดูอีกครั้งตอนเงินเข้า" },
];

const BUTTON_LABEL: Record<Decision, string> = {
  pay: "ยืนยันจ่ายจริง",
  keep: "เก็บไว้ในแผน",
  postpone: "เลื่อนไปรอบหน้า",
};

export function TryDecideView() {
  const api = useApi();
  const router = useRouter();

  const [item, setItem] = useState<TryItemDraft | null>(null);
  const [decision, setDecision] = useState<Decision | null>("keep");
  const [quota, setQuota] = useState<PlanQuota | null>(null); // null = unknown: no banner, no count
  const [limitHit, setLimitHit] = useState(false); // the server said quota_full
  const [error, setError] = useState<string | null>(null);
  // One guard for all three actions: one lock, key follows {action, item}.
  const { submit, busy } = useSubmit<string | null>();

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const d = loadTryDraft();
      if (d) setItem(d);
      else router.replace("/app/try");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .planQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {
        // not implemented / failed: show no quota at all
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const quotaFull = limitHit || (quota !== null && quota.used >= quota.limit);

  async function handleConfirm() {
    if (!item || !decision) return;
    if (decision === "keep" && quotaFull) return;
    setError(null);
    const payload = { action: decision, title: item.title, amount: item.amount, dueOn: item.dueOn };
    const result = await submit(payload, async (key) => {
      if (decision === "pay") {
        // 'other' is the server's own default category; this screen does not guess one.
        await api.addEntry({ amount: item.amount, category: "other", note: item.title }, key);
        return null;
      }
      const res = await api.addPlan(
        {
          title: item.title,
          amount: item.amount,
          kind: "purchase",
          status: decision === "keep" ? "reserved" : "postponed",
          dueOn: item.dueOn,
        },
        key,
      );
      return res.plan.id;
    });

    if (result.ok) {
      // busy stays true: the page is unmounting, so a second tap cannot slip in.
      clearTryDraft();
      if (decision === "pay") router.replace("/app/record/done?mode=normal");
      else if (decision === "keep") router.replace(`/app/try/saved?plan=${encodeURIComponent(result.value ?? "")}`);
      else router.replace("/app/plan?tab=pending");
      return;
    }
    if ("skipped" in result) return;

    const err = result.error;
    if (decision === "keep" && isCode(err, "quota_full")) {
      setLimitHit(true);
      setDecision(null); // nothing is chosen for the user: paying is not reversible
      try {
        setQuota(await api.planQuota());
      } catch {
        // no numbers available: the banner below shows the server's message instead
        setError(errorText(err, "ใช้สิทธิ์แผนฟรีครบแล้ว"));
      }
      return;
    }
    setError(errorText(err, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }

  function handleCancel() {
    clearTryDraft();
    router.replace("/app");
  }

  if (!item) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
        <AppHeader title="เลือกทำอะไรต่อ" back="/app/try/result" tone="default" />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="เลือกทำอะไรต่อ" back="/app/try/result" tone="default" />

      {quotaFull && quota ? (
        <Banner
          kind="info"
          text={`ใช้สิทธิ์แผนฟรีครบแล้ว (${quota.used}/${quota.limit}) แผนเพิ่มต้องใช้ Plus`}
          action={{ label: "ดู Plus ›", href: "/app/plus" }}
        />
      ) : null}

      <section className="flex items-center justify-between rounded-md border border-line bg-card p-4 text-sm">
        <span className="font-semibold text-primary">{item.title}</span>
        <span className="font-bold tabular-nums text-primary">{formatBaht(item.amount)} บาท</span>
      </section>

      <div role="radiogroup" aria-label="เลือกทำอะไรต่อ" className="flex flex-col gap-2.5 rounded-md border border-line bg-card p-4">
        {OPTIONS.map((opt) => {
          const disabled = busy || (opt.key === "keep" && quotaFull);
          return (
            <label
              key={opt.key}
              className={`flex min-h-[90px] items-start gap-3 rounded-sm border p-3.5 text-sm ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              } ${decision === opt.key ? "border-line-strong bg-selected" : "border-line bg-card"}`}
            >
              <input
                type="radio"
                name="tryDecision"
                checked={decision === opt.key}
                disabled={disabled}
                onChange={() => setDecision(opt.key)}
                className="mt-1 size-4 accent-[var(--green-700)]"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-primary">{opt.title}</span>
                <span className="text-xs text-secondary">{opt.desc}</span>
              </div>
            </label>
          );
        })}
      </div>

      {error ? (
        <Banner
          kind="error"
          text={error}
          action={quotaFull && !quota ? { label: "ดู Plus ›", href: "/app/plus" } : undefined}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <Button
          variant="primary"
          block
          busy={busy}
          disabled={!decision || (decision === "keep" && quotaFull)}
          onClick={handleConfirm}
        >
          {decision ? BUTTON_LABEL[decision] : "เลือกทำอะไรต่อ"}
        </Button>
        <Button variant="secondary" block disabled={busy} onClick={handleCancel}>
          ยกเลิก
        </Button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- C4

type SavedPlan = { title: string; amount: Satang };

export function TrySavedView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams?.get("plan") ?? null;

  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quota, setQuota] = useState<PlanQuota | null>(null);

  useEffect(() => {
    if (!planId) {
      router.replace("/app/try");
      return;
    }
    let cancelled = false;
    api
      .plans()
      .then(({ plans }) => {
        if (cancelled) return;
        // Exact id only: never fall back to some other plan.
        const found = plans.find((p) => p.id === planId);
        if (found) setPlan({ title: found.title, amount: found.amount });
        else setMissing(true);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง"));
      });
    api
      .summary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {});
    api
      .planQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, planId, attempt]);

  if (error) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="ลองก่อนจ่าย" back="/app/plan?tab=pending" tone="default" />
        <Banner kind="error" text={error} />
        <Button variant="primary" block onClick={() => {
            setError(null);
            setMissing(false);
            setAttempt((n) => n + 1);
          }}>
          ลองใหม่
        </Button>
      </main>
    );
  }

  if (missing) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="ลองก่อนจ่าย" back="/app/plan?tab=pending" tone="default" />
        <Banner kind="warn" text="ไม่พบรายการนี้" />
        <Link href="/app/plan?tab=pending" className={buttonClass("primary", true)}>
          ดูรายการที่เก็บไว้ในแผน
        </Link>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังโหลด…
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center gap-5 py-8 text-center font-body">
      <Mascot pose="saveCoins" size={80} />

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-primary">เก็บไว้ในแผนแล้ว ✓</h1>
        <p className="text-sm text-secondary">
          กันเงินสำหรับ &quot;{plan.title}&quot; ({formatBaht(plan.amount)} บาท) ไว้ในแผนรอบนี้เรียบร้อยแล้ว
        </p>
      </div>

      {quota && quota.used >= quota.limit ? (
        <div className="w-full">
          <Banner
            kind="info"
            text={`ใช้สิทธิ์แผนฟรีแล้ว ${quota.used}/${quota.limit} ในรอบนี้ ต้องการแผนเพิ่ม?`}
            action={{ label: "ดู Plus ›", href: "/app/plus" }}
          />
        </div>
      ) : null}

      {summary && summary.budget.kind === "ok" ? (
        <section className="flex w-full flex-col gap-2 rounded-md border border-line-strong bg-card p-5">
          <span className="text-xs font-semibold text-secondary">งบต่อวันหลังกันเงินไว้ในแผน</span>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-4xl font-bold tabular-nums text-primary">
              {formatBaht(summary.budget.dailyBudget)}
            </span>
            <span className="text-base font-semibold text-secondary">บาท/วัน</span>
          </div>
          <p className="text-xs text-secondary">
            เมื่อซื้อจริงแล้ว กด &quot;จ่ายแล้ว&quot; ในหน้ารอจ่ายเพื่อไม่หักงบซ้ำ
          </p>
        </section>
      ) : null}

      <div className="flex w-full flex-col gap-2 pt-2">
        <Link href="/app/plan?tab=pending" className={buttonClass("primary", true)}>
          ดูรายการที่เก็บไว้ในแผน
        </Link>
        <Link href="/app" className={buttonClass("secondary", true)}>
          กลับหน้าสรุป
        </Link>
      </div>
    </main>
  );
}
