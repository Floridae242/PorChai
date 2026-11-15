"use client";
import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { campaigns } from "@/lib/promotions/demo";
import { Mascot } from "@/components/ui/mascot";

export function MockPromotionBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <aside
      aria-label="โฆษณาตัวอย่าง"
      className="relative rounded-md border border-line bg-reward-bg p-3 pr-11"
    >
      <button
        type="button"
        aria-label="ปิดโฆษณาตัวอย่าง"
        onClick={() => setDismissed(true)}
        className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-pill text-secondary"
      >
        ×
      </button>
      <Link
        href="/app/sponsors"
        className="flex min-h-16 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]"
      >
        <span className="shrink-0 rounded-sm bg-card p-1">
          <Mascot pose="greeting" size={56} />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-semibold text-secondary">
            AD · โฆษณาตัวอย่าง · ผู้สนับสนุนสมมติ
          </span>
          <span className="text-sm font-bold leading-5 text-primary">
            สิทธิพิเศษสำหรับชีวิตนักศึกษา ›
          </span>
          <span className="text-xs text-secondary">ดูโปรสาธิต · ใช้ซื้อจริงไม่ได้</span>
        </span>
      </Link>
    </aside>
  );
}
export function SponsorShowcase() {
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="โปรจากผู้สนับสนุน" back="/app" tone="default" />
      <Banner
        kind="info"
        text="โฆษณาตัวอย่างทั้งหมด ผู้สนับสนุนและข้อเสนอเป็นข้อมูลสมมติ ใช้ซื้อสินค้าจริงไม่ได้"
      />
      {campaigns.map((c) => (
        <article
          key={c.id}
          className="flex flex-col gap-3 rounded-md border border-line bg-card p-5"
        >
          <span className="text-xs font-semibold text-link">
            AD · ผู้สนับสนุนสมมติ
          </span>
          <p className="text-sm text-secondary">{c.shop}</p>
          <h2 className="text-lg font-semibold text-primary">{c.title}</h2>
          <p className="rounded-sm bg-reward-bg p-3 font-semibold">{c.offer}</p>
          <p className="text-sm leading-6 text-secondary">{c.terms}</p>
          <p className="text-xs text-secondary">
            สำหรับสาธิตเท่านั้น ไม่มีการซื้อ จองสิทธิ์ หรือหักแต้ม
          </p>
        </article>
      ))}
    </main>
  );
}
export function PromotionMockView() {
  const [filter, setFilter] = useState("all"),
    [code, setCode] = useState<string | null>(null);
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="คูปอง & โปรตัวอย่าง" back="/app/perks" tone="default" />
      <Banner
        kind="info"
        text="ทั้งหมดเป็นข้อมูลจำลอง ร้าน ราคา เงื่อนไข และรหัสใช้สาธิตเท่านั้น ใช้ซื้อสินค้าจริงไม่ได้"
      />
      <div className="flex flex-wrap gap-2" aria-label="ประเภทแคมเปญ">
        {[
          ["all", "ทั้งหมด"],
          ["coupon", "คูปอง"],
          ["promotion", "โปรโมชัน"],
          ["ad", "โฆษณา"],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={filter === value ? "primary" : "secondary"}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setCode(null);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {campaigns
        .filter((c) => filter === "all" || c.kind === filter)
        .map((c) => (
          <article
            key={c.id}
            className="flex flex-col gap-3 rounded-md border border-line bg-card p-5"
          >
            <p className="text-xs font-semibold text-link">
              {c.kind === "ad" ? "โฆษณาตัวอย่าง" : "ข้อเสนอจำลอง"}
            </p>
            <p className="text-xs text-secondary">{c.shop}</p>
            <h2 className="text-lg font-bold text-primary">{c.title}</h2>
            <p className="rounded-sm bg-reward-bg p-3 font-semibold">
              {c.offer}
            </p>
            <p className="text-sm text-secondary">{c.terms}</p>
            <Button variant="secondary" onClick={() => setCode(c.code)}>
              ลองรับรหัสตัวอย่าง
            </Button>
          </article>
        ))}
      {code ? (
        <section
          role="status"
          className="rounded-md border border-line bg-subtle p-5"
        >
          <p className="font-bold">รหัสจำลอง ใช้ซื้อจริงไม่ได้</p>
          <p className="mt-2 break-all font-mono text-2xl text-primary">
            {code}
          </p>
        </section>
      ) : null}
    </main>
  );
}
