"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { BillsCard } from "@/components/setup/bills-card";
import { BufferCard, EssentialPicker, SavingsPicker } from "@/components/setup/savings-picker";
import { SetupFrame } from "@/components/setup/setup-frame";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import { Mascot } from "@/components/ui/mascot";
import { thaiDate } from "@/lib/calc/time";
import { ApiError } from "@/lib/client/errors";
import {
  clearSetupDraft,
  draftToNewCycleRequest,
  missingDraftFields,
  percentOptionsOf,
  previewSetupDraft,
  saveSetupDraft,
  savingsSatangOf,
  unpaidBillsTotal,
  type SetupDraft,
} from "@/lib/client/setup-draft";
import { useApi } from "@/lib/client/use-api";
import { useLoadedSetupDraft } from "@/lib/client/use-setup-draft";
import { useSubmit } from "@/lib/client/use-submit";
import { bahtErrorMessage } from "@/lib/format/baht-error";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht, parseBahtInput } from "@/lib/format/money";

const SOURCES: { key: NonNullable<SetupDraft["incomeSource"]>; label: string }[] = [
  { key: "family", label: "ทางบ้านส่งให้" },
  { key: "side_job", label: "ทำงานพิเศษ" },
  { key: "other", label: "กยศ. / อื่น ๆ" },
];

const FREQUENCIES: { key: NonNullable<SetupDraft["incomeFrequency"]>; label: string; paydayLabel: string }[] = [
  { key: "monthly", label: "รายเดือน", paydayLabel: "วันเงินเข้าครั้งถัดไป" },
  { key: "weekly", label: "รายสัปดาห์", paydayLabel: "วันรับเงินรายสัปดาห์ถัดไป" },
  { key: "irregular", label: "ไม่แน่นอน", paydayLabel: "กะว่าจะใช้ก้อนนี้ถึงวันที่เท่าไหร่" },
];

const TIGHT_THRESHOLD_SATANG = 5000; // 50 baht/day (Figma A5b)

function toBahtText(satang: number | null): string {
  return satang !== null ? formatBaht(satang).replace(/,/g, "") : "";
}

// The saved draft lives in localStorage, which only exists in the browser. Every step therefore renders
// nothing until the mounted effect has read it, then mounts its form with that draft as initial state.
function DraftGate({ children }: { children: (initial: SetupDraft) => ReactNode }) {
  const loaded = useLoadedSetupDraft();
  if (loaded === null) return null;
  return <>{children(loaded)}</>;
}

// ---------- step 1 · income ----------

export function SetupIncomeView() {
  return <DraftGate>{(initial) => <IncomeForm initial={initial} />}</DraftGate>;
}

function IncomeForm({ initial }: { initial: SetupDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => thaiDate(new Date()));

  const freqMeta = FREQUENCIES.find((f) => f.key === draft.incomeFrequency) ?? FREQUENCIES[0];

  function handleNext() {
    if (draft.incomeSource === null || draft.incomeFrequency === null) {
      setError("กรุณาเลือกแหล่งเงินและความถี่ที่เงินเข้า");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.payday) || draft.payday <= today) {
      setError("กรุณาเลือกวันที่หลังวันนี้");
      return;
    }
    saveSetupDraft(draft);
    router.push("/app/setup/balance");
  }

  let formattedPayday = "";
  try {
    formattedPayday = draft.payday ? formatThaiDate(draft.payday, "long") : "";
  } catch {
    formattedPayday = "";
  }

  return (
    <SetupFrame
      step={1}
      title="ตั้งค่า 1/4 · เงินเข้า"
      subtitle="บอกที่มาและวันเงินเข้า เพื่อให้พอใช้หารงบรายวันได้ตรงกับรอบเงินจริงของคุณ"
      backHref="/app/consent"
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-primary">แหล่งเงินหลัก</h2>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <Chip
                key={s.key}
                selected={draft.incomeSource === s.key}
                onClick={() => {
                  setError(null);
                  setDraft((d) => ({ ...d, incomeSource: s.key }));
                }}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-primary">ความถี่ที่เงินเข้า</h2>
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => (
              <Chip
                key={f.key}
                selected={draft.incomeFrequency === f.key}
                onClick={() => {
                  setError(null);
                  setDraft((d) => ({ ...d, incomeFrequency: f.key }));
                }}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <InputField
            label={freqMeta.paydayLabel}
            type="date"
            value={draft.payday}
            onChange={(e) => {
              setError(null);
              setDraft((d) => ({ ...d, payday: e.target.value }));
            }}
            state={error ? "error" : draft.payday ? "filled" : "default"}
            helper={
              error ??
              (formattedPayday ? `นับรวมวันนี้จนถึง ${formattedPayday}` : "เลือกวันที่เงินรอบถัดไปจะเข้า")
            }
          />
        </section>

        <Button variant="primary" block onClick={handleNext}>
          ถัดไป
        </Button>
      </div>
    </SetupFrame>
  );
}

