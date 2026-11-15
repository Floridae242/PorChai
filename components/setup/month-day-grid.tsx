// Day-of-the-month picker: a 1-31 grid in our own style (not the browser calendar), because the payday
// is "every month on day N", not one date. Days 29-31 are warned: short months use their last day.
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const WARN_FROM = 29;

export function MonthDayGrid({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (day: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-primary">{label}</h2>
      <div role="group" aria-label={label} className="grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => {
          const selected = value === d;
          const warn = d >= WARN_FROM;
          const tone = warn
            ? `border-warn bg-warn-bg text-warn ${selected ? "font-bold ring-2 ring-warn" : ""}`
            : selected
              ? "border-action-primary bg-selected font-semibold text-primary"
              : "border-line-strong bg-card text-primary";
          return (
            <button
              key={d}
              type="button"
              aria-pressed={selected}
              aria-label={`วันที่ ${d}`}
              onClick={() => onChange(d)}
              className={`flex h-10 items-center justify-center rounded-md border font-body text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${tone}`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="flex items-start gap-2 text-xs text-warn">
        <span aria-hidden className="mt-0.5 inline-block size-3 shrink-0 rounded-sm border border-warn bg-warn-bg" />
        <span>วันที่ 29–31: เดือนไหนไม่มีวันนี้ (เช่น กุมภาพันธ์) จะใช้วันสุดท้ายของเดือนนั้นแทน</span>
      </p>
    </div>
  );
}
