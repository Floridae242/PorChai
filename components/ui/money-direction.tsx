import { ArrowInIcon, ArrowOutIcon } from "@/components/shell/icons";

// The round arrow at the start of a money row: received (green, arrow in) or spent (neutral, arrow out).
// Colour is never the only cue: the shape differs, the label is read aloud, and the +/− sign stays.
export function MoneyDirection({ kind }: { kind: "income" | "expense" }) {
  const income = kind === "income";
  return (
    <span
      role="img"
      aria-label={income ? "เงินเข้า" : "เงินออก"}
      className={`flex size-9 shrink-0 items-center justify-center rounded-pill border ${
        income ? "border-[var(--lime-300)] bg-card text-ok" : "border-line bg-app text-secondary"
      }`}
    >
      {income ? <ArrowInIcon /> : <ArrowOutIcon />}
    </span>
  );
}
