/** Small pill shown only in mock mode so sample data is never mistaken for real data. */
export function MockBadge({ mode }: { mode: "mock" | "live" }) {
  // Never in production, regardless of the mode prop: real users must not see the sample-data pill.
  if (process.env.NODE_ENV === "production" || mode !== "mock") return null;
  return (
    <div
      aria-hidden={false}
      className="pointer-events-none fixed top-2 right-2 z-40 rounded-pill bg-[var(--accent-reward-bg)] px-3 py-1 font-body text-[12px] text-[var(--text-primary)]"
    >
      ข้อมูลตัวอย่าง
    </div>
  );
}
