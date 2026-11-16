"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht } from "@/lib/format/money";
import type { FinanceReport } from "@/lib/reports/types";

export type ReportView = "all" | "expense" | "income";

const TITLES: Record<ReportView, string> = {
  all: "รายรับและรายจ่ายแต่ละวัน",
  expense: "รายจ่ายแต่ละวัน",
  income: "รายรับแต่ละวัน",
};
const BAR_PX = 96; // height of the tallest bar

const showSpent = (v: ReportView) => v !== "income";
const showIncome = (v: ReportView) => v !== "expense";

function barHeight(value: number, max: number): number {
  return value === 0 ? 2 : Math.max(3, Math.round((value / max) * BAR_PX));
}

function dayLabel(
  day: FinanceReport["days"][number],
  view: ReportView,
): string {
  const date = formatThaiDate(day.date, "short");
  if (day.spent === null || day.income === null) return `${date}: ยังไม่ถึงวันนี้`;
  const parts: string[] = [];
  if (showIncome(view)) parts.push(`รายรับ ${formatBaht(day.income)} บาท`);
  if (showSpent(view)) parts.push(`รายจ่าย ${formatBaht(day.spent)} บาท`);
  return `${date}: ${parts.join(" ")}`;
}

// Daily income and spending from the server's report. Green = received, dark grey = spent (the same
// colours as the arrows in the money list). The scale is the largest value shown, so a bar is never
// taller than the data; nothing here adds money up.
export function DailyChart({
  days,
  view,
  focused,
  onFocus,
}: {
  days: FinanceReport["days"];
  view: ReportView;
  focused: string | null;
  onFocus: (date: string) => void;
}) {
  const values = days.flatMap((d) => [
    showSpent(view) ? d.spent : null,
    showIncome(view) ? d.income : null,
  ]);
  const max = Math.max(1, ...values.filter((n): n is number => n !== null));
  const anyData = values.some((n) => n !== null && n > 0);
  const picked = days.find((d) => d.date === focused) ?? null;
  // Bring the focused day into view sideways only (the page itself must not jump)
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const box = scroller.current;
      const el = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (box && el)
        box.scrollLeft = Math.max(
          0,
          el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2,
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [focused, days.length]);

  return (
    <section
      className="rounded-md border border-line bg-card p-4"
      aria-label={TITLES[view]}
    >
      <h2 className="font-bold text-primary">{TITLES[view]}</h2>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
        {showIncome(view) ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm bg-action-primary"
            />
            รายรับ
          </span>
        ) : null}
        {showSpent(view) ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm bg-secondary"
            />
            รายจ่าย
          </span>
        ) : null}
        <span className="ml-auto">
          {anyData ? `แท่งสูงสุด = ${formatBaht(max)} บาท` : "ยังไม่มียอดในช่วงนี้"}
        </span>
      </p>

      <div ref={scroller} className="relative mt-3 overflow-x-auto">
        <ol className="flex min-w-max items-end gap-1 border-b border-line">
          {days.map((d) => {
            const future = d.spent === null || d.income === null;
            return (
              <li key={d.date}>
                <button
                  type="button"
                  aria-label={dayLabel(d, view)}
                  aria-pressed={focused === d.date}
                  onClick={() => onFocus(d.date)}
                  className={`flex w-9 flex-col items-center gap-1 rounded-sm px-0.5 pb-1 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${
                    focused === d.date ? "bg-selected" : ""
                  }`}
                >
                  <span
                    className="flex items-end gap-0.5"
                    style={{ height: BAR_PX }}
                    aria-hidden="true"
                  >
                    {future ? (
                      <span
                        className="w-2.5 rounded-sm bg-line"
                        style={{ height: 2 }}
                      />
                    ) : (
                      <>
                        {showIncome(view) ? (
                          <span
                            className="w-2.5 rounded-t-sm bg-action-primary"
                            style={{ height: barHeight(d.income!, max) }}
                          />
                        ) : null}
                        {showSpent(view) ? (
                          <span
                            className="w-2.5 rounded-t-sm bg-secondary"
                            style={{ height: barHeight(d.spent!, max) }}
                          />
                        ) : null}
                      </>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-secondary">
                    {Number(d.date.slice(-2))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-2 text-xs text-secondary">
        เลื่อนซ้าย-ขวาดูทั้งเดือน · แตะแท่งเพื่อดูยอดของวันนั้น · วันที่ยังไม่ถึงเป็นแท่งเส้นบาง
      </p>

      {picked ? (
        <div
          role="status"
          className="mt-3 rounded-md bg-subtle p-3 text-sm text-primary"
        >
          <p className="font-semibold">{formatThaiDate(picked.date, "long")}</p>
          {picked.spent === null || picked.income === null ? (
            <p className="mt-1 text-secondary">ยังไม่ถึงวันนี้</p>
          ) : (
            <dl className="mt-1 flex flex-col gap-1">
              {showIncome(view) ? (
                <div className="flex justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block size-2.5 rounded-sm bg-action-primary"
                    />
                    รายรับ
                  </dt>
                  <dd
                    data-clarity-mask="true"
                    className="font-semibold tabular-nums text-ok"
                  >
                    +{formatBaht(picked.income)} บาท
                  </dd>
                </div>
              ) : null}
              {showSpent(view) ? (
                <div className="flex justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block size-2.5 rounded-sm bg-secondary"
                    />
                    รายจ่าย
                  </dt>
                  <dd
                    data-clarity-mask="true"
                    className="font-semibold tabular-nums"
                  >
                    −{formatBaht(picked.spent)} บาท
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </div>
      ) : null}

      {view === "income" ? (
        <p className="mt-3 text-xs text-secondary">
          รายรับไม่แบ่งเป็นหมวด · ดูรายการรายรับทีละรายการได้ที่{" "}
          <Link href="/app/plan?tab=list" className="font-semibold text-link">
            แผนเงิน › รายรับ
          </Link>
        </p>
      ) : null}
    </section>
  );
}
