// Grey pulsing blocks where content will be, instead of a line of "loading" text. The text stays for
// screen readers (and for tests); the blocks are decoration.
export function LoadingSkeleton({
  label = "กำลังโหลด…",
  rows = 3,
  className = "",
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`flex flex-col gap-3 py-2 ${className}`}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`rounded-md bg-subtle motion-safe:animate-pulse ${i === 0 ? "h-24" : "h-14"}`}
        />
      ))}
    </div>
  );
}
