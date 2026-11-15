"use client";
import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { campaigns } from "@/lib/promotions/demo";

export function MockPromotionBanner() {
  return (
    <aside className="rounded-md border border-line bg-reward-bg p-4">
      <p className="text-xs font-semibold text-secondary">
        โฆษณาตัวอย่าง · ผู้สนับสนุนสมมติ
      </p>
      <p className="mt-1 font-bold text-primary">สิทธิพิเศษสำหรับชีวิตนักศึกษา</p>
      <p className="mt-1 text-xs text-secondary">คูปองและโปรสาธิต ใช้ซื้อจริงไม่ได้</p>
      <Link
        href="/app/promotions"
        className="mt-2 inline-block min-h-8 text-sm font-semibold text-link"
      >
        ดูตัวอย่างคูปองและโปร ›
      </Link>
    </aside>
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
