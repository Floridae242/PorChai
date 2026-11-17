"use client";

import Link from "next/link";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/shell/sheet";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { PlanIcon, SettingsIcon } from "@/components/shell/icons";
import { USER_CATEGORIES, type Summary } from "@/lib/api-types";
import { stopClarity } from "@/lib/clarity";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { essentialsFromDaily, parseEssentialsInput } from "@/lib/client/essentials";
import { ApiError } from "@/lib/client/errors";
import { clearAllLocalUserData } from "@/lib/client/local-data";
import type { ReminderSettings } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
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

const SETTINGS_GROUPS = [
  { title: "แผนเงินของคุณ", icon: PlanIcon, rows: [
    { title: "รอบเงินและวันเงินเข้า", detail: "เปลี่ยนวันเงินเข้า หรือปรับยอดให้ตรงเงินจริง", href: "/app/plan/edit?from=settings" },
    { title: "เงินออม · เงินเผื่อ · ค่าจำเป็น", detail: "ดูเงินที่กันไว้ และตั้งค่าใช้จ่ายจำเป็นต่อวัน", href: "/app/settings/savings" },
    { title: "บิลประจำ", detail: "เลือกวันครบกำหนดและตั้งเตือนบิลในปฏิทิน", href: "/app/settings/bills" },
    { title: "หมวดหมู่ของฉัน", detail: "ตั้งชื่อหมวด งบรายเดือน และดูงบแนะนำ", href: "/app/settings/categories" },
  ] },
  { title: "การแจ้งเตือนผ่าน LINE", icon: SettingsIcon, rows: [
    { title: "การเตือน", detail: "เตือนรายการที่อาจลืมจด และหยุดเตือนชั่วคราว", href: "/app/settings/notifications" },
    { title: "สรุปและเตือนงบ", detail: "เลือกรับสรุปรายวัน รายเดือน และเตือนเมื่อเกินงบ", href: "/app/notifications?from=settings" },
  ] },
] as const;

function SettingsRow({ title, detail, href, danger = false }: { title: string; detail: string; href: string; danger?: boolean }) {
  return <Link href={href} className="group flex min-h-20 items-center gap-3 rounded-md px-4 py-4 outline-none transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-[var(--green-700)]">
    <span className="min-w-0 flex-1">
      <span className={`block text-base font-semibold ${danger ? "text-danger" : "text-primary"}`}>{title}</span>
      <span className="mt-1 block text-sm leading-6 text-secondary">{detail}</span>
    </span>
    <span aria-hidden="true" className={`shrink-0 text-2xl ${danger ? "text-danger" : "text-link"}`}>›</span>
  </Link>;
}

