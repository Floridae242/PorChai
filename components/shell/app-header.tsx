import Link from "next/link";

export type AppHeaderProps = {
  title: string;
  back?: string | (() => void);
  tone: "default" | "onDark";
};

/** Page header. `default`: --text-primary on light; `onDark`: white on a gradient band, no background. */
export function AppHeader({ title, back, tone }: AppHeaderProps) {
  const color = tone === "onDark" ? "text-on-hero" : "text-primary";
  const backClass = `flex size-10 items-center justify-center rounded-pill text-2xl leading-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${color}`;
  return (
    <header className={`flex h-14 items-center gap-2 font-body ${color}`}>
      {typeof back === "string" ? (
        <Link href={back} aria-label="ย้อนกลับ" className={backClass}>
          <span aria-hidden="true">‹</span>
        </Link>
      ) : back ? (
        <button type="button" onClick={back} aria-label="ย้อนกลับ" className={backClass}>
          <span aria-hidden="true">‹</span>
        </button>
      ) : null}
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}
