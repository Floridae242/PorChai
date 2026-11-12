"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import { Mascot } from "@/components/ui/mascot";
import type { SimulateResponse, Summary } from "@/lib/api-types";
import { ApiError } from "@/lib/client/errors";
import { useApi } from "@/lib/client/use-api";
import { formatBaht, parseBahtInput } from "@/lib/format/money";

const TRY_STORAGE_KEY = "porchai.try_item.v1";
const FREE_PLAN_LIMIT = 3;

export interface TryItemDraft {
  title: string;
  amount: number; // satang
  dueOn: string | null;
}

const PRESET_TRIES: { label: string; title: string; amountText: string; amount: number }[] = [
  { label: "รองเท้า 480", title: "รองเท้า", amountText: "480", amount: 48000 },
  { label: "หูฟัง 700", title: "หูฟัง", amountText: "700", amount: 70000 },
  { label: "หมูกระทะ 199", title: "หมูกระทะ", amountText: "199", amount: 19900 },
];

export function saveTryDraft(item: TryItemDraft) {
  try {
    window.sessionStorage.setItem(TRY_STORAGE_KEY, JSON.stringify(item));
  } catch {
    // ignore
  }
}

export function loadTryDraft(): TryItemDraft {
  if (typeof window === "undefined") return { title: "รองเท้า", amount: 48000, dueOn: null };
  try {
    const raw = window.sessionStorage.getItem(TRY_STORAGE_KEY);
    if (!raw) return { title: "รองเท้า", amount: 48000, dueOn: null };
    return JSON.parse(raw) as TryItemDraft;
  } catch {
    return { title: "รองเท้า", amount: 48000, dueOn: null };
  }
}