export function SettingsMainView() {
  return (
    <main className="flex flex-col gap-6 py-2 font-body">
      <AppHeader title="ตั้งค่า" tone="default" />
      <section aria-label="ปรับพอใช้ให้เข้ากับคุณ" className="rounded-sheet border border-line bg-selected p-5">
        <p className="font-display text-2xl leading-relaxed text-primary">ใช้เงินในแบบของคุณ</p>
        <p className="mt-1 text-sm leading-6 text-secondary">น้องพอใช้ช่วยจัดแผนให้เข้ากับคุณครับ เลือกปรับงบ หมวดรายจ่าย และการเตือนได้ที่นี่</p>
      </section>
      {SETTINGS_GROUPS.map(({ title, icon: Icon, rows }) => <section key={title} aria-label={title}>
        <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-secondary"><Icon />{title}</h2>
        <div className="divide-y divide-line overflow-hidden rounded-sheet border border-line bg-card">
          {rows.map(row => <SettingsRow key={row.href} {...row} />)}
        </div>
      </section>)}
      <section aria-label="ความช่วยเหลือและข้อมูล">
        <h2 className="mb-3 px-1 text-sm font-semibold text-secondary">ความช่วยเหลือและข้อมูล</h2>
        <div className="divide-y divide-line rounded-sheet border border-line bg-card">
          <SettingsRow title="วิธีใช้พอใช้" detail="ดูตัวอย่างการจดผ่านแชตและวิธีใช้ฟีเจอร์ต่าง ๆ" href="/app/help" />
          <SettingsRow title="ความเป็นส่วนตัวและข้อมูล" detail="ดูว่าพอใช้เก็บข้อมูลอะไรและนำไปใช้อย่างไร" href="/app/settings/privacy" />
        </div>
      </section>
      <section aria-label="จัดการข้อมูลส่วนตัว" className="rounded-sheet border border-line bg-card">
        <SettingsRow title="ลบข้อมูลของฉัน" detail="ลบข้อมูลทั้งหมดและเริ่มใหม่ ต้องยืนยันก่อนลบ" href="/app/settings/delete" danger />
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
  const [timeError, setTimeError] = useState<string | null>(null);

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
    setTimeError(null);
    if (save.done || save.error) save.reset();
  }

  async function handleSave() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setTimeError("เลือกเวลาเตือนก่อนบันทึก");
      return;
    }
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
        <LoadingSkeleton />
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
      <p className="text-sm leading-6 text-secondary">ให้น้องพอใช้ช่วยเตือนรายการที่อาจลืมจดครับ เลือกเวลาให้เหมาะกับวันของคุณได้เลย</p>
      <div className="rounded-sheet border border-line bg-card">
        <SettingsRow title="สรุปรายวัน รายเดือน และเตือนงบ" detail="ตั้งค่าข้อความสรุปและเตือนเมื่อใช้เกินงบแยกได้ที่นี่" href="/app/notifications?from=reminders" />
        <SettingsRow title="เตือนบิลประจำ" detail="เลือกบิลที่จะเตือน ล่วงหน้า 3 วันและวันครบกำหนด 09:00 น." href="/app/settings/bills" />
      </div>

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
            disabled={!ready || (save.busy && !save.done)}
            onChange={(e) => edit(() => setEnabled(e.target.checked))}
            className="size-6 shrink-0 accent-[var(--green-700)]"
          />
        </label>

        <InputField
          label="เวลาเตือน"
          type="time"
          value={time}
          disabled={!ready || (save.busy && !save.done)}
          onChange={(e) => edit(() => setTime(e.target.value))}
          state={timeError ? "error" : "default"}
          helper={timeError ?? "เวลาประเทศไทย (UTC+7)"}
        />

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-primary">
            <span>หยุดเตือนชั่วคราว</span>
            <input
              type="checkbox"
              role="switch"
              checked={paused}
              disabled={!ready || (save.busy && !save.done)}
              onChange={(e) => edit(() => setPaused(e.target.checked))}
              className="size-6 shrink-0 accent-[var(--green-700)]"
            />
          </label>
          {paused ? (
            <InputField
              label="หยุดเตือนถึงวันที่"
              type="date"
              value={pausedUntil}
              disabled={!ready || (save.busy && !save.done)}
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

      <p className="text-xs leading-5 text-secondary">ต้องเพิ่มเพื่อน LINE OA พอใช้เพื่อรับการเตือน การตั้งค่านี้ใช้สำหรับเตือนรายการที่จด ไม่เปิดรับโฆษณา</p>

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

export { SettingsBillsView } from "./bills/bills-view";

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
  const bufferSave = useSubmit<{ summary: Summary }>();
  const [bufferText, setBufferText] = useState("");
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [bufferSaved, setBufferSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.summary().then(
      (s) => {
        if (cancelled) return;
        setBufferText(satangToInputString(s.emergencyBuffer));
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
    const parsed = parseEssentialsInput(essentialText);
    setEssentialError(parsed.ok ? null : parsed.message);
    if (!parsed.ok) return;
    const result = await save.submit(parsed.satang, () => api.setEssentials(essentialsFromDaily(parsed.satang)));
    if (result.ok) {
      setData({ state: "ok", summary: result.value.summary });
      setSavedNote(true);
    }
  }

  async function handleBufferSave() {
    if (data.state !== "ok") return;
    const parsed = parseBahtInput(bufferText, { allowZero: true });
    if (!parsed.ok) {
      setBufferError("ใส่เป็นตัวเลขบาท เช่น 500 หรือ 0 ถ้าไม่เก็บเงินเผื่อ");
      return;
    }
    setBufferError(null);
    const previous = data.summary.emergencyBuffer;
    const result = await bufferSave.submit({ amount: parsed.satang, previous }, () =>
      api.setBuffer({ amount: parsed.satang, previous }),
    );
    if (result.ok) {
      setData({ state: "ok", summary: result.value.summary });
      setBufferText(satangToInputString(result.value.summary.emergencyBuffer));
      setBufferSaved(true);
    }
  }

  const header = <AppHeader title="เงินที่กันไว้" back="/app/settings" tone="default" />;

  if (data.state === "loading") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
        {header}
        <LoadingSkeleton />
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
        <h2 className="text-base font-semibold text-primary">เป้าออมรอบนี้</h2>
        <p className="text-sm text-secondary">
          ตอนนี้กันไว้ <span className="font-semibold tabular-nums text-primary">{formatBaht(s.savings)} บาท</span>
        </p>
        <p className="text-xs leading-5 text-secondary">ดูยอดที่กันไว้ได้ การปรับเป้าออมในหน้านี้ยังไม่พร้อมใช้งาน</p>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">เงินเผื่อฉุกเฉิน</h2>
        <p className="text-sm text-secondary">
          เก็บไว้สำหรับเรื่องฉุกเฉิน · ตอนนี้{" "}
          <span className="font-semibold tabular-nums text-primary">{formatBaht(s.emergencyBuffer)} บาท</span>
        </p>
        <InputField
          label="เงินเผื่อใหม่ (บาท)"
          inputMode="decimal"
          placeholder="เช่น 500"
          value={bufferText}
          disabled={bufferSave.busy}
          onChange={(e) => {
            setBufferText(e.target.value);
            setBufferError(null);
            setBufferSaved(false);
            if (bufferSave.done || bufferSave.error) bufferSave.reset();
          }}
          state={bufferError ? "error" : bufferText ? "filled" : "default"}
          helper={bufferError ?? "เงินออมรวมเงินเผื่อต้องไม่เกินเงินที่มี · ไม่ได้ย้ายเงินจริง"}
        />
        {bufferSave.error ? (
          <Banner
            kind={isCode(bufferSave.error, "not_implemented") ? "info" : "error"}
            text={errorText(bufferSave.error, "บันทึกเงินเผื่อไม่สำเร็จ ลองใหม่อีกครั้ง")}
          />
        ) : null}
        {bufferSaved ? <Banner kind="info" text="บันทึกเงินเผื่อแล้ว" /> : null}
        <Button variant="secondary" busy={bufferSave.busy && !bufferSave.done} disabled={bufferSave.done} onClick={handleBufferSave}>
          บันทึกเงินเผื่อ
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <div>
          <h2 className="text-base font-semibold text-primary">ค่าใช้จ่ายจำเป็นต่อวัน</h2>
          <p className="text-xs text-secondary">
            เงินที่ต้องใช้ทุกวันแน่ ๆ ใส่เป็นยอดรวมได้เลย · ใช้คำนวณว่าของชิ้นหนึ่งซื้อได้ไม่เกินเท่าไหร่
          </p>
        </div>
        <InputField
          label="ยอดต่อวัน (บาท)"
          inputMode="decimal"
          placeholder="เช่น 70"
          value={essentialText}
          disabled={save.busy && !save.done}
          onChange={(e) => {
            setEssentialText(e.target.value);
            setEssentialError(null);
            setSavedNote(false);
            if (save.done || save.error) save.reset();
          }}
          state={essentialError ? "error" : essentialText ? "filled" : "default"}
          helper={essentialError ?? "รวมทุกอย่างที่ต้องจ่ายทุกวัน ถ้าไม่มีให้ใส่ 0"}
        />
      </section>

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
          <li>• รหัสผู้ใช้ LINE เพื่อเชื่อมแชตกับแผนของคุณ</li>
          <li>• บันทึกการแตะ การเลื่อนหน้า และหน้าที่เปิด ด้วย Microsoft Clarity เพื่อปรับปรุงแอป เริ่มเก็บหลังคุณกดยอมรับเท่านั้น</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-line bg-card p-4 text-sm">
        <h2 className="text-base font-semibold text-primary">สิ่งที่ไม่ทำ</h2>
        <ul className="flex flex-col gap-2 text-secondary">
          <li>• ไม่เชื่อมบัญชีธนาคาร และไม่ขอรหัสผ่านธนาคาร</li>
          <li>• ข้อความ ตัวเลข ยอดเงิน และสิ่งที่คุณกรอกถูกปิดบังทั้งหมดใน Clarity</li>
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
    stopClarity();
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
        <button
          type="button"
          className="flex min-h-[52px] w-full items-center justify-center rounded-pill bg-danger px-6 py-3 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
          onClick={() => {
            del.reset();
            setConfirmOpen(true);
          }}
        >
          ลบข้อมูลทั้งหมด
        </button>
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
