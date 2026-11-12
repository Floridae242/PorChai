"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Sheet } from "@/components/shell/sheet";
import { useToast } from "@/components/shell/toast";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import { Mascot } from "@/components/ui/mascot";
import { USER_CATEGORIES, type Entry, type Plan, type Summary, type UserCategory } from "@/lib/api-types";
import { ApiError } from "@/lib/client/errors";
import { DEFAULT_TODAY } from "@/lib/client/mock-fixtures";
import { CATEGORY_LABELS } from "@/lib/client/summary-helpers";
import { useApi } from "@/lib/client/use-api";
import { formatBaht, parseBahtInput } from "@/lib/format/money";

const PENDING_RECORD_KEY = "porchai.pending_record.v1";

interface PendingRecordDraft {
  type: "expense" | "income";
  amount: number;
  note: string;
  category: UserCategory;
  spentOn: string;
}

function savePendingRecord(draft: PendingRecordDraft) {
  try {
    window.sessionStorage.setItem(PENDING_RECORD_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

function loadPendingRecord(): PendingRecordDraft | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_RECORD_KEY);
    return raw ? (JSON.parse(raw) as PendingRecordDraft) : null;
  } catch {
    return null;
  }
}

export function RecordNewView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams?.get("type") === "income" ? "income" : "expense";

  const [type, setType] = useState<"expense" | "income">(initialType);
  const [amountText, setAmountText] = useState(() => searchParams?.get("amount") ?? "");
  const [note, setNote] = useState(() => searchParams?.get("note") ?? "");
  const [category, setCategory] = useState<UserCategory>("food");
  const [spentOn, setSpentOn] = useState(DEFAULT_TODAY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .summary()
      .then((s) => setSpentOn(s.today))
      .catch(() => {});
  }, [api]);

  async function handleSave() {
    const parsed = parseBahtInput(amountText);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const draft: PendingRecordDraft = {
        type,
        amount: parsed.satang,
        note: note.trim() || (type === "income" ? "รายรับเพิ่ม" : CATEGORY_LABELS[category]),
        category,
        spentOn,
      };
      savePendingRecord(draft);

      if (type === "expense") {
        const { plans } = await api.plans().catch(() => ({ plans: [] as Plan[] }));
        const reservedPurchases = plans.filter((p) => p.kind === "purchase" && p.status === "reserved");
        if (reservedPurchases.length > 0) {
          router.push("/app/record/link");
          return;
        }
        await api.addEntry(
          {
            amount: draft.amount,
            category: draft.category,
            note: draft.note,
            spentOn: draft.spentOn,
          },
          `entry-${Date.now()}`,
        );
      } else {
        const current = await api.summary();
        await api.adjustBalance({ balance: current.balance + draft.amount });
      }
      router.replace("/app/record/done?mode=normal");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="จดรายการ" back="/app" tone="default" />

      <div role="tablist" aria-label="ประเภทรายการ" className="grid grid-cols-2 gap-2 rounded-pill border border-line bg-card p-1">
        <button
          type="button"
          role="tab"
          aria-selected={type === "expense"}
          onClick={() => setType("expense")}
          className={`rounded-pill py-2 text-sm font-semibold ${
            type === "expense" ? "bg-action-primary text-on-action" : "text-secondary"
          }`}
        >
          รายจ่าย
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={type === "income"}
          onClick={() => setType("income")}
          className={`rounded-pill py-2 text-sm font-semibold ${
            type === "income" ? "bg-action-primary text-on-action" : "text-secondary"
          }`}
        >
          รายรับ
        </button>
      </div>

      <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
        <InputField
          label="จำนวนเงิน (บาท)"
          inputMode="decimal"
          placeholder="เช่น 45"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value);
            if (error) setError(null);
          }}
          state={error ? "error" : amountText ? "filled" : "default"}
          helper={error ?? undefined}
        />

        <InputField
          label="ชื่อรายการ"
          placeholder={type === "expense" ? "เช่น ข้าวมันไก่, กาแฟ" : "เช่น ได้ค่าขนมเพิ่ม"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          state={note ? "filled" : "default"}
        />

        {type === "expense" ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">หมวดหมู่</span>
            <div className="flex flex-wrap gap-2">
              {USER_CATEGORIES.map((cat) => (
                <Chip key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
                  {CATEGORY_LABELS[cat]}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <InputField
          label="วันที่"
          type="date"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
          state="filled"
          helper="จดย้อนหลังในรอบปัจจุบันได้ ระบบจะคำนวณงบวันนี้ใหม่ตามจริง"
        />
      </section>

      <div className="flex flex-col gap-2">
        <Button variant="primary" block busy={busy} onClick={handleSave}>
          บันทึก
        </Button>
        <Link href="/app" className={buttonClass("ghost", true)}>
          ยกเลิก
        </Link>
      </div>
    </main>
  );
}

export function RecordLinkView() {
  const api = useApi();
  const router = useRouter();
  const [draft] = useState<PendingRecordDraft | null>(() => loadPendingRecord());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | "none">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .plans()
      .then(({ plans: list }) => {
        const reserved = list.filter((p) => p.kind === "purchase" && p.status === "reserved");
        setPlans(reserved);
        if (reserved.length > 0) setSelectedPlanId(reserved[0].id);
      })
      .catch(() => {});
  }, [api]);

  const effectiveAmount = draft?.amount ?? 48000;
  const effectiveNote = draft?.note ?? "รองเท้า";
  const effectiveCategory = draft?.category ?? "supplies";
  const effectiveSpentOn = draft?.spentOn ?? DEFAULT_TODAY;

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      if (selectedPlanId !== "none") {
        await api.planAction(selectedPlanId, "pay", { category: effectiveCategory });
        router.replace("/app/record/done?mode=linked");
      } else {
        await api.addEntry(
          {
            amount: effectiveAmount,
            category: effectiveCategory,
            note: effectiveNote,
            spentOn: effectiveSpentOn,
          },
          `entry-unlinked-${Date.now()}`,
        );
        router.replace("/app/record/done?mode=unlinked");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ผูกกับรายการในแผนไหม" back="/app/record/new" tone="default" />

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4 text-sm">
        <span className="text-xs text-secondary">รายการที่กำลังจด</span>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-primary">{effectiveNote}</span>
          <span className="font-bold tabular-nums text-primary">{formatBaht(effectiveAmount)} บาท</span>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">พบรายการที่เก็บไว้ในแผนรอบนี้</h2>
        <p className="text-xs text-secondary">
          ถ้ารายการนี้คือของที่คุณเก็บไว้ในแผน ให้เลือกผูกกันเพื่อปลดยอดที่กันไว้และไม่หักงบซ้ำสองครั้ง
        </p>

        <div className="flex flex-col gap-2">
          {plans.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center justify-between rounded-sm border p-3 text-sm ${
                selectedPlanId === p.id ? "border-line-strong bg-selected" : "border-line bg-card"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="linkPlan"
                  checked={selectedPlanId === p.id}
                  onChange={() => setSelectedPlanId(p.id)}
                  className="size-4 accent-[var(--green-700)]"
                />
                <div>
                  <p className="font-semibold text-primary">ผูกกับ &quot;{p.title}&quot;</p>
                  <p className="text-xs text-secondary">ยืนยันจ่ายจริง · ไม่หักงบซ้ำ</p>
                </div>
              </div>
              <span className="font-semibold tabular-nums text-primary">{formatBaht(p.amount)} บาท</span>
            </label>
          ))}

          <label
            className={`flex cursor-pointer items-center gap-2.5 rounded-sm border p-3 text-sm ${
              selectedPlanId === "none" ? "border-line-strong bg-selected" : "border-line bg-card"
            }`}
          >
            <input
              type="radio"
              name="linkPlan"
              checked={selectedPlanId === "none"}
              onChange={() => setSelectedPlanId("none")}
              className="size-4 accent-[var(--green-700)]"
            />
            <div>
              <p className="font-semibold text-primary">ไม่ผูก (จดเป็นรายจ่ายแยกต่างหาก)</p>
              <p className="text-xs text-secondary">รายการที่เก็บไว้ในแผนยังอยู่เหมือนเดิม</p>
            </div>
          </label>
        </div>
      </section>

      {error ? <Banner kind="error" text={error} /> : null}

      <Button variant="primary" block busy={busy} onClick={handleConfirm}>
        {selectedPlanId !== "none" ? "ยืนยันจ่ายจริงและผูกกับแผน" : "บันทึกเป็นรายจ่ายใหม่"}
      </Button>
    </main>
  );
}

