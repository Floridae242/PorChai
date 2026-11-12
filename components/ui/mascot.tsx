export type MascotPose =
  | "greeting"
  | "thinking"
  | "scanReceipt"
  | "budgetOk"
  | "budgetTight"
  | "reminder"
  | "saveCoins"
  | "reward";

export const MASCOT_POSES: readonly MascotPose[] = [
  "greeting",
  "thinking",
  "scanReceipt",
  "budgetOk",
  "budgetTight",
  "reminder",
  "saveCoins",
  "reward",
];

export type MascotProps = { pose: MascotPose; size?: number };

function clamp(size: number): number {
  if (!Number.isFinite(size)) return 80;
  return Math.min(96, Math.max(32, Math.round(size)));
}

/** Decorative illustration (alt=""). Animated webp unless the user prefers reduced motion. */
export function Mascot({ pose, size = 80 }: MascotProps) {
  const px = clamp(size);
  return (
    <picture>
      <source srcSet={`/mascot/${pose}.webp`} media="(prefers-reduced-motion: no-preference)" />
      <img src={`/mascot/${pose}.png`} alt="" width={px} height={px} loading="lazy" decoding="async" />
    </picture>
  );
}
