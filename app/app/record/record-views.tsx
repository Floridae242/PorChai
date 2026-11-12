"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Sheet } from "@/components/shell/sheet";
import { useToast } from "@/components/shell/toast";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import { Mascot } from "@/components/ui/mascot";
import { USER_CATEGORIES, type Entry, type Plan, type Summary, type UserCategory } from "@/lib/api-types";
import { thaiDate } from "@/lib/calc/time";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { ApiError } from "@/lib/client/errors";
import {
  clearPendingRecord,
  loadPendingRecord,
  savePendingRecord,
  type PendingRecordDraft,
} from "@/lib/client/pending-record";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import { formatBaht, parseBahtInput, satangToInputString } from "@/lib/format/money";

const MSG_INCOME_NOT_READY = "ยังไม่พร้อมใช้งาน — ตอนนี้จดได้เฉพาะรายจ่าย";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function RecordNewView() {
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams?.get("type") === "income" ? "income" : "expense";
  const { submit, busy } = useSubmit<"linked" | "saved">();

  const [type, setType] = useState<"expense" | "income">(initialType);
  const [amountText, setAmountText] = useState(() => searchParams?.get("amount") ?? "");
  const [note, setNote] = useState(() => searchParams?.get("note") ?? "");
  const [category, setCategory] = useState<UserCategory>("food");
  const [spentOn, setSpentOn] = useState(() => thaiDate(new Date()));
  const dateTouched = useRef(false);
  const [error, setError] = useState<string | null>(null); // amount field
  const [formError, setFormError] = useState<string | null>(null); // server / not-ready banner

  // The server's "today" is authoritative; it equals thaiDate(new Date()) except on a mock clock.
  useEffect(() => {
    api
      .summary()
      .then((s) => {
        if (!dateTouched.current) setSpentOn(s.today);
      })
      .catch(() => {
        // keep the local Thai date
      });
  }, [api]);

  async function handleSave() {
    const parsed = parseBahtInput(amountText);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setError(null);
    setFormError(null);
    const trimmed = note.trim();
    const draft: PendingRecordDraft = {
      type,
      amount: parsed.satang,
      note: trimmed || (type === "income" ? "" : CATEGORY_LABELS[category]),
      category,
      spentOn,
    };
    // One key per payload: a retry of the same data reuses it, an edited amount/note/date gets a new one.
    const payload = { ...draft, category: type === "expense" ? category : null };

    const result = await submit(payload, async (key) => {
      if (type === "income") {
        await api.addIncome({ amount: draft.amount, note: trimmed || null, receivedOn: spentOn }, key);
        return "saved" as const;
      }
      const { plans } = await api.plans().catch(() => ({ plans: [] as Plan[] }));
      if (plans.some((p) => p.kind === "purchase" && p.status === "reserved")) return "linked" as const;
      await api.addEntry(
        { amount: draft.amount, category: draft.category, note: draft.note, spentOn: draft.spentOn },
        key,
      );
      return "saved" as const;
    });

    if (result.ok) {
      // busy stays true: the page is unmounting, so a second tap cannot slip in.
      if (result.value === "linked") {
        savePendingRecord(draft);
        router.push("/app/record/link");
      } else {
        clearPendingRecord();
        router.replace("/app/record/done?mode=normal");
      }
      return;
    }
    if ("skipped" in result) return;
    if (type === "income" && result.error instanceof ApiError && result.error.code === "not_implemented") {
      setFormError(MSG_INCOME_NOT_READY); // typed data stays in the form
      return;
    }
    setFormError(errorText(result.error, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="จดรายการ" back="/app" tone="default" />

      <div role="tablist" aria-label="ประเภทรายการ" className="grid grid-cols-2 gap-2 rounded-pill border border-line bg-card p-1">
        <button
          type="button"
          role="tab"
          id="record-tab-expense"
          aria-controls="record-tabpanel"
          aria-selected={type === "expense"}
          onClick={() => {
            setType("expense");
            setFormError(null);
          }}
          className={`rounded-pill py-2 text-sm font-semibold ${
            type === "expense" ? "bg-action-primary text-on-action" : "text-secondary"
          }`}
        >
          รายจ่าย
        </button>
        <button
          type="button"
          role="tab"
          id="record-tab-income"
          aria-controls="record-tabpanel"
          aria-selected={type === "income"}
          onClick={() => {
            setType("income");
            setFormError(null);
          }}
          className={`rounded-pill py-2 text-sm font-semibold ${
            type === "income" ? "bg-action-primary text-on-action" : "text-secondary"
          }`}
        >
          รายรับ
        </button>
      </div>

      <section
        role="tabpanel"
        id="record-tabpanel"
        aria-labelledby={`record-tab-${type}`}
        className="flex flex-col gap-4 rounded-md border border-line bg-card p-4"
      >
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
          onChange={(e) => {
            dateTouched.current = true;
            setSpentOn(e.target.value);
          }}
          state="filled"
          helper="จดย้อนหลังในรอบปัจจุบันได้ ระบบจะคำนวณงบวันนี้ใหม่ตามจริง"
        />
      </section>

      {formError ? <Banner kind={formError === MSG_INCOME_NOT_READY ? "info" : "error"} text={formError} /> : null}

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
  const { submit, busy } = useSubmit<"linked" | "unlinked">();
  // undefined = not read yet (sessionStorage is only read after mount); null = there is no draft.
  const [draft, setDraft] = useState<PendingRecordDraft | null | undefined>(undefined);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | "none">("none");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Read after mount (never during render) so server and client markup match.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const loaded = loadPendingRecord();
      setDraft(loaded);
      // Nothing to link (opened directly, reloaded after saving): back to the form, no made-up item.
      if (!loaded) router.replace("/app/record/new");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api
      .plans()
      .then(({ plans: list }) => {
        // Default stays "none": the typed expense is recorded as its own entry unless the user picks a plan.
        setPlans(list.filter((p) => p.kind === "purchase" && p.status === "reserved"));
      })
      .catch((err: unknown) => setError(errorText(err, "โหลดรายการในแผนไม่สำเร็จ")));
  }, [api]);

  async function handleConfirm() {
    if (!draft) return;
    setError(null);
    const result = await submit({ selectedPlanId, draft }, async (key) => {
      if (selectedPlanId !== "none") {
        await api.planAction(selectedPlanId, "pay", { category: draft.category });
        return "linked" as const;
      }
      await api.addEntry(
        { amount: draft.amount, category: draft.category, note: draft.note, spentOn: draft.spentOn },
        key,
      );
      return "unlinked" as const;
    });
    if (result.ok) {
      // busy stays true: the page is unmounting.
      clearPendingRecord();
      router.replace(`/app/record/done?mode=${result.value}`);
      return;
    }
    if ("skipped" in result) return;
    setError(errorText(result.error, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  if (!draft) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังโหลด…
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ผูกกับรายการในแผนไหม" back="/app/record/new" tone="default" />

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4 text-sm">
        <span className="text-xs text-secondary">รายการที่กำลังจด</span>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-primary">{draft.note}</span>
          <span className="font-bold tabular-nums text-primary">{formatBaht(draft.amount)} บาท</span>
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

      {selectedPlan && selectedPlan.amount !== draft.amount ? (
        <Banner
          kind="warn"
          text={`ยอดที่คุณจด ${formatBaht(draft.amount)} บาท ไม่ตรงกับรายการในแผน ${formatBaht(selectedPlan.amount)} บาท · ถ้ายืนยัน จะบันทึกจ่ายตามรายการในแผน ${formatBaht(selectedPlan.amount)} บาท`}
        />
      ) : null}

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
      <Mascot pose="budgetOk" size={72} />

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
  const save = useSubmit();
  const del = useSubmit();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<UserCategory>("food");
  const [spentOn, setSpentOn] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const busy = save.busy || del.busy;

  useEffect(() => {
    let cancelled = false;
    api
      .entries()
      .then(({ entries }) => {
        if (cancelled) return;
        // Only the exact id: an unknown or stale id is "not found", never some other entry.
        const found = entries.find((e) => e.id === entryId) ?? null;
        if (found) {
          setEntry(found);
          setAmountText(satangToInputString(found.amount));
          setNote(found.note ?? "");
          setCategory(found.category === "bills" ? "other" : found.category);
          setSpentOn(found.spentOn);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "no_cycle") {
          router.replace("/app/setup/income"); // neutral loading state stays while redirecting
          return;
        }
        if (err instanceof ApiError && err.code === "no_consent") {
          router.replace("/app/consent");
          return;
        }
        setLoadFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, entryId, attempt]);

  // Entries created by paying a plan: the server only lets the category change (and not on bills).
  const fromPlan = entry?.source === "plan";
  const isBill = entry?.category === "bills";

  async function handleSave() {
    if (!entry) return;
    const parsed = parseBahtInput(amountText);
    if (!fromPlan && !parsed.ok) {
      setAmountError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setAmountError(null);
    setError(null);
    const body = fromPlan
      ? { category }
      : {
          amount: parsed.ok ? parsed.satang : undefined,
          note: note.trim() || null,
          category,
          spentOn,
        };
    const result = await save.submit({ id: entry.id, ...body }, () => api.editEntry(entry.id, body));
    if (result.ok) {
      toast.show("บันทึกการแก้ไขแล้ว", { mascot: "budgetOk" });
      router.replace("/app/plan?tab=list");
      return;
    }
    if ("skipped" in result) return;
    setError(errorText(result.error, "แก้ไขไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }

  async function handleDelete() {
    if (!entry) return;
    setError(null);
    const result = await del.submit(entry.id, () => api.cancelEntry(entry.id));
    if (result.ok) {
      setDeleteOpen(false);
      toast.show("ลบรายการแล้ว");
      router.replace("/app/plan?tab=list");
      return;
    }
    if ("skipped" in result) return;
    setDeleteOpen(false);
    setError(errorText(result.error, "ลบรายการไม่สำเร็จ"));
  }

  if (loading) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังโหลดรายการ…
      </main>
    );
  }

  if (loadFailed) {
    return (
      <main className="flex flex-col gap-4 py-4 font-body">
        <AppHeader title="แก้ไขรายการ" back="/app/plan?tab=list" tone="default" />
        <Banner kind="error" text="โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง" />
        <Button
          variant="primary"
          onClick={() => {
            setLoading(true);
            setLoadFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          ลองใหม่
        </Button>
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

      {fromPlan ? (
        <Banner
          kind="info"
          text={
            isBill
              ? "รายการนี้มาจากการจ่ายบิลในแผน แก้ที่นี่ไม่ได้ ให้ยกเลิกการจ่ายที่แผนแทน"
              : "รายการนี้มาจากการจ่ายแผน แก้ยอดและวันที่ไม่ได้ เปลี่ยนได้แค่หมวด"
          }
        />
      ) : null}

      <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
        <InputField
          label="จำนวนเงิน (บาท)"
          inputMode="decimal"
          value={amountText}
          disabled={fromPlan}
          onChange={(e) => {
            setAmountText(e.target.value);
            if (amountError) setAmountError(null);
          }}
          state={amountError ? "error" : "filled"}
          helper={amountError ?? undefined}
        />

        <InputField
          label="ชื่อรายการ"
          value={note}
          disabled={fromPlan}
          onChange={(e) => setNote(e.target.value)}
          state={note ? "filled" : "default"}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">หมวดหมู่</span>
          <div className="flex flex-wrap gap-2">
            {USER_CATEGORIES.map((cat) => (
              <Chip key={cat} selected={category === cat} disabled={isBill} onClick={() => setCategory(cat)}>
                {CATEGORY_LABELS[cat]}
              </Chip>
            ))}
          </div>
        </div>

        <InputField
          label="วันที่"
          type="date"
          value={spentOn}
          disabled={fromPlan}
          onChange={(e) => setSpentOn(e.target.value)}
          state="filled"
        />
      </section>

      {error ? <Banner kind="error" text={error} /> : null}

      <div className="flex flex-col gap-2">
        <Button variant="primary" block busy={save.busy} disabled={busy || isBill} onClick={handleSave}>
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
            <Button variant="primary" block busy={del.busy} onClick={handleDelete}>
              ยืนยันลบรายการ
            </Button>
            <Button variant="ghost" block disabled={del.busy} onClick={() => setDeleteOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