export function RecordDoneView() {
  const api = useApi();
  const searchParams = useSearchParams();
  const mode = searchParams?.get("mode") ?? "normal";
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .summary()
      .then(setSummary)
      .catch(() => {});
  }, [api]);

  return (
    <main className="flex flex-col items-center gap-5 py-8 text-center font-body">
      <Mascot pose="budgetOk" size={80} />

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-primary">บันทึกรายการแล้ว ✓</h1>
        <p className="text-sm text-secondary">
          {mode === "linked"
            ? "ผูกกับรายการที่เก็บไว้ในแผนเรียบร้อย ไม่หักงบซ้ำ"
            : mode === "unlinked"
              ? "บันทึกเป็นรายจ่ายแยกเรียบร้อย รายการในแผนยังเก็บไว้เหมือนเดิม"
              : "คำนวณงบเหลือใช้วันนี้ใหม่เรียบร้อยแล้ว"}
        </p>
      </div>

      {summary && summary.budget.kind === "ok" ? (
        <section className="flex w-full flex-col gap-2 rounded-md border border-line-strong bg-card p-5">
          <span className="text-xs font-semibold text-secondary">เหลือใช้วันนี้</span>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-4xl font-bold tabular-nums text-primary">
              {formatBaht(summary.budget.todayRemaining)}
            </span>
            <span className="text-base font-semibold text-secondary">บาท</span>
          </div>
          <p className="text-xs text-secondary">
            จากงบวันนี้ {formatBaht(summary.budget.dailyBudget)} บาท · ใช้ไปแล้ว {formatBaht(summary.spentToday)} บาท
          </p>
        </section>
      ) : null}

      <div className="flex w-full flex-col gap-2 pt-2">
        <Link href="/app" className={buttonClass("primary", true)}>
          กลับหน้าสรุป
        </Link>
        <Link href="/app/plan?tab=list" className={buttonClass("secondary", true)}>
          ดูรายการทั้งหมด
        </Link>
      </div>
    </main>
  );
}

