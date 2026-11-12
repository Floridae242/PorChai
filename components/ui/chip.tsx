import type { ButtonHTMLAttributes } from "react";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  selected?: boolean;
};

export function Chip({ selected = false, type = "button", children, ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={selected}
      className={`inline-flex h-9 items-center rounded-pill border px-4 font-body text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] disabled:cursor-not-allowed disabled:opacity-40 ${
        selected ? "border-action-primary bg-selected font-semibold" : "border-line-strong bg-card"
      }`}
    >
      {children}
    </button>
  );
}
