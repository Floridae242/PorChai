import type { ReactNode } from "react";

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Already formatted (e.g. "1,200 baht"); this component never formats money. */
  amount?: string;
  badge?: ReactNode;
  href?: string;
  onClick?: () => void;
};

const BASE =
  "flex w-full items-center gap-3 rounded-md bg-card px-4 py-3 text-left font-body outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]";

export function ListRow({ title, subtitle, amount, badge, href, onClick }: ListRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base text-primary">{title}</span>
        {subtitle ? <span className="truncate text-sm text-secondary">{subtitle}</span> : null}
      </span>
      {badge ? <span className="shrink-0 text-xs text-secondary">{badge}</span> : null}
      {amount ? (
        <span data-clarity-mask="true" className="shrink-0 text-base font-semibold text-primary">
          {amount}
        </span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <a href={href} className={BASE}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={BASE}>
        {content}
      </button>
    );
  }
  return <div className={BASE}>{content}</div>;
}