export function TryInputView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetParam = searchParams?.get("preset");

  const [title, setTitle] = useState(() => {
    if (presetParam === "headphones") return "หูฟัง";
    if (presetParam === "shoes") return "รองเท้า";
    return searchParams?.get("title") ?? "";
  });
  const [amountText, setAmountText] = useState(() => {
    if (presetParam === "headphones") return "700";
    if (presetParam === "shoes") return "480";
    return searchParams?.get("amount") ?? "";
  });
  const [dueOn, setDueOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  function selectPreset(p: (typeof PRESET_TRIES)[number]) {
    setTitle(p.title);
    setAmountText(p.amountText);
    setError(null);
  }

  function handleSubmit() {
    const parsed = parseBahtInput(amountText);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setError(null);
    saveTryDraft({
      title: title.trim() || "ของที่อยากซื้อ",
      amount: parsed.satang,
      dueOn: dueOn.trim() ? dueOn.trim() : null,
    });
    router.push("/app/try/result");
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ลองก่อนจ่าย" back="/app" tone="default" />

      <div className="flex items-center gap-3 rounded-md border border-line bg-subtle p-4">
        <Mascot pose="thinking" size={64} />
        <div className="flex flex-col gap-0.5 text-sm">
          <p className="font-semibold text-primary">จะซื้ออะไร ลองเช็กผลกระทบก่อนได้</p>
          <p className="text-xs text-secondary">การลองคำนวณยังไม่เปลี่ยนยอดเงินจริงของคุณ</p>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
        <span className="text-xs font-semibold text-secondary">ลองล่าสุด / ตัวอย่างยอดฮิต</span>
        <div className="flex flex-wrap gap-2">
          {PRESET_TRIES.map((p) => (
            <Chip
              key={p.label}
              selected={title === p.title && amountText === p.amountText}
              onClick={() => selectPreset(p)}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
        <InputField
          label="ชื่อของที่จะซื้อ (ไม่บังคับ)"
          placeholder="เช่น รองเท้า, หูฟัง, หมูกระทะ"
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

      <Button variant="primary" block disabled={!amountText.trim()} onClick={handleSubmit}>
        ดูผลกระทบต่องบ
      </Button>
    </main>
  );
}

export function TryResultView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [item] = useState<TryItemDraft>(() => {
    const qAmount = searchParams?.get("amount");
    const qTitle = searchParams?.get("title");
    if (qAmount) {
      const parsed = parseBahtInput(qAmount);
      if (parsed.ok) {
        const d = { title: qTitle ?? "หูฟัง", amount: parsed.satang, dueOn: null };
        saveTryDraft(d);
        return d;
      }
    }
    return loadTryDraft();
  });

  const [sim, setSim] = useState<SimulateResponse | null>(null);
  const [choice, setChoice] = useState<"buy" | "skip">("buy");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .simulate({ amount: item.amount, dueOn: item.dueOn })
      .then((res) => {
        if (!cancelled) setSim(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "คำนวณไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, item]);

  if (loading) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังคำนวณผลกระทบ…
      </main>
    );
  }

  if (error || !sim) {
    return (
      <main className="flex flex-col gap-4 py-4 font-body">
        <AppHeader title="ผลเปรียบเทียบ" back="/app/try" tone="default" />
        <Banner kind="error" text={error ?? "เกิดข้อผิดพลาด"} />
      </main>
    );
  }

  const isOverLimit = sim.verdict === "essentials_short" || (sim.overLimitBy !== null && sim.overLimitBy > 0);
  const isShortfall = sim.verdict === "shortfall";
  const beforeDaily = sim.before && sim.before.kind === "ok" ? sim.before.dailyBudget : null;
  const afterDaily = sim.after && sim.after.kind === "ok" ? sim.after.dailyBudget : null;
  const checks = sim.checks;

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ผลเปรียบเทียบ" back="/app/try" tone="default" />

      <div className="flex flex-col items-center gap-2 text-center">
        <Mascot pose={isOverLimit || isShortfall ? "budgetTight" : "budgetOk"} size={72} />
        <h2 className="text-base font-semibold text-primary">
          ลองซื้อ &quot;{item.title}&quot; ราคา {formatBaht(item.amount)} บาท
        </h2>
      </div>

      {isShortfall && sim.after?.kind === "shortfall" ? (
        <Banner
          kind="error"
          text={`เงินไม่พอหักบิลและรายการนี้ ขาดอีก ${formatBaht(sim.after.shortfall)} บาท`}
        />
      ) : isOverLimit && sim.overLimitBy !== null ? (
        <Banner
          kind="warn"
          text={`เกินวงเงินที่ซื้อได้โดยไม่กระทบค่าจำเป็นไป ${formatBaht(sim.overLimitBy)} บาท`}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
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
          ) : sim.after?.kind === "shortfall" ? (
            <span className="text-xl font-bold text-status-danger">
              ขาดอีก {formatBaht(sim.after.shortfall)} บาท
            </span>
          ) : null}
          <span className="text-xs text-secondary">งบรายวันตลอดรอบที่เหลือ</span>
        </button>

        <button
          type="button"
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
          <Button variant="primary" block onClick={() => router.push("/app")}>
            ไม่ซื้อ · กลับหน้าสรุป
          </Button>
        )}
      </div>
    </main>
  );
}

