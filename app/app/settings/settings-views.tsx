"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/shell/sheet";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { ListRow } from "@/components/ui/list-row";
import { USER_CATEGORIES, type Plan, type Summary } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { essentialsFromDaily } from "@/lib/client/essentials";
import { ApiError } from "@/lib/client/errors";
import { clearAllLocalUserData } from "@/lib/client/local-data";
import type { ReminderSettings } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import { bahtErrorMessage } from "@/lib/format/baht-error";
import { formatBaht, parseBahtInput, satangToInputString } from "@/lib/format/money";

const MSG_NOT_READY = "ยังไม่พร้อมใช้งาน";
const MSG_LOAD_FAILED = "โหลดข้อมูลไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่อีกครั้ง";

function isCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code;
}

// "Not implemented" always reads as the same honest message; other server errors show their own text.
function errorText(err: unknown, fallback: string): string {
  if (isCode(err, "not_implemented")) return MSG_NOT_READY;
  return err instanceof ApiError ? err.message : fallback;
}

function Chevron() {
  return <span aria-hidden="true">›</span>;
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Banner kind="error" text={MSG_LOAD_FAILED} />
      <Button variant="primary" onClick={onRetry}>
        ลองใหม่
      </Button>
    </div>
  );
}

// H3. Only what exists: no name, avatar, point total or plan status is invented.
export function SettingsMainView() {
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ตั้งค่า" tone="default" />

      <section className="divide-y divide-line rounded-md border border-line bg-card px-4">
        <ListRow title="รอบเงินและวันเงินเข้า" href="/app/plan/edit" badge={<Chevron />} />
        <ListRow title="การเตือน" href="/app/settings/notifications" badge={<Chevron />} />
        <ListRow title="เงินออม · เงินเผื่อ · ค่าจำเป็น" href="/app/settings/savings" badge={<Chevron />} />
        <ListRow title="ความเป็นส่วนตัวและข้อมูล" href="/app/settings/privacy" badge={<Chevron />} />
        <ListRow title="บิลประจำ" href="/app/settings/bills" badge={<Chevron />} />
        <ListRow title="หมวดหมู่ของฉัน" href="/app/settings/categories" badge={<Chevron />} />
        <ListRow title="ลบข้อมูลของฉัน" href="/app/settings/delete" badge={<Chevron />} />
      </section>
    </main>
  );
}

type RemindersState =
  | { state: "loading" }
  | { state: "not_ready" }
  | { state: "failed" }
  | { state: "ok"; settings: ReminderSettings };

