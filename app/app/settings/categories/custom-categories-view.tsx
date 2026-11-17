"use client";

import Link from "next/link";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Sheet } from "@/components/shell/sheet";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import type { Category } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { ApiError } from "@/lib/client/errors";
import { useApi } from "@/lib/client/use-api";
import {
  formatBaht,
  parseBahtInput,
  satangToInputString,
} from "@/lib/format/money";
import type {
  SaveCategory,
  SpendingCategory,
  SpendingInsights,
} from "@/lib/insights/types";

const parents = Object.keys(CATEGORY_LABELS) as Category[];
type Draft = {
  id?: string;
  version?: string;
  label: string;
  parent: Category;
  budget: string;
};
export function CustomCategoriesView() {
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(() => ({ api, attempt }), [api, attempt]);
  const [loaded, setLoaded] = useState<{
    key: typeof key;
    rows: SpendingCategory[] | null;
    failed: boolean;
  } | null>(null);
  const rows = loaded?.key === key ? loaded.rows : null;
  const failed = loaded?.key === key && loaded.failed;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<SaveCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    SpendingInsights["suggestions"]
  >([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const suggestLock = useRef(false);
  useEffect(() => {
    let active = true;
    api
      .spendingCategories()
      .then((rows) => {
        if (active) setLoaded({ key, rows, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ key, rows: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [api, key]);
  function edit(row?: SpendingCategory, budget?: number) {
    setMessage(null);
    setPreview(null);
    setDraft(
      row
        ? {
            id: row.id,
            version: row.version,
            label: row.label,
            parent: row.parent,
            budget:
              budget === undefined
                ? row.monthlyBudget === null
                  ? ""
                  : satangToInputString(row.monthlyBudget)
                : satangToInputString(budget),
          }
        : { label: "", parent: "food", budget: "" },
    );
  }
  function review(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const label = draft.label.trim();
    if (!label || label.length > 30) {
      setMessage("ใส่ชื่อหมวด 1–30 ตัวอักษร");
      return;
    }
    const parsed = draft.budget.trim()
      ? parseBahtInput(draft.budget, { allowZero: true })
      : null;
    if (parsed && (!parsed.ok || parsed.satang > 10000000)) {
      setMessage("ใส่งบเป็นบาทตั้งแต่ 0 และทศนิยมไม่เกิน 2 ตำแหน่ง หรือเว้นว่างเมื่อไม่ตั้งงบ");
      return;
    }
    setMessage(null);
    setPreview({
      id: draft.id,
      version: draft.version,
      label,
      parent: draft.parent,
      monthlyBudget: parsed?.ok ? parsed.satang : null,
    });
  }
  async function save() {
    if (!preview || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await api.saveSpendingCategory(preview);
      setLoaded((current) =>
        current?.key === key && current.rows
          ? {
              ...current,
              rows: current.rows.some((c) => c.id === saved.id)
                ? current.rows.map((c) => (c.id === saved.id ? saved : c))
                : [...current.rows, saved],
            }
          : current,
      );
      setPreview(null);
      setDraft(null);
      setMessage("บันทึกหมวดและงบแล้ว");
    } catch (error) {
      setPreview(null);
      setMessage(
        error instanceof ApiError && error.status === 409
          ? "ข้อมูลหมวดเปลี่ยนแล้ว กรุณาโหลดล่าสุดและตรวจอีกครั้งก่อนบันทึก"
          : "บันทึกหมวดไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ ลองใหม่ได้ครับ",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function suggest() {
    if (suggestLock.current) return;
    suggestLock.current = true;
    setSuggestBusy(true);
    setMessage(null);
    try {
      const insight = await api.spendingInsights();
      setSuggestions(insight.suggestions);
      if (!insight.suggestions.length)
        setMessage("ยังมีประวัติไม่พอสำหรับแนะนำงบรายหมวด");
    } catch {
      setMessage("โหลดงบแนะนำไม่สำเร็จ ยังตั้งงบด้วยตัวเองได้ครับ");
    } finally {
      suggestLock.current = false;
      setSuggestBusy(false);
    }
  }
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="หมวดและงบของฉัน" back="/app/settings" tone="default" />
      <p className="text-sm leading-6 text-secondary">
        ตั้งชื่อหมวดตามชีวิตของคุณและงบต่อเดือน งบเป็นแนวทางติดตามรายจ่าย
        ไม่ได้กันเงินหรือเปลี่ยนแผนเงินของคุณ
      </p>
      {message && (
        <p
          role="status"
          className="rounded-md border border-line bg-subtle p-3 text-sm text-primary"
        >
          {message}
        </p>
      )}
      {failed ? (
        <>
          <Banner kind="error" text="โหลดหมวดไม่สำเร็จ" />
          <Button onClick={() => setAttempt((n) => n + 1)}>โหลดล่าสุด</Button>
        </>
      ) : !rows ? (
        <LoadingSkeleton label="กำลังโหลดหมวด…" />
      ) : (
        <>
          {rows.length === 0 ? <section className="rounded-sheet border border-dashed border-line-strong bg-subtle p-5">
            <h2 className="font-semibold text-primary">เริ่มจัดหมวดในแบบของคุณ</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">เช่น กาแฟ อาหารในมหาวิทยาลัย หรือค่าเดินทาง สร้างหมวดแล้วเลือกตั้งงบรายเดือนได้</p>
          </section> : null}
          <ul aria-label="หมวดและงบรายเดือน" className="divide-y divide-line rounded-sheet border border-line bg-card px-4">
            {rows.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <strong className="break-words text-primary">
                    {c.label}
                  </strong>
                  <p className="mt-1 text-xs leading-5 text-secondary">หมวดหลัก: {CATEGORY_LABELS[c.parent]}</p>
                  <p className="mt-2 text-sm font-semibold text-primary">
                    {c.monthlyBudget === null
                      ? "ยังไม่ตั้งงบ"
                      : `${formatBaht(c.monthlyBudget)} บาท/เดือน`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={`แก้ไข ${c.label}`}
                  onClick={() => edit(c)}
                >
                  แก้ไข
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-secondary">
            ยอดหมวดหลักรวมหมวดย่อยแล้ว งบของหมวดหลักจึงครอบคลุมหมวดย่อยด้วย
            ไม่ควรนำสองระดับมาบวกซ้ำ
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => edit()}>
            + สร้างหมวดใหม่
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setPreview(null);
              setSuggestions([]);
              setAttempt((n) => n + 1);
            }}
          >
            โหลดหมวดล่าสุด
          </Button>
          <Button
            variant="secondary"
            busy={suggestBusy}
            disabled={suggestBusy || busy}
            onClick={suggest}
          >
            ดูงบแนะนำจากประวัติ
          </Button>
          {!!suggestions.length && (
            <section className="rounded-md border border-line bg-card p-4">
              <h2 className="font-bold text-primary">งบแนะนำเป็นเพียงร่าง</h2>
              <ul className="mt-3 space-y-4">
                {suggestions.map((s) => (
                  <li key={s.categoryId}>
                    <p className="text-sm font-semibold">
                      {s.label} · {formatBaht(s.amount)} บาท/เดือน
                    </p>
                    <p className="mt-1 text-xs leading-5 text-secondary">
                      {s.reason}
                    </p>
                    <Button
                      variant="secondary"
                      disabled={
                        busy || !rows.some((c) => c.id === s.categoryId)
                      }
                      onClick={() => {
                        const row = rows.find((c) => c.id === s.categoryId);
                        if (row) edit(row, s.amount);
                      }}
                    >
                      ใช้เป็นร่าง: {s.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {draft && (
            <form
              className="flex flex-col gap-4 rounded-md border border-line bg-card p-4"
              onSubmit={review}
            >
              <h2 className="font-bold text-primary">
                {draft.id ? "แก้ไขหมวด" : "หมวดใหม่"}
              </h2>
              <InputField
                label="ชื่อหมวด"
                value={draft.label}
                maxLength={30}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
              <label className="flex flex-col gap-2 text-sm font-semibold text-primary">
                หมวดหลัก
                <select
                  className="min-h-12 rounded-sm border border-line-strong bg-card px-3"
                  value={draft.parent}
                  disabled={busy || !!draft.id}
                  onChange={(e) =>
                    setDraft({ ...draft, parent: e.target.value as Category })
                  }
                >
                  {parents
                    .filter((p) => draft.id || p !== "bills")
                    .map((p) => (
                      <option value={p} key={p}>
                        {CATEGORY_LABELS[p]}
                      </option>
                    ))}
                </select>
              </label>
              <InputField
                label="งบต่อเดือน (บาท)"
                inputMode="decimal"
                value={draft.budget}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
              />
              <p className="text-xs text-secondary">
                เว้นว่างเพื่อไม่ตั้งงบ · 0 หมายถึงตั้งงบไว้ 0 บาท
              </p>
              <Button type="submit" disabled={busy}>
                ตรวจข้อมูลก่อนบันทึก
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setPreview(null);
                }}
              >
                ยกเลิกแก้ไข
              </Button>
            </form>
          )}
        </>
      )}
      <Link className={buttonClass("secondary", true)} href="/app/insights">
        ดูพฤติกรรมและงบที่ใช้ไป
      </Link>
      <Sheet
        open={!!preview}
        onClose={() => {
          if (!busy) setPreview(null);
        }}
        title="ตรวจหมวดและงบก่อนบันทึก"
      >
        <div className="flex flex-col gap-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-secondary">ชื่อหมวด</dt>
              <dd className="break-words font-semibold">{preview?.label}</dd>
            </div>
            <div>
              <dt className="text-secondary">หมวดหลัก</dt>
              <dd>{preview ? CATEGORY_LABELS[preview.parent] : ""}</dd>
            </div>
            <div>
              <dt className="text-secondary">งบต่อเดือน</dt>
              <dd>
                {preview?.monthlyBudget == null
                  ? "ไม่ตั้งงบ"
                  : `${formatBaht(preview.monthlyBudget)} บาท`}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-secondary">
            บันทึกเมื่อคุณยืนยันเท่านั้น ไม่เปลี่ยนยอดเงินจริงหรือบันทึกรายจ่าย
          </p>
          <Button busy={busy} disabled={busy} onClick={save}>
            ยืนยันบันทึกหมวดและงบ
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setPreview(null)}
          >
            กลับไปแก้ไข
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
