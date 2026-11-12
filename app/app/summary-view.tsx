"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/shell/toast";
import { TodayHero } from "@/components/summary/today-hero";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { Mascot } from "@/components/ui/mascot";
import type { Entry, Summary } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { ApiError } from "@/lib/client/errors";
import type { CategoryTotals, DailySpend } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import { formatThaiDate, formatThaiTime } from "@/lib/format/date";
import { formatBaht } from "@/lib/format/money";

const TIGHT_THRESHOLD_SATANG = 5000;
const MSG_NOT_READY = "ยังไม่พร้อมใช้งาน";

interface Points {
  balance: number;
  claimedToday: boolean;
}

// No points API yet (or it failed): show 0, never a guess.
const NO_POINTS: Points = { balance: 0, claimedToday: false };

function isCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code;
}

export function SummaryView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const shownToast = useRef(false);
  const claim = useSubmit<{ balance: number; claimedToday: true }>();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [points, setPoints] = useState<Points>(NO_POINTS);
  // null = the server cannot provide it (not implemented / failed): that section is hidden.
  const [daily, setDaily] = useState<DailySpend | null>(null);
  const [categories, setCategories] = useState<CategoryTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sumRes, entRes] = await Promise.all([api.summary(), api.entries()]);
        const [ptsRes, dailyRes, catRes] = await Promise.all([
          api.points().catch(() => null),
          api.dailySpend().catch(() => null),
          api.categoryTotals().catch(() => null),
        ]);
        if (cancelled) return;
        setSummary(sumRes);
        setEntries(entRes.entries);
        setPoints(ptsRes ?? NO_POINTS);
        setDaily(dailyRes);
        setCategories(catRes);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // Redirects keep the neutral loading state on screen: no error flash while navigating.
        if (isCode(err, "no_cycle")) {
          router.replace("/app/setup/income");
          return;
        }
        if (isCode(err, "no_consent")) {
          router.replace("/app/consent");
          return;
        }
        setFailed(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt]);

  useEffect(() => {
    if (shownToast.current) return;
    const t = searchParams?.get("toast");
    if (t === "saved") {
      shownToast.current = true;
      toast.show("บันทึกแผนแล้ว", { mascot: "budgetOk" });
    }
  }, [searchParams, toast]);

  async function handleClaimPoints() {
    const result = await claim.submit("claim-daily-points", (key) => api.claimPoints(key));
    if (result.ok) {
      setPoints(result.value);
      toast.show(`รับแต้มฟรีแล้ว +1 · รวม ${result.value.balance} แต้ม`, { mascot: "reward" });
      return;
    }
    if ("skipped" in result) return;
    // Points stay exactly as they were: nothing was granted.
    toast.show(
      isCode(result.error, "not_implemented")
        ? MSG_NOT_READY
        : result.error instanceof ApiError
          ? result.error.message
          : "รับแต้มไม่สำเร็จ ลองใหม่อีกครั้ง",
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 py-12 font-body" aria-busy="true">
        <Mascot pose="thinking" size={72} />
        <p className="text-sm font-medium text-secondary">กำลังคำนวณเงินที่ใช้ได้วันนี้…</p>
      </main>
    );
  }

  if (failed || !summary) {
    return (
      <main className="flex flex-col gap-4 py-8 font-body">
        <Banner kind="error" text="เชื่อมต่อไม่ได้ ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง" />
        <Button
          variant="primary"
          onClick={() => {
            setLoading(true);
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          ลองใหม่
        </Button>
      </main>
    );
  }

  const { budget } = summary;
  const recentEntries = entries.slice(0, 5);
  const isMidCycle = searchParams?.get("view") === "cycle";

  return (
    <main className="flex flex-col gap-4 py-4 font-body">
      {budget.kind === "payday-passed" ? (
        <Banner
          kind="info"
          text="ถึงวันเงินเข้าแล้ว เริ่มตั้งรอบใหม่เพื่อคำนวณงบต่อได้เลย"
          action={{ label: "เริ่มรอบใหม่", href: "/app/cycle/new" }}
        />
      ) : budget.kind === "shortfall" ? (
        <div className="flex flex-col items-center gap-3">
          <Mascot pose="budgetTight" size={72} />
          <div className="w-full">
            <Banner
              kind="error"
              text={`เงินที่มีไม่พอหักบิลและเงินที่กันไว้ ขาดอีก ${formatBaht(budget.shortfall)} บาท`}
              action={{ label: "แก้แผน", href: "/app/plan/edit" }}
            />
          </div>
        </div>
      ) : budget.dailyBudget < TIGHT_THRESHOLD_SATANG ? (
        <div className="flex flex-col items-center gap-3">
          <Mascot pose="budgetTight" size={72} />
          <div className="w-full">
            <Banner
              kind="warn"
              text="งบต่อวันต่ำกว่า 50 บาท ลองปรับแผนหรือเช็กยอดเงินจริง"
              action={{ label: "แก้แผน", href: "/app/plan/edit" }}
            />
          </div>
        </div>
      ) : null}

      <TodayHero summary={summary} daily={daily} initialView={isMidCycle ? "cycle" : "today"} />

      <div className="flex items-center justify-between rounded-md border border-line bg-card px-4 py-2.5 text-xs">
        <span className="text-secondary">
          อัปเดตยอดล่าสุด {formatThaiTime(summary.balanceAsOf)} น. · คงเหลือจริง {formatBaht(summary.balance)} บาท
        </span>
        <Link href="/app/balance/adjust" className="font-semibold text-link">
          ปรับยอด ›
        </Link>
      </div>

      <section className="flex items-center justify-between gap-3 rounded-md border border-line bg-accent-reward-bg p-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">สะสมแต้มรายวัน</span>
            <span className="rounded-pill bg-accent-reward px-2 py-0.5 text-xs font-bold text-primary">
              {points.balance} แต้ม
            </span>
          </div>
          <Link href="/app/points" className="text-xs font-semibold text-link underline underline-offset-4">
            ดูแต้มและแลกของรางวัล ›
          </Link>
        </div>
        {points.claimedToday ? (
          <span className="rounded-pill border border-line-strong bg-card px-4 py-2 text-xs font-semibold text-status-ok">
            รับแต้มฟรีแล้ววันนี้ ✓
          </span>
        ) : (
          <Button variant="primary" busy={claim.busy} onClick={handleClaimPoints}>
            รับแต้มฟรี
          </Button>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {categories ? (
          <section className="flex flex-col justify-between gap-3 rounded-md border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-primary">ใช้ไปกับอะไร</h2>
              <Link href="/app/summary/categories" className="text-xs font-semibold text-link">
                ดูสรุปหมวด ›
              </Link>
            </div>
            {categories.items.length === 0 ? (
              <p className="text-sm text-muted">ยังไม่มีรายการใช้จ่ายในรอบนี้</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {categories.items.slice(0, 3).map((cat) => (
                  <li key={cat.category} className="flex items-center justify-between">
                    <span className="text-secondary">
                      {CATEGORY_LABELS[cat.category]} ({cat.count})
                    </span>
                    <span className="font-semibold tabular-nums text-primary">{formatBaht(cat.amount)} บาท</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="flex flex-col justify-between gap-2 rounded-md border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-primary">รอบที่แล้ว</h2>
          <p className="text-sm text-secondary">
            สรุปเปรียบเทียบการใช้จ่ายและเงินออมจากรอบก่อนหน้า จะแสดงเมื่อจบรอบเงินแรกของคุณ
          </p>
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">รายการล่าสุด</h2>
          <Link href="/app/plan?tab=list" className="text-xs font-semibold text-link">
            ดูทั้งหมด ›
          </Link>
        </div>

        {recentEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <Mascot pose="greeting" size={96} />
            <p className="text-sm text-secondary">วันนี้ยังไม่มีรายการจด ลองบันทึกมื้อแรกของวันได้เลย</p>
            <Link href="/app/record/new?type=expense" className={buttonClass("secondary")}>
              จดรายการแรก
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {recentEntries.map((entry) => (
              <ListRow
                key={entry.id}
                title={entry.note ?? CATEGORY_LABELS[entry.category]}
                subtitle={`${CATEGORY_LABELS[entry.category]} · ${formatThaiDate(entry.spentOn, "short")}`}
                amount={`−${formatBaht(entry.amount)} บาท`}
                href={`/app/record/${entry.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
