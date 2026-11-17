"use client";
import { useEffect, useRef, useState } from "react";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/api-types";
import type { BillSchedule, NewBillSchedule } from "@/lib/bills/types";
import { monthDue } from "@/lib/bills/calendar";
import { thaiDate } from "@/lib/calc/time";
import { useApi } from "@/lib/client/use-api";
import { ApiError } from "@/lib/client/errors";
import { useSubmit } from "@/lib/client/use-submit";
import { formatBaht, parseBahtInput } from "@/lib/format/money";
import { AppHeader } from "@/components/shell/app-header";
import { Sheet } from "@/components/shell/sheet";
import { BillCalendar } from "@/components/ui/bill-calendar";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { InputField } from "@/components/ui/input-field";

export function SettingsBillsView() {
  const api = useApi(),
    router = useRouter(),
    routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const [today] = useState(() => thaiDate(new Date())),
    [month, setMonth] = useState(today.slice(0, 7)),
    [selected, setSelected] = useState(today);
  const [bills, setBills] = useState<Plan[] | null>(null),
    [schedules, setSchedules] = useState<BillSchedule[]>([]),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [addOpen, setAddOpen] = useState(false),
    [title, setTitle] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today),
    [repeat, setRepeat] = useState<"once" | "monthly">("monthly"),
    [notify, setNotify] = useState(false);
  const [preview, setPreview] = useState<NewBillSchedule | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [removing, setRemoving] = useState<Plan | BillSchedule | null>(null);
  const save = useSubmit<unknown>(),
    change = useSubmit<unknown>();
  useEffect(() => {
    let active = true;
    Promise.all([api.plans(), api.billSchedules()]).then(
      ([p, s]) => {
        if (active) {
          setBills(p.plans.filter((p) => p.kind === "bill"));
          setSchedules(s.schedules);
          setFailed(false);
        }
      },
      (error) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === "no_cycle")
          routerRef.current.replace("/app/setup/income");
        else if (error instanceof ApiError && error.code === "no_consent")
          routerRef.current.replace("/app/consent");
        else setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [api, attempt]);
  const counts: Record<string, number> = {};
  for (const bill of bills ?? [])
    if (bill.dueOn && bill.status !== "cancelled")
      counts[bill.dueOn] = (counts[bill.dueOn] ?? 0) + 1;
  // Preview future monthly dates even beyond the materialized planning horizon; these aren't extra obligations.
  const projections = schedules
    .filter((s) => s.enabled && s.repeat === "monthly")
    .map((s) => ({ s, date: monthDue(month, Number(s.startsOn.slice(-2))) }))
    .filter(
      ({ s, date }) =>
        date >= s.startsOn &&
        !(bills ?? []).some(
          (b) => b.billScheduleId === s.id && b.dueOn === date,
        ),
    );
  for (const p of projections) counts[p.date] = (counts[p.date] ?? 0) + 1;
  const selectedBills = (bills ?? []).filter(
      (b) => b.dueOn === selected && b.status !== "cancelled",
    ),
    undated = (bills ?? []).filter((b) => !b.dueOn && b.status !== "cancelled");
  function openAdd() {
    save.reset();
    setTitle("");
    setAmount("");
    setDate(selected < today ? today : selected);
    setRepeat("monthly");
    setNotify(false);
    setPreview(null);
    setMessage(null);
    setAddOpen(true);
  }
  function review() {
    const money = parseBahtInput(amount);
    if (
      !title.trim() ||
      title.trim().length > 80 ||
      !money.ok ||
      money.satang > 10_000_000 ||
      date < today
    ) {
      setMessage("ใส่ชื่อบิล ยอดไม่เกิน 100,000 บาท และเลือกวันตั้งแต่วันนี้ครับ");
      return;
    }
    setMessage(null);
    setPreview({
      title: title.trim(),
      amount: money.satang,
      startsOn: date,
      repeat,
      notify,
    });
  }
  async function create() {
    if (!preview) return;
    const result = await save.submit(preview, (key) =>
      api.createBillSchedule(preview, key),
    );
    if (result.ok) {
      setAddOpen(false);
      setPreview(null);
      setMessage("เพิ่มบิลแล้ว ยังไม่ได้บันทึกเป็นรายจ่าย");
      setAttempt((n) => n + 1);
    }
  }
  async function remove() {
    if (!removing) return;
    const result = await change.submit(removing.id, () =>
      "startsOn" in removing
        ? api.updateBillSchedule(removing.id, { stop: true })
        : api.planAction(removing.id, "cancel"),
    );
    if (result.ok) {
      setRemoving(null);
      setMessage("หยุด/ยกเลิกบิลแล้ว รายการที่จ่ายไปแล้วไม่เปลี่ยน");
      setAttempt((n) => n + 1);
    }
  }
  async function toggle(s: BillSchedule) {
    const result = await change.submit({ id: s.id, notify: !s.notify }, () =>
      api.updateBillSchedule(s.id, { notify: !s.notify }),
    );
    if (result.ok) {
      setMessage(
        s.notify
          ? "ปิดเตือนบิลแล้ว"
          : "เปิดเตือนล่วงหน้า 3 วัน และวันครบกำหนด 09:00 น. แล้ว",
      );
      setAttempt((n) => n + 1);
    }
  }
  const error = save.error ?? change.error;
  function row(b: Plan) {
    return (
      <li key={b.id} className="flex flex-col gap-2 border-b border-line py-3">
        <div className="flex justify-between gap-3">
          <strong className="break-words text-primary">{b.title}</strong>
          <span className="shrink-0 tabular-nums">
            {formatBaht(b.amount)} บาท
          </span>
        </div>
        <p className="text-xs text-secondary">
          {b.status === "paid"
            ? "จ่ายแล้ว ✓"
            : b.status === "postponed"
              ? "เลื่อนไว้"
              : b.status === "separate"
                ? "จ่ายแยก"
                : b.heldThisCycle
                  ? "ยังไม่จ่าย · กันเงินในรอบนี้"
                  : "ยังไม่จ่าย · ไม่กันเงินในรอบนี้"}
        </p>
        <div className="flex gap-3">
          <Link
            href="/app/plan?tab=list"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-link"
          >
            ดูบิล / จ่ายแล้ว
          </Link>
          {["reserved", "postponed"].includes(b.status) && (
            <button
              type="button"
              disabled={change.busy}
              aria-label={`ลบ ${b.title}`}
              onClick={() => {
                change.reset();
                setRemoving(b);
              }}
              className="min-h-11 text-sm text-danger"
            >
              ยกเลิกบิลนี้
            </button>
          )}
        </div>
      </li>
    );
  }
  return (
    <main className="flex min-w-0 flex-col gap-4 py-2 font-body">
      <AppHeader title="บิลประจำ" back="/app/settings" tone="default" />
      <p className="text-sm text-secondary">
        เลือกวันครบกำหนดบนปฏิทิน ตั้งบิลครั้งเดียวหรือทุกเดือน แล้วเปิดเตือนผ่าน LINE ได้
      </p>
      {failed ? (
        <>
          <Banner
            kind="error"
            text="โหลดข้อมูลไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่อีกครั้ง"
          />
          <Button onClick={() => setAttempt((n) => n + 1)}>ลองใหม่</Button>
        </>
      ) : bills === null ? (
        <LoadingSkeleton label="กำลังโหลดบิล…" />
      ) : (
        <>
          <BillCalendar
            month={month}
            today={today}
            selected={selected}
            counts={counts}
            onMonth={(m) => {
              setMonth(m);
              setSelected(`${m}-01`);
            }}
            onSelect={(d) => {
              setSelected(d);
              setMonth(d.slice(0, 7));
            }}
          />
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-semibold text-primary">บิลวันที่ {selected}</h2>
            {!selectedBills.length &&
              !projections.some((p) => p.date === selected) && (
                <p className="mt-2 text-sm text-secondary">วันนี้ยังไม่มีบิลที่ตั้งไว้</p>
              )}
            <ul>
              {selectedBills.map(row)}
              {projections
                .filter((p) => p.date === selected)
                .map(({ s }) => (
                  <li key={s.id} className="py-3 text-sm text-secondary">
                    {s.title} · {formatBaht(s.amount)} บาท · รอบรายเดือนที่จะถึง
                    ยังไม่ใช่รายการจ่าย
                  </li>
                ))}
            </ul>
            <Button variant="secondary" block onClick={openAdd}>
              + เพิ่มบิล
            </Button>
          </section>
          {undated.length > 0 && (
            <section className="rounded-md border border-line bg-card p-4">
              <h2 className="font-semibold">บิลเดิมที่ยังไม่กำหนดวัน</h2>
              <ul>{undated.map(row)}</ul>
              <p className="mt-2 text-xs text-secondary">
                บิลเดิมยังไม่เตือนตามวัน หากต้องการตั้งวันใหม่
                ให้ยกเลิกบิลที่ยังไม่จ่ายก่อนเพิ่มใหม่เพื่อไม่กันเงินซ้ำ
              </p>
            </section>
          )}
          {schedules.some((s) => s.enabled) && (
            <section className="rounded-md border border-line bg-card p-4">
              <h2 className="font-semibold">ตารางบิลของฉัน</h2>
              <ul className="divide-y divide-line">
                {schedules
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <li key={s.id} className="py-3">
                      <p className="font-medium">
                        {s.title} · {formatBaht(s.amount)} บาท
                      </p>
                      <p className="mt-1 text-xs text-secondary">
                        {s.repeat === "monthly"
                          ? `ทุกเดือน วันที่ ${Number(s.startsOn.slice(-2))} (เดือนสั้นใช้วันสุดท้าย)`
                          : `ครั้งเดียว ${s.startsOn}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <button
                          type="button"
                          aria-pressed={s.notify}
                          disabled={change.busy}
                          onClick={() => toggle(s)}
                          className="min-h-11 text-sm text-link"
                        >
                          {s.notify ? "ปิดเตือน LINE" : "เปิดเตือน LINE"} {s.title}
                        </button>
                        <button
                          type="button"
                          disabled={change.busy}
                          onClick={() => {
                            change.reset();
                            setRemoving(s);
                          }}
                          className="min-h-11 text-sm text-danger"
                        >
                          หยุดบิล {s.title}
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-xs text-secondary">
                เตือนล่วงหน้า 3 วัน และวันครบกำหนด 09:00 น. ตามเวลาไทย
                เฉพาะบิลที่ยังไม่จ่าย ต้องเพิ่มเพื่อน OA และเปิดรับข้อความ
              </p>
            </section>
          )}
        </>
      )}
      {message && (
        <p role="status" className="rounded-md bg-subtle p-3 text-sm">
          {message}
        </p>
      )}
      {!!error && (
        <Banner
          kind="error"
          text={
            error instanceof ApiError ? error.message : "บันทึกไม่สำเร็จ ลองใหม่ครับ"
          }
        />
      )}
      <Sheet
        open={addOpen}
        onClose={() => {
          if (!save.busy) setAddOpen(false);
        }}
        title={preview ? "ยืนยันบิล" : "เพิ่มบิล"}
      >
        {preview ? (
          <div className="space-y-4">
            <p>
              {preview.title} · {formatBaht(preview.amount)} บาท
            </p>
            <p>
              ครบกำหนด {preview.startsOn} ·{" "}
              {preview.repeat === "monthly" ? "ทุกเดือน" : "ครั้งเดียว"}
            </p>
            <p className="text-sm text-secondary">
              {preview.notify
                ? "เตือน LINE ล่วงหน้า 3 วัน และวันครบกำหนด เวลา 09:00 น."
                : "ไม่ส่งเตือน LINE"}{" "}
              การตั้งบิลกันเงินตามรอบ แต่ยังไม่ลงรายจ่าย
            </p>
            <Button block busy={save.busy} onClick={create}>
              ยืนยันเพิ่มบิล
            </Button>
            <Button
              variant="ghost"
              block
              disabled={save.busy}
              onClick={() => setPreview(null)}
            >
              กลับไปแก้
            </Button>
            {!!save.error && (
              <Banner kind="error" text="เพิ่มบิลไม่สำเร็จ ลองใหม่ได้ครับ" />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <InputField
              label="ชื่อบิล"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
            />
            <InputField
              label="จำนวนเงิน (บาท)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-sm font-semibold">วันครบกำหนด {date}</p>
            <BillCalendar
              month={date.slice(0, 7)}
              selected={date}
              today={today}
              onMonth={(m) => setDate(`${m}-01`)}
              onSelect={setDate}
            />
            <label className="flex flex-col gap-2 text-sm">
              รอบบิล
              <select
                className="min-h-12 rounded-sm border border-line px-3"
                value={repeat}
                onChange={(e) =>
                  setRepeat(e.target.value as "once" | "monthly")
                }
              >
                <option value="monthly">ทุกเดือน</option>
                <option value="once">ครั้งเดียว</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              เตือนผ่าน LINE ล่วงหน้า 3 วัน + วันครบกำหนด 09:00
            </label>
            {message && (
              <p role="alert" className="text-sm text-danger">
                {message}
              </p>
            )}
            <Button block onClick={review}>
              ตรวจบิลก่อนบันทึก
            </Button>
            <Button variant="ghost" block onClick={() => setAddOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        )}
      </Sheet>
      <Sheet
        open={!!removing}
        onClose={() => {
          if (!change.busy) setRemoving(null);
        }}
        title="ยืนยันยกเลิกบิล"
      >
        <p className="mb-4 text-sm">
          {removing?.title} ·{" "}
          {removing && "startsOn" in removing
            ? "หยุดการสร้างรอบถัดไปและยกเลิกบิลตั้งแต่วันนี้ที่ยังไม่จ่าย รายการย้อนหลังและที่จ่ายแล้วไม่เปลี่ยน"
            : "ยกเลิกเฉพาะบิลนี้ ไม่หยุดรอบรายเดือนถัดไป"}
        </p>
        <Button block busy={change.busy} onClick={remove}>
          ลบบิล
        </Button>
        <Button
          variant="ghost"
          block
          disabled={change.busy}
          onClick={() => setRemoving(null)}
        >
          เก็บบิลไว้
        </Button>
        {!!change.error && (
          <Banner kind="error" text="ยกเลิกไม่สำเร็จ ลองใหม่ครับ" />
        )}
      </Sheet>
    </main>
  );
}
