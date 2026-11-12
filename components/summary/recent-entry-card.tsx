import Link from "next/link";
import type { Entry } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht } from "@/lib/format/money";
import { Mascot } from "@/components/ui/mascot";

/** Receipt styling matches the OA card; all values come from the authenticated entries API. */
export function RecentEntryCard({ entry }: { entry: Entry }) {
  const title = entry.note ?? CATEGORY_LABELS[entry.category];
  return (
    <article className="overflow-hidden rounded-md border border-line bg-card">
      <div className="flex items-center justify-between gap-3 bg-subtle px-4 py-2">
        <div>
          <p className="text-sm font-semibold text-primary">บันทึกแล้ว ✓</p>
          <p className="mt-1 text-xs text-secondary">
            {entry.source === "chat" ? "จดจาก LINE" : "จดในพอใช้"} ·{" "}
            {formatThaiDate(entry.spentOn, "short")}
          </p>
        </div>
        <Mascot pose="budgetOk" size={48} />
      </div>
      <div className="space-y-3 p-4">
        <span className="inline-block rounded-pill bg-selected px-2.5 py-1 text-xs font-semibold text-primary">
          รายจ่าย · {CATEGORY_LABELS[entry.category]}
        </span>
        <div className="flex items-start justify-between gap-4">
          <h3 className="min-w-0 break-words text-base font-semibold text-primary">
            {title}
          </h3>
          <p className="shrink-0 text-lg font-bold tabular-nums text-link">
            −฿{formatBaht(entry.amount)}
          </p>
        </div>
        <Link
          href={`/app/record/${entry.id}`}
          aria-label={`ดูหรือแก้ไข ${title}`}
          className="flex min-h-11 items-center justify-between rounded-sm border border-line px-3 text-xs font-semibold text-link"
        >
          ดู / แก้ไขรายการ<span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}
