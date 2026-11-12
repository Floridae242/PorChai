import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  /** Full-width. */
  block?: boolean;
  /** Submitting: disabled + aria-busy, onClick cannot fire again. */
  busy?: boolean;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-action-primary text-on-action enabled:active:bg-action-pressed",
  secondary: "border border-line-strong bg-card text-primary",
  ghost: "bg-transparent text-link",
};

export function buttonClass(variant: ButtonVariant = "primary", block = false): string {
  return `inline-flex h-12 items-center justify-center gap-2 rounded-pill px-6 font-body text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
    block ? "w-full" : ""
  } ${VARIANT[variant]}`;
}

export function Button({ variant = "primary", block = false, busy = false, disabled, type = "button", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, block)}
    >
      {busy ? (
        <span aria-hidden="true" className="size-4 rounded-pill border-2 border-current border-t-transparent motion-safe:animate-spin" />
      ) : null}
      {children}
    </button>
  );
}