export function RecordEditView() {
  const api = useApi();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const entryId = params?.id ?? "";

  const [entry, setEntry] = useState<Entry | null>(null);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<UserCategory>("food");
  const [spentOn, setSpentOn] = useState(DEFAULT_TODAY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .entries()
      .then(({ entries }) => {
        const found = entries.find((e) => e.id === entryId) ?? entries[0] ?? null;
        if (found) {
          setEntry(found);
          setAmountText(formatBaht(found.amount).replace(/,/g, ""));
          setNote(found.note ?? "");
          setCategory(found.category === "bills" ? "other" : found.category);
          setSpentOn(found.spentOn);
        }
      })
      .finally(() => setLoading(false));
  }, [api, entryId]);

  async function handleSave() {
    if (!entry) return;
    const parsed = parseBahtInput(amountText);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.editEntry(entry.id, {
        amount: parsed.satang,
        note: note.trim() || null,
        category,
        spentOn,
      });
      toast.show("บันทึกการแก้ไขแล้ว", { mascot: "budgetOk" });
      router.replace("/app/plan?tab=list");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "แก้ไขไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelEntry(entry.id);
      setDeleteOpen(false);
      toast.show("ลบรายการแล้ว");
      router.replace("/app/plan?tab=list");
    } catch (err) {
      setDeleteOpen(false);
      setError(err instanceof ApiError ? err.message : "ลบรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังโหลดรายการ…
      </main>
    );
  }

  if (!entry) {
    return (
      <main className="flex flex-col gap-4 py-4 font-body">
        <AppHeader title="แก้ไขรายการ" back="/app/plan?tab=list" tone="default" />
        <Banner kind="error" text="ไม่พบรายการนี้" />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="แก้ไขรายการ" back="/app/plan?tab=list" tone="default" />

      <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
        <InputField
          label="จำนวนเงิน (บาท)"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          state={error ? "error" : "filled"}
          helper={error ?? undefined}
        />

        <InputField
          label="ชื่อรายการ"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          state={note ? "filled" : "default"}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">หมวดหมู่</span>
          <div className="flex flex-wrap gap-2">
            {USER_CATEGORIES.map((cat) => (
              <Chip key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
                {CATEGORY_LABELS[cat]}
              </Chip>
            ))}
          </div>
        </div>

        <InputField
          label="วันที่"
          type="date"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
          state="filled"
        />
      </section>

      <div className="flex flex-col gap-2">
        <Button variant="primary" block busy={busy} onClick={handleSave}>
          บันทึกการแก้ไข
        </Button>
        <Button variant="secondary" block disabled={busy} onClick={() => setDeleteOpen(true)}>
          ลบรายการนี้
        </Button>
      </div>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="ยืนยันลบรายการนี้ไหม">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            เมื่อลบ &quot;{entry.note ?? CATEGORY_LABELS[entry.category]}&quot; ({formatBaht(entry.amount)} บาท)
            ระบบจะคำนวณงบรายวันและยอดเหลือใช้วันนี้ใหม่ทันที
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" block busy={busy} onClick={handleDelete}>
              ยืนยันลบรายการ
            </Button>
            <Button variant="ghost" block onClick={() => setDeleteOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
