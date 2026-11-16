"use client";

import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { formatBaht } from "@/lib/format/money";
import type { FinanceReport } from "@/lib/reports/types";

// Spending by category as a ring. The ring is a picture only: every number written on the screen
// (centre, list) is the server's amount, nothing is added up or turned into a percentage here.
// Limits handled on purpose:
//  - colour is never the only cue: every slice has a row with its name, count and amount, and tapping a
//    row (or the slice) lights that slice up and shows its amount in the centre;
//  - more categories than colours: the palette repeats, so the row tap is what tells two slices apart;
//  - no red (reserved for danger), a thin gap between slices, and the order follows the list.
const PALETTE = [
  "var(--green-800)",
  "var(--lime-300)",
  "var(--sage-400)",
  "var(--green-500)",
  "var(--amber-600)",
  "var(--green-700)",
  "#C9CDBF",
];
const R = 42;
const CIRC = 2 * Math.PI * R;
const GAP = 1.2; // visual gap between slices, in the ring's units

export function CategoryDonut({
  categories,
  spending,
  title = "รายจ่ายแบ่งตามหมวด",
}: {
  categories: FinanceReport["categories"];
  spending: number;
  title?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const rows = categories.filter((c) => c.amount > 0);
  const total = rows.length > 0 && spending > 0 ? spending : 0;
  const active = rows.find((c) => c.category === picked) ?? null;
  const toggle = (key: string) => setPicked((p) => (p === key ? null : key));

  const lens = rows.map((c) => (total ? (c.amount / total) * CIRC : 0));
  const slices = rows.map((c, i) => ({
    c,
    i,
    len: lens[i],
    offset: lens.slice(0, i).reduce((n, l) => n + l, 0),
  }));

  return (
    <section
      className="rounded-md border border-line bg-card p-4"
      aria-label={title}
    >
      <h2 className="font-bold text-primary">{title}</h2>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-secondary">ยังไม่มีรายจ่ายในช่วงนี้</p>
      ) : (
        <>
          <div className="relative mx-auto mt-3 size-48">
            <svg
              viewBox="0 0 100 100"
              className="size-full -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke="var(--lime-100)"
                strokeWidth="14"
              />
              {slices.map(({ c, i, len, offset: off }) => (
                <circle
                  key={c.category}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={active?.category === c.category ? 17 : 14}
                  strokeDasharray={`${Math.max(0, len - (rows.length > 1 ? GAP : 0))} ${CIRC}`}
                  strokeDashoffset={-off}
                  opacity={active && active.category !== c.category ? 0.35 : 1}
                  onClick={() => toggle(c.category)}
                  className="cursor-pointer"
                />
              ))}
            </svg>
            <div
              aria-live="polite"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center"
            >
              <span className="text-xs text-secondary">
                {active ? CATEGORY_LABELS[active.category] : "รายจ่ายรวม"}
              </span>
              <strong
                data-clarity-mask="true"
                className="text-xl tabular-nums text-primary"
              >
                {formatBaht(active ? active.amount : spending)}
              </strong>
              <span className="text-xs text-secondary">บาท</span>
            </div>
          </div>

          <ul className="mt-3 flex flex-col gap-1">
            {rows.map((c, i) => (
              <li key={c.category}>
                <button
                  type="button"
                  aria-pressed={picked === c.category}
                  onClick={() => toggle(c.category)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${
                    picked === c.category ? "bg-selected" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-sm"
                    style={{ background: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="flex-1">
                    {CATEGORY_LABELS[c.category]} · {c.count} รายการ
                  </span>
                  <strong data-clarity-mask="true" className="tabular-nums">
                    {formatBaht(c.amount)} บาท
                  </strong>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-secondary">
            แตะหมวดหรือชิ้นวงกลมเพื่อดูยอดของหมวดนั้นตรงกลาง
          </p>
        </>
      )}
    </section>
  );
}