export function TryDecideView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceQuotaFull = searchParams?.get("quota") === "full";

  const [item] = useState<TryItemDraft>(() => loadTryDraft());
  const [decision, setDecision] = useState<"keep" | "pay" | "postpone">("keep");
  const [reservedCount, setReservedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .plans()
      .then(({ plans }) => {
        const count = plans.filter((p) => p.kind === "purchase" && p.status === "reserved").length;
        setReservedCount(count);
      })
      .catch(() => {});
  }, [api]);

  const quotaFull = forceQuotaFull || reservedCount >= FREE_PLAN_LIMIT;

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      if (decision === "keep") {
        if (quotaFull) {
          router.push("/app/plus");
          return;
        }
        await api.addPlan(
          {
            title: item.title,
            amount: item.amount,
            kind: "purchase",
            status: "reserved",
            dueOn: item.dueOn,
          },
          `plan-keep-${Date.now()}`,
        );
        router.replace("/app/try/saved");
      } else if (decision === "pay") {
        await api.addEntry(
          {
            amount: item.amount,
            category: "supplies",
            note: item.title,
          },
          `entry-from-try-${Date.now()}`,
        );
        router.replace("/app/record/done?mode=normal");
      } else {
        await api.addPlan(
          {
            title: item.title,
            amount: item.amount,
            kind: "purchase",
            status: "postponed",
            dueOn: item.dueOn,
          },
          `plan-postpone-${Date.now()}`,
        );
        router.replace("/app/plan?tab=pending");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel =
    decision === "keep"
      ? quotaFull
        ? "ดูสิทธิ์ Plus เพื่อเก็บเพิ่ม"
        : "เก็บไว้ในแผน"
      : decision === "pay"
        ? "ยืนยันจ่ายจริง"
        : "เลื่อนไปรอบหน้า";

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="เลือกทำอะไรต่อ" back="/app/try/result" tone="default" />

      <section className="flex items-center justify-between rounded-md border border-line bg-card p-4 text-sm">
        <span className="font-semibold text-primary">{item.title}</span>
        <span className="font-bold tabular-nums text-primary">{formatBaht(item.amount)} บาท</span>
      </section>

      {quotaFull ? (
        <Banner
          kind="warn"
          text={`ใช้สิทธิ์แผนฟรีแล้ว ${FREE_PLAN_LIMIT}/${FREE_PLAN_LIMIT} รายการในรอบนี้`}
          action={{ label: "ดู Plus ›", href: "/app/plus" }}
        />
      ) : null}

      <section className="flex flex-col gap-2.5 rounded-md border border-line bg-card p-4">
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3.5 text-sm ${
            decision === "keep" ? "border-line-strong bg-selected" : "border-line bg-card"
          }`}
        >
          <input
            type="radio"
            name="tryDecision"
            checked={decision === "keep"}
            onChange={() => setDecision("keep")}
            className="mt-1 size-4 accent-[var(--green-700)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-primary">เก็บไว้ในแผน</span>
            <span className="text-xs text-secondary">ยังไม่จ่าย แต่กันเงินไว้ก่อน</span>
          </div>
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3.5 text-sm ${
            decision === "pay" ? "border-line-strong bg-selected" : "border-line bg-card"
          }`}
        >
          <input
            type="radio"
            name="tryDecision"
            checked={decision === "pay"}
            onChange={() => setDecision("pay")}
            className="mt-1 size-4 accent-[var(--green-700)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-primary">ยืนยันจ่ายจริง</span>
            <span className="text-xs text-secondary">ซื้อแล้ว หักเงินจริงและลงรายการใช้จ่ายวันนี้</span>
          </div>
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3.5 text-sm ${
            decision === "postpone" ? "border-line-strong bg-selected" : "border-line bg-card"
          }`}
        >
          <input
            type="radio"
            name="tryDecision"
            checked={decision === "postpone"}
            onChange={() => setDecision("postpone")}
            className="mt-1 size-4 accent-[var(--green-700)]"
          />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-primary">เลื่อนไปรอบหน้า</span>
            <span className="text-xs text-secondary">เก็บไว้ในรายการรอจ่ายรอบถัดไป ไม่หักงบรอบนี้</span>
          </div>
        </label>
      </section>

      {error ? <Banner kind="error" text={error} /> : null}

      <div className="flex flex-col gap-2">
        <Button variant="primary" block busy={busy} onClick={handleConfirm}>
          {buttonLabel}
        </Button>
        <Link href="/app/try/result" className={buttonClass("ghost", true)}>
          ยกเลิก
        </Link>
      </div>
    </main>
  );
}

export function TrySavedView() {
  const api = useApi();
  const [item] = useState<TryItemDraft>(() => loadTryDraft());
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .summary()
      .then(setSummary)
      .catch(() => {});
  }, [api]);

  return (
    <main className="flex flex-col items-center gap-5 py-8 text-center font-body">
      <Mascot pose="saveCoins" size={80} />

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-primary">เก็บไว้ในแผนแล้ว ✓</h1>
        <p className="text-sm text-secondary">
          กันเงินสำหรับ &quot;{item.title}&quot; ({formatBaht(item.amount)} บาท) ไว้ในแผนรอบนี้เรียบร้อยแล้ว
        </p>
      </div>

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
            เมื่อซื้อจริงแล้ว กด &quot;ยืนยันจ่ายจริง&quot; ในหน้ารอจ่ายเพื่อไม่หักงบซ้ำ
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
        <Link href="/app/plus" className="pt-2 text-xs font-semibold text-link underline underline-offset-4">
          ดู Plus ›
        </Link>
      </div>
    </main>
  );
}
