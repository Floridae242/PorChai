"use client";
import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/client/use-api";
import type { SearchResult } from "@/lib/reports/types";
import { formatBaht } from "@/lib/format/money";

function CitedAnswer({ result }: { result: SearchResult }) {
  const ends = [...new Set(result.citations?.map((c) => c.end) ?? [])].sort(
    (a, b) => a - b,
  );
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-primary">
      {ends.map((end, index) => {
        const content = result.answer.slice(index ? ends[index - 1] : 0, end);
        return (
          <Fragment key={end}>
            {content}
            {[
              ...new Set(
                result.citations
                  ?.filter((c) => c.end === end)
                  .map((c) => c.source),
              ),
            ].map((i) => (
              <a
                key={i}
                className="mx-1 font-semibold text-link underline"
                href={result.sources[i].url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`แหล่งอ้างอิง ${i + 1}: ${result.sources[i].title}`}
              >
                [{i + 1}]
              </a>
            ))}
          </Fragment>
        );
      })}
      {result.answer.slice(ends.at(-1) ?? 0)}
    </p>
  );
}
export function SearchView() {
  const api = useApi(),
    locked = useRef(false);
  const [query, setQuery] = useState(""),
    [mode, setMode] = useState<"entries" | "web">("entries"),
    [period, setPeriod] = useState<"day" | "month" | "year">("month");
  const [result, setResult] = useState<SearchResult | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current || !query.trim()) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.search(query, mode, period));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "ค้นหาไม่สำเร็จ ลองใหม่อีกครั้งครับ",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="AI Search" back="/app" tone="default" />
      <div className="flex gap-2" aria-label="แหล่งข้อมูลค้นหา">
        {(["entries", "web"] as const).map((m) => (
          <Button
            key={m}
            variant={mode === m ? "primary" : "secondary"}
            aria-pressed={mode === m}
            disabled={busy}
            onClick={() => {
              setMode(m);
              setResult(null);
              setError(null);
            }}
          >
            {m === "entries" ? "รายจ่ายของฉัน" : "ค้นเว็บ"}
          </Button>
        ))}
      </div>
      <p className="text-sm text-secondary">
        {mode === "entries"
          ? "ค้นด้วยชื่อที่จด เช่น ข้าว กาแฟ ค่ารถ เฉพาะบัญชีของคุณ ไม่ส่งประวัติไปค้นเว็บ"
          : "คำค้นส่งไป Gemini/Google Search โดยไม่แนบประวัติหรือยอดเงินของคุณ ราคาและโปรต้องตรวจสอบกับร้านอีกครั้ง"}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          คำค้น
          <input
            className="min-h-12 rounded-sm border border-line-strong bg-card px-3"
            maxLength={mode === "entries" ? 120 : 240}
            value={query}
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "entries" ? "เช่น ข้าว" : "เช่น สิทธิ์นักศึกษา ค่าเดินทาง"
            }
          />
        </label>
        {mode === "entries" ? (
          <label className="flex flex-col gap-2 text-sm font-semibold">
            ช่วงที่ค้น
            <select
              className="min-h-12 rounded-sm border border-line-strong bg-card px-3"
              value={period}
              disabled={busy}
              onChange={(e) => setPeriod(e.target.value as typeof period)}
            >
              <option value="day">วันนี้</option>
              <option value="month">เดือนนี้</option>
              <option value="year">ย้อนหลัง 1 ปี</option>
            </select>
          </label>
        ) : null}
        <Button type="submit" busy={busy} disabled={!query.trim()}>
          ค้นหา
        </Button>
      </form>
      {busy ? (
        <p role="status" className="text-sm text-secondary">
          กำลังค้นหา…
        </p>
      ) : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {result ? (
        <section
          className="flex flex-col gap-4 rounded-md border border-line bg-card p-4"
          aria-label="ผลการค้นหา"
        >
          <CitedAnswer result={result} />
          {result.entries?.length === 0 ? (
            <p className="text-sm text-secondary">
              ลองเปลี่ยนคำค้นหรือขยายช่วงเวลา ไม่พบคำค้นไม่ได้หมายความว่าไม่มีรายจ่ายทั้งหมด
            </p>
          ) : null}
          {result.entries?.length ? (
            <ul className="divide-y divide-line">
              {result.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                >
                  <span>
                    {entry.note || "รายการรายจ่าย"}
                    <small className="ml-2 text-secondary">
                      {entry.spentOn}
                    </small>
                  </span>
                  <strong>{formatBaht(entry.amount)} บาท</strong>
                </li>
              ))}
            </ul>
          ) : null}
          {result.sources.length ? (
            <section>
              <h2 className="mb-2 font-bold">แหล่งอ้างอิง</h2>
              <ol className="list-inside list-decimal space-y-2 text-sm">
                {result.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-words text-link underline"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {result.suggestions?.map((html, i) => (
            <iframe
              key={i}
              title={`คำแนะนำการค้นหาจาก Google ${i + 1}`}
              className="min-h-40 w-full rounded-sm border border-line"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; form-action 'none'">${html}`}
            />
          ))}
        </section>
      ) : null}
      <Link className="text-sm font-semibold text-link" href="/app/reports">
        ดูรายงานวัน / เดือน ›
      </Link>
    </main>
  );
}
