"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
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

// Home "dashboard": this month's recorded totals (from the server) and the way into the other screens.
const DASHBOARD_LINKS = [
  {
    href: "/app/reports",
    label: "รายงานวัน / เดือน",
    hint: "กราฟและรายการแต่ละวัน",
  },
  {
    href: "/app/insights",
    label: "พฤติกรรมและงบรายหมวด",
    hint: "ใช้เงินไปกับอะไรบ้าง",
  },
  { href: "/app/search", label: "ค้นหา · AI Search", hint: "ค้นรายการที่จดไว้" },
  {
    href: "/app/notifications",
    label: "สรุปและเตือนผ่าน LINE",
    hint: "ตั้งเวลาเอง ปิดได้",
  },
  { href: "/app/help", label: "วิธีใช้พอใช้", hint: "เริ่มต้นและคำถามที่พบบ่อย" },
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
      <nav aria-label="เมนูรายงานและเครื่องมือ">
        <ul className="grid grid-cols-2 gap-2">
          {DASHBOARD_LINKS.map((l, i) => (
            <li key={l.href} className={i === 4 ? "col-span-2" : ""}>
              <Link
                href={l.href}
                className="flex h-full min-h-16 items-center justify-between gap-2 rounded-sm border border-line bg-card px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="break-words text-sm font-semibold leading-6 text-primary">
                    {l.label}
                  </span>
                  <span className="text-xs leading-5 text-secondary">
                    {l.hint}
                  </span>
                </span>
                <span aria-hidden className="text-lg text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
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
  const max = Math.max(1, ...(report?.days.map((d) => d.spent ?? 0) ?? []));
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
        <p role="status" aria-busy="true" className="py-6 text-secondary">
          กำลังโหลดรายงาน…
        </p>
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
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="mb-4 font-bold text-primary">รายจ่ายแต่ละวัน</h2>
            <ol className="grid grid-cols-7 gap-2">
              {report.days.map((d) => (
                <li key={d.date}>
                  <button
                    type="button"
                    aria-label={`${d.date}: ${d.spent === null ? "ยังไม่ถึงวันนี้" : `${formatBaht(d.spent)} บาท`}`}
                    aria-pressed={focusedDay === d.date}
                    onClick={() => setFocusedDay(d.date)}
                    className="flex w-full flex-col items-center gap-1 rounded-sm bg-subtle px-1 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="flex h-16 items-end" aria-hidden="true">
                      <span
                        className={
                          d.spent === null
                            ? "w-4 rounded-sm bg-line"
                            : "w-4 rounded-sm bg-action-primary"
                        }
                        style={{
                          height: `${d.spent === null ? 2 : Math.max(3, (d.spent / max) * 64)}px`,
                        }}
                      />
                    </span>
                    <span className="text-xs text-secondary">
                      {Number(d.date.slice(-2))}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {focusedDay && report.days.some((d) => d.date === focusedDay) ? (
              <p role="status" className="mt-3 text-sm text-primary">
                {focusedDay} ·{" "}
                {report.days.find((d) => d.date === focusedDay)?.spent === null
                  ? "ยังไม่ถึงวันนี้"
                  : `${formatBaht(report.days.find((d) => d.date === focusedDay)!.spent!)} บาท`}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-secondary">
              แตะหรืออ่านแต่ละวันเพื่อดูยอด · ช่องอนาคตยังไม่มีข้อมูล
            </p>
          </section>
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="mb-3 font-bold text-primary">แยกตามหมวด</h2>
            <ul className="flex flex-col gap-3">
              {report.categories.map((c) => (
                <li key={c.category}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span>
                      {CATEGORY_LABELS[c.category]} · {c.count} รายการ
                    </span>
                    <strong className="tabular-nums">
                      {formatBaht(c.amount)} บาท
                    </strong>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-pill bg-subtle"
                    aria-hidden="true"
                  >
                    <div
                      className="h-2 rounded-pill bg-action-primary"
                      style={{
                        width: `${report.spending ? (c.amount / report.spending) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
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
