// The result of the payday question: the date the budget will be counted to. It decides the daily
// budget, so it is a highlighted card, not helper text.
export function NextPaydayCard({ dateText, daysLeft }: { dateText: string; daysLeft: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-md border-2 border-action-primary bg-selected p-4"
    >
      <span className="text-xs font-semibold text-secondary">เงินเข้าครั้งถัดไป</span>
      <span className="text-xl font-bold leading-snug text-primary">{dateText}</span>
      <span className="self-start rounded-pill bg-card px-3 py-1 text-sm font-semibold tabular-nums text-primary">
        อีก {daysLeft} วัน
      </span>
    </div>
  );
}
