import Link from "next/link";

export type BannerKind = "info" | "warn" | "error";

export type BannerProps = {
  kind: BannerKind;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void };
};

const STYLE: Record<BannerKind, { box: string; icon: string; glyph: string }> = {
  info: { box: "bg-ok-bg", icon: "bg-ok", glyph: "i" },
  warn: { box: "bg-warn-bg", icon: "bg-warn", glyph: "!" },
  error: { box: "bg-danger-bg", icon: "bg-danger", glyph: "✕" },
};

const LINK = "text-sm font-semibold text-link underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]";

export function Banner({ kind, text, action }: BannerProps) {
  const s = STYLE[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`flex items-center gap-3 rounded-md px-4 py-3 font-body ${s.box}`}>
      <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-pill text-sm font-bold text-on-hero ${s.icon}`}>
        {s.glyph}
      </span>
      <p className="flex-1 text-sm text-primary">{text}</p>
      {action ? (
        action.href ? (
          <Link href={action.href} onClick={action.onClick} className={LINK}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={LINK}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}
