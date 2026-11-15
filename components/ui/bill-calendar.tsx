"use client";
import { useId } from "react";
import { moveMonth } from "@/lib/bills/calendar";
const DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
export function BillCalendar({
  month,
  selected,
  today,
  counts = {},
  onMonth,
  onSelect,
}: {
  month: string;
  selected: string;
  today: string;
  counts?: Record<string, number>;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const label = useId(),
    [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(),
    length = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((first + length) / 7) * 7 },
    (_, i) => i - first + 1,
  );
  const monthTitle = new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
  return (
    <section
      aria-labelledby={label}
      className="min-w-0 rounded-md border border-line bg-card p-3"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="เดือนก่อนหน้า"
          disabled={month <= moveMonth(today.slice(0, 7), -12)}
          onClick={() => onMonth(moveMonth(month, -1))}
          className="size-11 rounded-pill border border-line disabled:opacity-30"
        >
          ‹
        </button>
        <h2
          id={label}
          aria-live="polite"
          className="text-base font-semibold text-primary"
        >
          {monthTitle}
        </h2>
        <button
          type="button"
          aria-label="เดือนถัดไป"
          disabled={month >= moveMonth(today.slice(0, 7), 12)}
          onClick={() => onMonth(moveMonth(month, 1))}
          className="size-11 rounded-pill border border-line disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <table
        className="w-full table-fixed text-center"
        aria-label={`ปฏิทินบิล ${monthTitle}`}
      >
        <thead>
          <tr>
            {DAYS.map((day) => (
              <th
                key={day}
                scope="col"
                className="py-2 text-xs font-normal text-secondary"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <tr key={row}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (day < 1 || day > length) return <td key={col} />;
                const date = `${month}-${String(day).padStart(2, "0")}`,
                  count = counts[date] ?? 0;
                return (
                  <td key={col} className="p-0.5">
                    <button
                      type="button"
                      aria-label={`${date}${count ? ` มี ${count} บิล` : ""}`}
                      aria-pressed={date === selected}
                      aria-current={date === today ? "date" : undefined}
                      onClick={() => onSelect(date)}
                      className={`flex min-h-11 w-full flex-col items-center justify-center rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${date === selected ? "bg-action-primary text-on-action" : date === today ? "bg-subtle font-bold text-primary" : "text-primary"}`}
                    >
                      <span>{day}</span>
                      <span
                        aria-hidden="true"
                        className="h-2 text-[8px] leading-2"
                      >
                        {count ? "●" : ""}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-secondary">● มีบิล · แตะวันที่เพื่อดูหรือเพิ่มบิล</p>
    </section>
  );
}
