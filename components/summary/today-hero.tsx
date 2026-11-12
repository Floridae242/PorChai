"use client";

import Link from "next/link";
import { useState } from "react";
import type { Summary } from "@/lib/api-types";
import { buildDailyBars } from "@/lib/client/summary-helpers";
import type { DailySpend } from "@/lib/client/types";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht } from "@/lib/format/money";

export interface TodayHeroProps {
  summary: Summary;
  /** Per-day spend from the server. null = not available: only the "today" view is shown. */
  daily: DailySpend | null;
  initialView?: "today" | "cycle";
}

export function TodayHero({ summary, daily, initialView = "today" }: TodayHeroProps) {
  const [view, setView] = useState<"today" | "cycle">(initialView);
  const [showMath, setShowMath] = useState(false);

  const { budget } = summary;
  const bars = daily ? buildDailyBars(daily.days, summary.today, budget.kind === "ok" ? budget.dailyBudget : null) : [];
  const activeView = daily ? view : "today";

  let paydayShort = summary.payday;
  try {
    paydayShort = formatThaiDate(summary.payday, "short");
  } catch {
    paydayShort = summary.payday;
  }

  return (
    <section
      style={{ backgroundImage: "var(--hero-gradient)" }}
      className="flex flex-col gap-4 rounded-md p-5 text-on-hero"
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl text-on-hero">พอใช้</span>
      </div>

      {daily ? (
        <div role="tablist" aria-label="มุมมองงบ" className="grid grid-cols-2 gap-1 rounded-pill bg-white/15 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "today"}
            onClick={() => setView("today")}
            className={`rounded-pill py-1.5 text-xs font-semibold transition-colors ${
              activeView === "today" ? "bg-action-primary text-on-action" : "text-on-hero"
            }`}
          >
            เหลือใช้วันนี้
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "cycle"}
            onClick={() => setView("cycle")}
            className={`rounded-pill py-1.5 text-xs font-semibold transition-colors ${
              activeView === "cycle" ? "bg-action-primary text-on-action" : "text-on-hero"
            }`}
          >
            ใช้ไปแต่ละวัน
          </button>
        </div>
      ) : null}

      {activeView === "today" ? (
        <div className="flex flex-col gap-3">
          {budget.kind === "ok" ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[44px] leading-none font-bold tabular-nums text-on-hero">
                  {formatBaht(budget.todayRemaining)}
                </span>
                <span className="text-lg font-semibold text-white/85">บาท</span>
              </div>
              <p className="text-sm text-white/85">
                จากงบวันนี้ {formatBaht(budget.dailyBudget)} บาท · ใช้ไปแล้ว {formatBaht(summary.spentToday)} บาท
              </p>
              <p className="text-xs text-white/85">
                อีก {budget.daysLeft} วันถึงวันเงินเข้า ({paydayShort})
                {budget.maxPurchase !== null ? ` · ซื้อเพิ่มได้ไม่เกิน ${formatBaht(budget.maxPurchase)} บาท` : ""}
              </p>
            </>
          ) : budget.kind === "shortfall" ? (
            <>
              <span className="text-xs font-semibold text-white/85">ยอดที่ขาดในรอบนี้</span>
              <div className="flex items-baseline gap-2">
                <span className="text-[44px] leading-none font-bold tabular-nums text-on-hero">
                  {formatBaht(budget.shortfall)}
                </span>
                <span className="text-lg font-semibold text-white/85">บาท</span>
              </div>
              <p className="text-sm text-white/85">
                เงินที่มีไม่พอหักบิลและเงินที่กันไว้ · อีก {budget.daysLeft} วันถึงวันเงินเข้า ({paydayShort})
              </p>
            </>
          ) : (
            <div className="py-2">
              <p className="text-xl font-bold text-on-hero">ถึงวันเงินเข้าแล้ว</p>
              <p className="text-sm text-white/85">
                คงเหลือไม่จัดสรร {formatBaht(budget.usable)} บาท · กดเริ่มรอบใหม่เพื่อตั้งแผนถัดไป
              </p>
            </div>
          )}

          <button
            type="button"
            aria-expanded={showMath}
            onClick={() => setShowMath((v) => !v)}
            className="self-start text-xs font-semibold text-white/85 underline underline-offset-4"
          >
            {showMath ? "ซ่อนวิธีคิด ▴" : "ดูวิธีคิด ▾"}
          </button>

          {showMath ? (
            <div className="flex flex-col gap-1.5 rounded-sm bg-white/15 p-3 text-xs text-on-hero">
              <div className="flex justify-between">
                <span>เงินที่มีตอนนี้</span>
                <span className="tabular-nums">{formatBaht(summary.balance)} บาท</span>
              </div>
              <div className="flex justify-between">
                <span>หักบิลและรายการในแผน</span>
                <span className="tabular-nums">−{formatBaht(summary.reserved)} บาท</span>
              </div>
              <div className="flex justify-between">
                <span>หักเป้าออมรอบนี้</span>
                <span className="tabular-nums">−{formatBaht(summary.savings)} บาท</span>
              </div>
              <div className="flex justify-between">
                <span>หักเงินเผื่อฉุกเฉิน</span>
                <span className="tabular-nums">−{formatBaht(summary.emergencyBuffer)} บาท</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center justify-between text-xs text-white/85">
            <span>กราฟรายวันในรอบนี้ ({bars.length} วัน)</span>
            {budget.kind === "ok" ? (
              <span className="tabular-nums">เส้นประ = งบ {formatBaht(budget.dailyBudget)} บาท/วัน</span>
            ) : null}
          </div>

          <div style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }} className="relative grid h-36 items-end gap-1 border-b border-white/25 pt-6 pb-1">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/50"
            />
            {bars.map((bar) => (
              <div key={bar.date} className="flex h-full flex-col items-center justify-end gap-1">
                {bar.over ? (
                  <span className="rounded-pill bg-status-warn-bg px-1 text-[9px] font-bold text-status-warn">
                    เกิน
                  </span>
                ) : null}
                {bar.spent !== null && bar.spent > 0 ? (
                  <span className="text-[10px] tabular-nums text-white/85">{formatBaht(bar.spent)}</span>
                ) : null}
                <div
                  style={{ height: `${bar.heightPercent}%` }}
                  className={`w-full rounded-t-sm ${
                    bar.spent === null
                      ? "bg-white/15"
                      : bar.over
                        ? "bg-accent-reward"
                        : bar.isToday
                          ? "bg-action-primary"
                          : "bg-[var(--chart-past)]"
                  }`}
                />
                <span className="text-[10px] tabular-nums text-white/85">{bar.dayNumber}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/20 pt-3 text-xs">
        <Link href="/app/plan?tab=savings" className="font-semibold text-on-hero underline underline-offset-4">
          ดูเงินออม · เงินเผื่อ
        </Link>
        <Link href="/app/plan/edit" className="font-semibold text-white/85 hover:text-on-hero">
          ตัวเลขไม่ตรง? แก้แผน ›
        </Link>
      </div>
    </section>
  );
}