// R1. Everything comes from the server; without it the controls are shown disabled.
export function SettingsNotificationsView() {
  const api = useApi();
  const save = useSubmit<ReminderSettings>();
  const [data, setData] = useState<RemindersState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("");
  const [paused, setPaused] = useState(false);
  const [pausedUntil, setPausedUntil] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const apply = useCallback((s: ReminderSettings) => {
    setEnabled(s.enabled);
    setTime(s.time);
    setPaused(s.pausedUntil !== null);
    setPausedUntil(s.pausedUntil ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.reminderSettings().then(
      (s) => {
        if (cancelled) return;
        apply(s);
        setData({ state: "ok", settings: s });
      },
      (err) => {
        if (!cancelled) setData(isCode(err, "not_implemented") ? { state: "not_ready" } : { state: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, apply, attempt]);

  // Any edit is a new action: it re-arms Save and rotates the idempotency key.
  function edit(fn: () => void) {
    fn();
    setSavedNote(false);
    setFieldError(null);
    if (save.done || save.error) save.reset();
  }

  async function handleSave() {
    if (paused && !pausedUntil) {
      setFieldError("เลือกวันที่หยุดเตือนถึง");
      return;
    }
    const req = { enabled, time, pausedUntil: paused ? pausedUntil : null };
    const result = await save.submit(req, () => api.saveReminderSettings(req));
    if (result.ok) {
      // The message and the shown values come from what the server returned.
      apply(result.value);
      setData({ state: "ok", settings: result.value });
      setSavedNote(true);
    }
  }

  const header = <AppHeader title="การเตือน" back="/app/settings" tone="default" />;

  if (data.state === "loading") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
        {header}
        <p className="text-sm text-secondary">กำลังโหลด…</p>
      </main>
    );
  }
  if (data.state === "failed") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        {header}
        <LoadFailed
          onRetry={() => {
            setData({ state: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      </main>
    );
  }

  const ready = data.state === "ok";
  const habits = data.state === "ok" ? data.settings.habits : [];
  const saveError = save.error ? errorText(save.error, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง") : null;

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      {header}

      {!ready ? <Banner kind="info" text={`${MSG_NOT_READY} — ตั้งค่าการเตือนยังใช้ไม่ได้ตอนนี้`} /> : null}

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-primary">
          <span className="flex flex-col">
            <span>เตือนรายการประจำ</span>
            <span className="text-xs font-normal text-secondary">เตือนเมื่อยังไม่จดรายการที่ทำซ้ำทุกวัน</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            disabled={!ready}
            onChange={(e) => edit(() => setEnabled(e.target.checked))}
            className="size-5 accent-[var(--green-700)]"
          />
        </label>

        <InputField
          label="เวลาเตือน"
          type="time"
          value={time}
          disabled={!ready}
          onChange={(e) => edit(() => setTime(e.target.value))}
        />

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-primary">
            <span>หยุดเตือนชั่วคราว</span>
            <input
              type="checkbox"
              role="switch"
              checked={paused}
              disabled={!ready}
              onChange={(e) => edit(() => setPaused(e.target.checked))}
              className="size-5 accent-[var(--green-700)]"
            />
          </label>
          {paused ? (
            <InputField
              label="หยุดเตือนถึงวันที่"
              type="date"
              value={pausedUntil}
              disabled={!ready}
              onChange={(e) => edit(() => setPausedUntil(e.target.value))}
              state={fieldError ? "error" : "default"}
              helper={fieldError ?? undefined}
            />
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">รายการประจำ</h2>
        {habits.length === 0 ? (
          <p className="text-sm text-muted">
            {ready ? "ยังไม่มีรายการประจำที่ระบบตรวจพบ" : "ยังไม่มีข้อมูล"}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {habits.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 rounded-sm bg-subtle p-3 text-sm">
                <span className="font-semibold text-primary">
                  {h.label} ~{formatBaht(h.amount)} บาท
                </span>
                <span className="text-xs text-secondary">ถามตอน {h.time}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-secondary">พอใช้ไม่ส่งโปรหรือโฆษณาผ่านข้อความ LINE</p>

      {saveError ? <Banner kind={isCode(save.error, "not_implemented") ? "info" : "error"} text={saveError} /> : null}
      {savedNote ? <Banner kind="info" text="บันทึกการตั้งค่าแล้ว" /> : null}

      <Button
        variant="primary"
        block
        disabled={!ready || save.done}
        busy={save.busy && !save.done}
        onClick={handleSave}
      >
        บันทึก
      </Button>
    </main>
  );
}

type BillsState =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ok"; bills: Plan[] };

function billStatusText(bill: Plan): string {
  switch (bill.status) {
    case "reserved":
      return bill.heldThisCycle ? "ยังไม่จ่าย · หักจากเงินที่ใช้ได้" : "ยังไม่จ่าย · ยังไม่หักในรอบนี้";
    case "paid":
      return "จ่ายแล้ว ✓";
    case "separate":
      return "จ่ายแยก · ไม่หักงบ";
    case "postponed":
      return "เลื่อนไปรอบหน้า";
    default:
      return "ยกเลิกแล้ว";
  }
}

// H7. Lists the real bills; add and remove hit the API. Rename/re-amount and "จ่ายแยก" have no API.
export function SettingsBillsView() {
  const api = useApi();
  const router = useRouter();
  const routerRef = useRef(router); // the router object is not guaranteed stable: keep it out of effect deps
  useEffect(() => {
    routerRef.current = router;
  });
  const add = useSubmit<unknown>();
  const remove = useSubmit<unknown>();
  const [data, setData] = useState<BillsState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Plan | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.plans().then(
      (res) => {
        if (!cancelled) setData({ state: "ok", bills: res.plans.filter((p) => p.kind === "bill" && p.status !== "cancelled") });
      },
      (err) => {
        if (cancelled) return;
        if (isCode(err, "no_cycle")) routerRef.current.replace("/app/setup/income");
        else if (isCode(err, "no_consent")) routerRef.current.replace("/app/consent");
        else setData({ state: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  function openAdd() {
    add.reset();
    setTitle("");
    setAmountText("");
    setTitleError(null);
    setAmountError(null);
    setMessage(null);
    setAddOpen(true);
  }

  async function handleAdd() {
    const cleanTitle = title.trim();
    const parsed = parseBahtInput(amountText);
    setTitleError(cleanTitle ? null : "กรุณาใส่ชื่อบิล");
    setAmountError(parsed.ok ? null : bahtErrorMessage(parsed.reason));
    if (!cleanTitle || !parsed.ok) return;
    const req = { title: cleanTitle, amount: parsed.satang };
    const result = await add.submit(req, (key) => api.addPlan({ kind: "bill", status: "reserved", ...req }, key));
    if (result.ok) {
      setAddOpen(false);
      setMessage({ kind: "info", text: "เพิ่มบิลแล้ว" });
      setAttempt((n) => n + 1);
    }
  }

  function openRemove(bill: Plan) {
    remove.reset();
    setMessage(null);
    setRemoving(bill);
  }

  async function handleRemove() {
    if (!removing) return;
    const id = removing.id;
    const result = await remove.submit(id, () => api.planAction(id, "cancel"));
    if (result.ok) {
      setRemoving(null);
      setMessage({ kind: "info", text: "ลบบิลแล้ว" });
      setAttempt((n) => n + 1);
    }
  }

  const addError = add.error ? errorText(add.error, "เพิ่มบิลไม่สำเร็จ ลองใหม่อีกครั้ง") : null;
  const removeError = remove.error ? errorText(remove.error, "ลบบิลไม่สำเร็จ ลองใหม่อีกครั้ง") : null;

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="บิลประจำ" back="/app/settings" tone="default" />

      {data.state === "loading" ? (
        <p className="text-sm text-secondary" aria-busy="true">
          กำลังโหลดบิล…
        </p>
      ) : data.state === "failed" ? (
        <LoadFailed
          onRetry={() => {
            setData({ state: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <div>
            <h2 className="text-base font-semibold text-primary">บิลที่ต้องจ่ายก่อนวันเงินเข้า</h2>
            <p className="text-xs text-secondary">แก้ไขชื่อหรือยอดเงินของบิลที่เพิ่มแล้วยังทำไม่ได้ตอนนี้</p>
          </div>

          {data.bills.length === 0 ? (
            <p className="py-2 text-sm text-muted">ยังไม่มีบิลที่ตั้งไว้</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.bills.map((bill) => (
                <li key={bill.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">{bill.title}</p>
                      <p className="text-xs text-secondary">{billStatusText(bill)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      {formatBaht(bill.amount)} บาท
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openRemove(bill)}
                      aria-label={`ลบ ${bill.title}`}
                      className="inline-flex h-11 items-center rounded-pill px-3 text-sm font-semibold text-danger outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]"
                    >
                      ลบ
                    </button>
                    <button
                      type="button"
                      onClick={() => setMessage({ kind: "info", text: `${MSG_NOT_READY} — แก้ไขบิลยังใช้ไม่ได้ตอนนี้` })}
                      aria-label={`แก้ไข ${bill.title}`}
                      className="inline-flex h-11 items-center rounded-pill px-3 text-sm font-semibold text-link outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]"
                    >
                      แก้ไข
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button variant="secondary" block onClick={openAdd}>
            + เพิ่มบิล
          </Button>
        </section>
      )}

      {message ? <Banner kind={message.kind} text={message.text} /> : null}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="เพิ่มบิล">
        <div className="flex flex-col gap-4">
          <InputField
            label="ชื่อบิล"
            placeholder="เช่น ค่าหอ, ค่าน้ำ, ค่าเน็ต"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            state={titleError ? "error" : title ? "filled" : "default"}
            helper={titleError ?? undefined}
          />
          <InputField
            label="จำนวนเงิน (บาท)"
            inputMode="decimal"
            placeholder="เช่น 400"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
              setAmountError(null);
            }}
            state={amountError ? "error" : amountText ? "filled" : "default"}
            helper={amountError ?? undefined}
          />
          {addError ? <Banner kind={isCode(add.error, "not_implemented") ? "info" : "error"} text={addError} /> : null}
          <div className="flex flex-col gap-2">
            <Button variant="primary" block busy={add.busy} onClick={handleAdd}>
              บันทึก
            </Button>
            <Button variant="ghost" block onClick={() => setAddOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={removing !== null} onClose={() => setRemoving(null)} title="ลบบิลนี้?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            {removing ? `${removing.title} ${formatBaht(removing.amount)} บาท จะไม่ถูกหักจากเงินที่ใช้ได้อีก` : ""}
          </p>
          {removeError ? <Banner kind="error" text={removeError} /> : null}
          <div className="flex flex-col gap-2">
            <Button variant="primary" block busy={remove.busy} onClick={handleRemove}>
              ลบบิล
            </Button>
            <Button variant="ghost" block onClick={() => setRemoving(null)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}

type SavingsState = { state: "loading" } | { state: "failed" } | { state: "ok"; summary: Summary };

// H8. Only the daily essentials can be saved (api.setEssentials). Savings % and the emergency buffer
// have no client API yet, so they are shown read-only from the server with a "not ready" note.
export function SettingsSavingsView() {
  const api = useApi();
  const router = useRouter();
  const routerRef = useRef(router); // the router object is not guaranteed stable: keep it out of effect deps
  useEffect(() => {
    routerRef.current = router;
  });
  const save = useSubmit<{ summary: Summary }>();
  const [data, setData] = useState<SavingsState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [essentialText, setEssentialText] = useState("");
  const [essentialError, setEssentialError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [notReady, setNotReady] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.summary().then(
      (s) => {
        if (cancelled) return;
        setEssentialText(s.essentialPerDay === null ? "" : satangToInputString(s.essentialPerDay));
        setData({ state: "ok", summary: s });
      },
      (err) => {
        if (cancelled) return;
        if (isCode(err, "no_cycle")) routerRef.current.replace("/app/setup/income");
        else if (isCode(err, "no_consent")) routerRef.current.replace("/app/consent");
        else setData({ state: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  async function handleSave() {
    const parsed = parseBahtInput(essentialText);
    setEssentialError(parsed.ok ? null : bahtErrorMessage(parsed.reason));
    if (!parsed.ok) return;
    const result = await save.submit(parsed.satang, () => api.setEssentials(essentialsFromDaily(parsed.satang)));
    if (result.ok) {
      setData({ state: "ok", summary: result.value.summary });
      setSavedNote(true);
    }
  }

  const header = <AppHeader title="เงินออม เงินเผื่อ + ค่าจำเป็น" back="/app/settings" tone="default" />;

  if (data.state === "loading") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
        {header}
        <p className="text-sm text-secondary">กำลังโหลด…</p>
      </main>
    );
  }
  if (data.state === "failed") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        {header}
        <LoadFailed
          onRetry={() => {
            setData({ state: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      </main>
    );
  }

  const s = data.summary;
  const saveError = save.error ? errorText(save.error, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง") : null;

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      {header}

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">1 เป้าออมรอบนี้</h2>
        <p className="text-sm text-secondary">
          ตอนนี้กันไว้ <span className="font-semibold tabular-nums text-primary">{formatBaht(s.savings)} บาท</span>
        </p>
        <Button
          variant="secondary"
          onClick={() => setNotReady(`${MSG_NOT_READY} — ปรับเป้าออมยังใช้ไม่ได้ตอนนี้`)}
        >
          ปรับเป้าออม
        </Button>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">2 เงินเผื่อ</h2>
        <p className="text-sm text-secondary">
          เก็บไว้สำหรับเรื่องฉุกเฉิน · ตอนนี้{" "}
          <span className="font-semibold tabular-nums text-primary">{formatBaht(s.emergencyBuffer)} บาท</span>
        </p>
        <Button
          variant="secondary"
          onClick={() => setNotReady(`${MSG_NOT_READY} — ปรับเงินเผื่อยังใช้ไม่ได้ตอนนี้`)}
        >
          ปรับเงินเผื่อ
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <div>
          <h2 className="text-base font-semibold text-primary">3 ค่าใช้จ่ายจำเป็นต่อวัน</h2>
          <p className="text-xs text-secondary">
            เงินที่ต้องใช้ทุกวันแน่ ๆ ใส่เป็นยอดรวมได้เลย · ใช้คำนวณว่าของชิ้นหนึ่งซื้อได้ไม่เกินเท่าไหร่
          </p>
        </div>
        <InputField
          label="ยอดต่อวัน (บาท)"
          inputMode="decimal"
          placeholder="เช่น 70"
          value={essentialText}
          onChange={(e) => {
            setEssentialText(e.target.value);
            setEssentialError(null);
            setSavedNote(false);
            if (save.done || save.error) save.reset();
          }}
          state={essentialError ? "error" : essentialText ? "filled" : "default"}
          helper={essentialError ?? "รวมทุกอย่างที่ต้องจ่ายทุกวันไว้ในช่องเดียว"}
        />
      </section>

      {notReady ? <Banner kind="info" text={notReady} /> : null}
      {saveError ? <Banner kind={isCode(save.error, "not_implemented") ? "info" : "error"} text={saveError} /> : null}
      {savedNote ? <Banner kind="info" text="บันทึกค่าจำเป็นต่อวันแล้ว" /> : null}

      <Button variant="primary" block disabled={save.done} busy={save.busy && !save.done} onClick={handleSave}>
        บันทึก
      </Button>
    </main>
  );
}

// H4. The four categories the server really has, read-only. Creating/renaming has no API.
export function SettingsCategoriesView() {
  const [notReady, setNotReady] = useState<string | null>(null);

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="หมวดหมู่ของฉัน" back="/app/settings" tone="default" />

      <section className="rounded-md border border-line bg-card px-4">
        <ul className="divide-y divide-line">
          {USER_CATEGORIES.map((c) => (
            <li key={c} className="flex items-center justify-between gap-3 py-3">
              <span className="text-base text-primary">{CATEGORY_LABELS[c]}</span>
              <button
                type="button"
                aria-label={`แก้ไข ${CATEGORY_LABELS[c]}`}
                onClick={() => setNotReady(`${MSG_NOT_READY} — แก้ไขหมวดหมู่ยังใช้ไม่ได้ตอนนี้`)}
                className="inline-flex h-11 items-center rounded-pill px-3 text-sm font-semibold text-link outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)]"
              >
                แก้ไข ›
              </button>
            </li>
          ))}
        </ul>
      </section>

      {notReady ? <Banner kind="info" text={notReady} /> : null}

      <Button
        variant="secondary"
        block
        onClick={() => setNotReady(`${MSG_NOT_READY} — สร้างหมวดหมู่ยังใช้ไม่ได้ตอนนี้`)}
      >
        + สร้างหมวดใหม่
      </Button>
      <Link href="/app/settings" className={buttonClass("primary", true)}>
        เสร็จ
      </Link>
    </main>
  );
}

// H5. Static text from the design.
export function SettingsPrivacyView() {
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ความเป็นส่วนตัวและข้อมูล" back="/app/settings" tone="default" />

      <section className="flex flex-col gap-1 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">พอใช้เก็บข้อมูลเท่าที่จำเป็น</h2>
        <p className="text-sm text-secondary">เพื่อคำนวณว่าเงินพอใช้ถึงวันเงินเข้าไหม</p>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4 text-sm">
        <h2 className="text-base font-semibold text-primary">สิ่งที่เก็บ</h2>
        <ul className="flex flex-col gap-2 text-secondary">
          <li>• ยอดเงิน วันเงินเข้า และบิลที่คุณกรอก</li>
          <li>• รายการรายรับ/รายจ่ายที่คุณจด</li>
          <li>• LINE ID เพื่อให้เปิดแผนของคุณได้</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4 text-sm">
        <h2 className="text-base font-semibold text-primary">สิ่งที่ไม่ทำ</h2>
        <ul className="flex flex-col gap-2 text-secondary">
          <li>• ไม่เชื่อมบัญชีธนาคาร ไม่ขอสลิป</li>
          <li>• เครื่องมือวัดการใช้งาน (Clarity) ปิดบังข้อความที่คุณกรอก</li>
        </ul>
      </section>

      <Link href="/app/settings" className={buttonClass("primary", true)}>
        เข้าใจแล้ว
      </Link>
    </main>
  );
}

// H6. Nothing is cleared here until the server confirms the deletion.
export function SettingsDeleteView() {
  const api = useApi();
  const del = useSubmit<void>();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    const result = await del.submit("delete-my-data", () => api.deleteMyData());
    if (!result.ok) {
      if (!("skipped" in result)) setConfirmOpen(false); // the error is shown on the page
      return;
    }
    clearAllLocalUserData();
    // Hard navigation, not router: the in-memory consent flag must be dropped so Back cannot reach
    // financial screens. busy stays on: no second delete while navigating.
    window.location.replace("/app/consent");
  }

  const error = del.error ? errorText(del.error, "ลบข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง") : null;

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ลบข้อมูลของฉัน" back="/app/settings" tone="default" />

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-5">
        <h2 className="text-lg font-bold text-danger">ลบแล้วกู้คืนไม่ได้</h2>
        <p className="text-sm text-secondary">
          จะลบยอดเงิน รอบเงิน บิล และรายการที่จดทั้งหมดของคุณ แล้วกลับไปเริ่มตั้งค่าใหม่ ถ้าอยากเก็บไว้ กดยกเลิก
        </p>
      </section>

      {error ? <Banner kind={isCode(del.error, "not_implemented") ? "info" : "error"} text={error} /> : null}

      <div className="flex flex-col gap-3">
        <Button
          variant="primary"
          block
          onClick={() => {
            del.reset();
            setConfirmOpen(true);
          }}
        >
          ลบข้อมูลทั้งหมด
        </Button>
        <Link href="/app/settings" className={buttonClass("secondary", true)}>
          ยกเลิก
        </Link>
      </div>

      <Sheet open={confirmOpen} onClose={() => !del.busy && setConfirmOpen(false)} title="ยืนยันลบข้อมูลทั้งหมด?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">ลบแล้วกู้คืนไม่ได้ ข้อมูลทั้งหมดของคุณจะหายไป</p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" block busy={del.busy} onClick={handleDelete}>
              ยืนยันลบ
            </Button>
            <Button variant="ghost" block disabled={del.busy} onClick={() => setConfirmOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
