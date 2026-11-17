"use client";
import Link from "next/link";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CategoryDonut } from "./category-donut";
import { DailyChart, type ReportView } from "./daily-chart";
import { useApi } from "@/lib/client/use-api";
import { useDataRevision } from "@/lib/client/use-data-revision";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { thaiDate } from "@/lib/calc/time";
import { formatBaht } from "@/lib/format/money";
import type { FinanceReport } from "@/lib/reports/types";

export function ReportNumbers({
  report,
  compact = false,
}: {
  report: FinanceReport;
  compact?: boolean;
}) {
  return (
    <dl
      className={
        compact
          ? "grid grid-cols-2 gap-3"
          : "grid grid-cols-2 gap-3 sm:grid-cols-3"
      }
    >
      {[
        ["รายจ่ายที่จด", report.spending],
        ["รายรับที่จด", report.income],
        ["รายรับ − รายจ่าย", report.net],
      ].map(([label, amount], index) => (
        <div
          key={String(label)}
          className={`min-w-0 rounded-md border border-line ${compact && index === 2 ? "col-span-2 flex flex-wrap items-center justify-between gap-2 bg-subtle px-4 py-3" : "bg-card p-4"}`}
        >
          <dt className="text-xs text-secondary">{label}</dt>
          <dd
            data-clarity-mask="true"
            className={`break-words font-bold tabular-nums ${Number(amount) < 0 ? "text-danger" : "text-primary"} ${compact && index === 2 ? "text-lg" : "mt-2 text-xl"}`}
          >
            {formatBaht(Number(amount))}
            <span className="ml-1 text-xs font-normal">บาท</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Home "dashboard": this month's recorded totals (from the server), one main link into the report,
// and the other tools as small text links.
const DASHBOARD_LINKS = [
  { href: "/app/insights", label: "พฤติกรรมและงบรายหมวด" },
  { href: "/app/search", label: "AI Search" },
  { href: "/app/notifications", label: "ตั้งค่าสรุปผ่าน LINE" },
  { href: "/app/help", label: "วิธีใช้พอใช้" },
] as const;

export function DashboardInsights() {
  const api = useApi();
  const revision = useDataRevision();
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .report("month")
      .then((r) => {
        if (active) {
          setReport(r);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api, revision]);
  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-line bg-subtle p-4"
      aria-label="ภาพรวมรายงาน"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-primary">ภาพรวมเดือนนี้</h2>
        <span className="rounded-pill bg-card px-3 py-1 text-xs text-secondary">
          จากรายการที่คุณจด
        </span>
      </div>
      {report ? (
        <ReportNumbers report={report} compact />
      ) : (
        <p className="text-sm text-secondary" aria-busy={!failed}>
          {failed
            ? "ยังโหลดรายงานไม่ได้ เปิดหน้ารายงานเพื่อลองใหม่ได้ครับ"
            : "กำลังโหลดรายงาน…"}
        </p>
      )}
      {report && (
        <p className="text-xs leading-5 text-secondary">
          ส่วนต่างรายรับกับรายจ่ายนี้ไม่ใช่เงินคงเหลือ ดูเงินที่ใช้ได้จริงจากการ์ดวันนี้ด้านบน
        </p>
      )}
      {report && failed && (
        <p role="status" className="text-xs text-danger">
          ยังอัปเดตรายงานไม่ได้ ตัวเลขอาจยังไม่ล่าสุด
        </p>
      )}
      <Link
        href="/app/reports"
        className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-line-strong bg-card px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-primary">
            ดูรายงานวัน / เดือน
          </span>
          <span className="truncate text-xs text-secondary">
            กราฟและรายการแต่ละวัน
          </span>
        </span>
        <span aria-hidden className="text-lg text-muted">
          ›
        </span>
      </Link>
      <nav
        aria-label="เมนูรายงานและเครื่องมือ"
        className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-link"
      >
        {DASHBOARD_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex min-h-8 items-center"
          >
            {l.label} ›
          </Link>
        ))}
      </nav>
    </section>
  );
}
export function ReportsView() {
  const api = useApi();
  const revision = useDataRevision();
  const today = thaiDate(new Date());
  const [period, setPeriod] = useState<"day" | "month">("month");
  const [anchor, setAnchor] = useState<string | undefined>();
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [view, setView] = useState<ReportView>("all");
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(
    () => ({ api, period, anchor, attempt, revision }),
    [api, period, anchor, attempt, revision],
  );
  const [loaded, setLoaded] = useState<{
    key: typeof key;
    report: FinanceReport | null;
    failed: boolean;
  } | null>(null);
  const report = loaded?.key === key ? loaded.report : null,
    failed = loaded?.key === key && loaded.failed;
  const currentDay = report?.asOf ?? today;
  useEffect(() => {
    let active = true;
    key.api
      .report(key.period, key.anchor)
      .then((r) => {
        if (active) setLoaded({ key, report: r, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ key, report: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [key]);
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="รายงานของฉัน" back="/app" tone="default" />
      <div className="flex gap-2" aria-label="ช่วงรายงาน">
        {(["day", "month"] as const).map((p) => (
          <Button
            key={p}
            variant={p === period ? "primary" : "secondary"}
            aria-pressed={p === period}
            onClick={() => {
              setPeriod(p);
              setAnchor(undefined);
            }}
          >
            {p === "day" ? "รายวัน" : "รายเดือน"}
          </Button>
        ))}
      </div>
      <label className="flex flex-col gap-2 text-sm font-semibold text-primary">
        {period === "day" ? "เลือกวันที่" : "เลือกเดือน"}
        <input
          className="min-h-12 rounded-sm border border-line-strong bg-card px-3"
          type={period === "day" ? "date" : "month"}
          max={period === "day" ? currentDay : currentDay.slice(0, 7)}
          value={
            period === "day"
              ? (anchor ?? currentDay)
              : (anchor ?? currentDay).slice(0, 7)
          }
          onChange={(e) =>
            setAnchor(
              e.target.value
                ? period === "day"
                  ? e.target.value
                  : `${e.target.value}-01`
                : undefined,
            )
          }
        />
      </label>
      {failed ? (
        <>
          <Banner kind="error" text="โหลดรายงานไม่สำเร็จ ลองใหม่อีกครั้ง" />
          <Button onClick={() => setAttempt((n) => n + 1)}>ลองใหม่</Button>
        </>
      ) : !report ? (
        <LoadingSkeleton label="กำลังโหลดรายงาน…" />
      ) : (
        <>
          <ReportNumbers report={report} />
          <p className="text-xs text-secondary">
            รวมรายการที่จดและบิลที่จ่ายแล้ว · ไม่รวมรายการยกเลิก ·
            ตัวเลขสุทธิไม่ใช่ยอดเงินคงเหลือหรือเงินออม
          </p>
          {report.entriesCount === 0 && report.income === 0 ? (
            <Banner kind="info" text="ยังไม่มีรายการที่จดในช่วงนี้" />
          ) : null}
          <div
            role="group"
            aria-label="เลือกข้อมูลที่แสดง"
            className="flex flex-wrap gap-2"
          >
            {(
              [
                ["all", "ทั้งหมด"],
                ["expense", "รายจ่าย"],
                ["income", "รายรับ"],
              ] as const
            ).map(([key, label]) => (
              <Chip
                key={key}
                selected={view === key}
                onClick={() => setView(key)}
              >
                {label}
              </Chip>
            ))}
          </div>
          {period === "month" ? (
            <DailyChart
              days={report.days}
              view={view}
              focused={
                focusedDay ??
                (report.days.some((d) => d.date === report.asOf)
                  ? report.asOf
                  : null)
              }
              onFocus={setFocusedDay}
            />
          ) : null}
          {view !== "income" ? (
            <CategoryDonut
              categories={report.categories}
              spending={report.spending}
              title={
                period === "day" ? "รายจ่ายของวันนี้ แบ่งตามหมวด" : "แยกตามหมวด"
              }
            />
          ) : period === "day" ? (
            <p className="rounded-md border border-line bg-card p-4 text-sm text-secondary">
              รายรับของวันนี้อยู่ในช่องรายรับด้านบน · รายรับไม่แบ่งเป็นหมวด ดูรายการได้ที่{" "}
              <Link
                href="/app/plan?tab=list"
                className="font-semibold text-link"
              >
                แผนเงิน › รายรับ
              </Link>
            </p>
          ) : null}
        </>
      )}
      <Link href="/app/notifications" className={buttonClass("secondary")}>
        ตั้งค่าสรุปผ่าน LINE
      </Link>
      <Link href="/app/insights" className={buttonClass("secondary")}>
        ดูพฤติกรรมและคำแนะนำจากรายการที่จด
      </Link>
    </main>
  );
}