// ---------- step 2 · balance + bills ----------

export function SetupBalanceView() {
  return <DraftGate>{(initial) => <BalanceForm initial={initial} />}</DraftGate>;
}

function BalanceForm({ initial }: { initial: SetupDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(initial);
  const [balanceText, setBalanceText] = useState(() => toBahtText(initial.balance));
  const [error, setError] = useState<string | null>(null);

  function handleBalanceChange(val: string) {
    setBalanceText(val);
    setError(null);
    const parsed = parseBahtInput(val, { allowZero: true });
    setDraft((d) => ({ ...d, balance: parsed.ok ? parsed.satang : null }));
  }

  function handleNext() {
    const parsed = parseBahtInput(balanceText, { allowZero: true });
    if (!parsed.ok) {
      setError(bahtErrorMessage(parsed.reason, { allowZero: true }));
      return;
    }
    saveSetupDraft({ ...draft, balance: parsed.satang });
    router.push("/app/setup/savings");
  }

  return (
    <SetupFrame
      step={2}
      title="ตั้งค่า 2/4 · เงินที่มี + บิล"
      subtitle="กรอกเงินที่มีตอนนี้ และเช็กบิลประจำที่ต้องจ่ายก่อนเงินรอบหน้าจะเข้า"
      backHref="/app/setup/income"
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <InputField
            label="เงินที่มีตอนนี้ (บาท)"
            inputMode="decimal"
            placeholder="เช่น 2400"
            value={balanceText}
            onChange={(e) => handleBalanceChange(e.target.value)}
            state={error ? "error" : balanceText ? "filled" : "default"}
            helper={error ?? "รวมเงินสดและเงินในบัญชีที่ใช้จ่ายในรอบนี้"}
          />
        </section>

        <BillsCard
          bills={draft.bills}
          unpaidBillsTotal={unpaidBillsTotal(draft)}
          onAdd={(b) =>
            setDraft((d) => ({
              ...d,
              bills: [...d.bills, { ...b, id: `draft-bill-${Date.now()}-${d.bills.length}` }],
            }))
          }
          onUpdate={(updated) =>
            setDraft((d) => ({ ...d, bills: d.bills.map((b) => (b.id === updated.id ? updated : b)) }))
          }
          onDelete={(id) => setDraft((d) => ({ ...d, bills: d.bills.filter((b) => b.id !== id) }))}
        />

        <Button variant="primary" block onClick={handleNext}>
          ถัดไป
        </Button>
      </div>
    </SetupFrame>
  );
}

// ---------- step 3 · savings + buffer ----------

export function SetupSavingsView() {
  return <DraftGate>{(initial) => <SavingsForm initial={initial} />}</DraftGate>;
}

function SavingsForm({ initial }: { initial: SetupDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(initial);
  const [error, setError] = useState<string | null>(null);

  const percentOptions = percentOptionsOf(draft.balance);

  function handleNext() {
    const savingsChosen =
      draft.savingsMode === "none" ||
      (draft.savingsMode === "percent" && draft.savingsPercent !== null) ||
      (draft.savingsMode === "amount" && draft.savingsAmount !== null);
    if (!savingsChosen || draft.emergencyBuffer === null) {
      setError("กรุณาเลือกเป้าออมและเงินเผื่อ (ถ้าไม่ต้องการ เลือก ยังไม่ตั้ง / ไม่กัน)");
      return;
    }
    saveSetupDraft(draft);
    router.push("/app/setup/essentials");
  }

  return (
    <SetupFrame
      step={3}
      title="ตั้งค่า 3/4 · กันเงินออม + เงินเผื่อ"
      subtitle="หักเงินออมและเงินเผื่อไว้ตั้งแต่ต้นรอบ เพื่อไม่เผลอใช้เกิน"
      backHref="/app/setup/balance"
    >
      <div className="flex flex-col gap-5">
        <SavingsPicker
          mode={draft.savingsMode}
          percent={draft.savingsPercent}
          savingsSatang={savingsSatangOf(draft)}
          percentOptions={percentOptions}
          onChangePercent={(pct) => {
            setError(null);
            setDraft((d) => ({ ...d, savingsMode: "percent", savingsPercent: pct }));
          }}
          onChangeAmount={(satang) => {
            setError(null);
            setDraft((d) => ({ ...d, savingsMode: "amount", savingsAmount: satang }));
          }}
          onClear={() => {
            setError(null);
            setDraft((d) => ({ ...d, savingsMode: "none", savingsAmount: null }));
          }}
        />

        <BufferCard
          bufferSatang={draft.emergencyBuffer}
          onChangeBuffer={(satang) => {
            setError(null);
            setDraft((d) => ({ ...d, emergencyBuffer: satang }));
          }}
        />

        {error ? <Banner kind="error" text={error} /> : null}

        <Button variant="primary" block onClick={handleNext}>
          ถัดไป
        </Button>
      </div>
    </SetupFrame>
  );
}

// ---------- step 4 · essentials ----------

export function SetupEssentialsView() {
  return <DraftGate>{(initial) => <EssentialsForm initial={initial} />}</DraftGate>;
}

function EssentialsForm({ initial }: { initial: SetupDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(initial);

  function handleNext() {
    saveSetupDraft(draft);
    router.push("/app/setup/review");
  }

  function handleSkip() {
    saveSetupDraft({ ...draft, essentialPerDay: null });
    router.push("/app/setup/review");
  }

  return (
    <SetupFrame
      step={4}
      title="ตั้งค่า 4/4 · ค่าจำเป็นต่อวัน"
      subtitle="บอกยอดขั้นต่ำที่ต้องใช้ทุกวัน เช่น ค่าอาหารและค่าเดินทาง เพื่อให้พอใช้ช่วยเตือนตอนลองซื้อของ"
      backHref="/app/setup/savings"
    >
      <div className="flex flex-col gap-5">
        <EssentialPicker
          essentialPerDay={draft.essentialPerDay}
          note={draft.essentialNote}
          onChangeEssential={(satang) => setDraft((d) => ({ ...d, essentialPerDay: satang }))}
          onChangeNote={(note) => setDraft((d) => ({ ...d, essentialNote: note }))}
        />

        <div className="flex flex-col gap-2">
          <Button variant="primary" block onClick={handleNext}>
            ดูสรุปแผน
          </Button>
          <Button variant="ghost" block onClick={handleSkip}>
            ข้ามไปก่อน
          </Button>
        </div>
      </div>
    </SetupFrame>
  );
}

// ---------- step 5 · review (A4 / A5a / A5b) ----------

export function SetupReviewView() {
  return <DraftGate>{(initial) => <ReviewForm draft={initial} />}</DraftGate>;
}

function ReviewForm({ draft }: { draft: SetupDraft }) {
  const api = useApi();
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const [showBills, setShowBills] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => thaiDate(new Date()));

  const missing = missingDraftFields(draft);
  const preview = previewSetupDraft(draft, today);
  const budget = preview?.budget ?? null;
  const unpaidBills = draft.bills.filter((b) => b.status === "unpaid");
  const isShortfall = budget?.kind === "shortfall";
  const isTight = budget?.kind === "ok" && budget.dailyBudget < TIGHT_THRESHOLD_SATANG;

  async function handleStartCycle() {
    if (missing.length > 0) return;
    setError(null);
    const req = draftToNewCycleRequest(draft);
    const result = await submit(req, () => api.createCycle(req));
    if (result.ok) {
      // busy stays true: the page is about to unmount, so a second tap cannot slip in.
      clearSetupDraft();
      router.replace("/app?toast=saved");
      return;
    }
    if ("skipped" in result) return;
    if (result.error instanceof ApiError && result.error.status === 409 && result.error.code === "cycle_exists") {
      // Another tab/device already created the cycle: treat as done.
      clearSetupDraft();
      router.replace("/app");
      return;
    }
    setError(result.error instanceof ApiError ? result.error.message : "บันทึกแผนไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  let paydayLabel = draft.payday;
  try {
    paydayLabel = draft.payday ? formatThaiDate(draft.payday, "short") : "";
  } catch {
    paydayLabel = draft.payday;
  }

  const frame = (children: ReactNode) => (
    <SetupFrame
      step={5}
      title="ตรวจสรุป"
      subtitle="ตรวจสอบตัวเลขงบรายวันและเงินที่กันไว้ก่อนเริ่มรอบนี้"
      backHref="/app/setup/essentials"
    >
      <div className="flex flex-col gap-5">{children}</div>
    </SetupFrame>
  );

  if (preview === null || budget === null) {
    return frame(
      <>
        <Banner kind="warn" text={`ยังไม่ได้กรอก ${missing.join(" · ")}`} />
        <Button variant="primary" block onClick={() => router.push("/app/setup/income")}>
          กรอกข้อมูลที่ขาด
        </Button>
      </>,
    );
  }

  if (budget.kind === "payday-passed") {
    return frame(
      <>
        <Banner kind="error" text="วันเงินเข้าผ่านไปแล้ว กรุณาเลือกวันเงินเข้าใหม่" />
        <Button variant="primary" block onClick={() => router.push("/app/setup/income")}>
          แก้วันเงินเข้า
        </Button>
      </>,
    );
  }

  return frame(
    <>
      {/* Figma: A4 (ok) has no mascot; A5a/A5b (shortfall / tight) have budgetTight 72. */}
      {isShortfall || isTight ? (
        <div className="flex flex-col items-center gap-2 pt-1 text-center">
          <Mascot pose="budgetTight" size={72} />
        </div>
      ) : null}

      {isShortfall ? (
        <Banner kind="error" text="เงินที่มียังไม่ครอบคลุมบิลก่อนวันเงินเข้า" />
      ) : isTight ? (
        <Banner kind="warn" text="ตึงมาก: เหลือต่ำกว่า 50 บาทต่อวัน" />
      ) : (
        <Banner kind="info" text="ถ้าตัวเลขไม่ตรงกับเงินจริง กลับไปแก้ได้ก่อนเริ่ม" />
      )}

      <section className="flex flex-col gap-3 rounded-md border border-line-strong bg-card p-5">
        {budget.kind === "ok" ? (
          <>
            <span className="text-sm font-medium text-secondary">ใช้ได้วันละ</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums text-primary">{formatBaht(budget.dailyBudget)}</span>
              <span className="text-base font-semibold text-secondary">บาท/วัน</span>
            </div>
            <p className="text-xs text-secondary">
              อีก {budget.daysLeft} วัน จนถึงวันเงินเข้า ({paydayLabel})
            </p>
            {budget.maxPurchase !== null ? (
              <div className="mt-1 rounded-sm bg-subtle px-3 py-2 text-sm font-semibold tabular-nums text-primary">
                {`ซื้อได้ไม่เกิน ${formatBaht(budget.maxPurchase)} บาท`}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-danger">{`ยังขาดอีก ${formatBaht(budget.kind === "shortfall" ? budget.shortfall : 0)} บาท`}</span>
            <p className="text-xs text-secondary">
              อีก {budget.daysLeft} วันถึงวันเงินเข้า ({paydayLabel}) · ตรวจตัวเลขที่กรอกอีกครั้ง
              หรือเลื่อนบิลที่จ่ายทีหลังได้ออกจากรอบนี้
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4 text-sm">
        <h2 className="text-base font-semibold text-primary">รายละเอียดการคำนวณ</h2>
        <div className="flex items-center justify-between">
          <span className="text-secondary">เงินที่มีตอนนี้</span>
          <span className="font-semibold tabular-nums text-primary">
            {draft.balance !== null ? `${formatBaht(draft.balance)} บาท` : ""}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowBills((v) => !v)}
              aria-expanded={showBills}
              className="text-left font-medium text-link underline underline-offset-4"
            >
              หักบิล {unpaidBills.length} รายการ {showBills ? "▴" : "▾"}
            </button>
            <span className="font-semibold tabular-nums text-primary">−{formatBaht(preview.unpaidBillsTotal)} บาท</span>
          </div>
          {showBills && draft.bills.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-sm bg-subtle p-2.5 text-xs text-secondary">
              {draft.bills.map((b) => (
                <li key={b.id} className="flex items-center justify-between">
                  <span>
                    {b.title} ({b.status === "unpaid" ? "ยังไม่จ่าย" : b.status === "paid" ? "จ่ายแล้ว" : "จ่ายแยก"})
                  </span>
                  <span className="tabular-nums">{formatBaht(b.amount)} บาท</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-secondary">เป้าออมรอบนี้</span>
          <span className="font-semibold tabular-nums text-primary">−{formatBaht(preview.savingsSatang)} บาท</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-secondary">เงินเผื่อฉุกเฉิน</span>
          <span className="font-semibold tabular-nums text-primary">
            −{formatBaht(draft.emergencyBuffer ?? 0)} บาท
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-2">
          <span className="text-secondary">ค่าจำเป็นต่อวัน</span>
          <span className="font-semibold tabular-nums text-primary">
            {draft.essentialPerDay !== null ? `${formatBaht(draft.essentialPerDay)} บาท/วัน` : "ยังไม่ระบุ"}
          </span>
        </div>
      </section>

      {error ? <Banner kind="error" text={error} /> : null}

      {isShortfall ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" block onClick={() => router.push("/app/setup/balance")}>
            แก้ตัวเลข
          </Button>
          <Button variant="secondary" block onClick={() => router.push("/app/setup/balance")}>
            เลือกบิลที่เลื่อนได้
          </Button>
        </div>
      ) : isTight ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" block busy={busy} onClick={handleStartCycle}>
            เริ่มใช้ต่อไป
          </Button>
          <Button variant="secondary" block disabled={busy} onClick={() => router.push("/app/setup/balance")}>
            แก้ตัวเลข
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button variant="primary" block busy={busy} onClick={handleStartCycle}>
            ถูกต้อง เริ่มใช้เลย
          </Button>
          <Button variant="secondary" block disabled={busy} onClick={() => router.push("/app/setup/balance")}>
            กลับไปแก้ไข
          </Button>
        </div>
      )}
    </>,
  );
}
