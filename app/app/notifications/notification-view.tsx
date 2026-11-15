"use client";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/client/use-api";
import type { NotificationPreferences } from "@/lib/reports/types";
export function NotificationView() {
  const api = useApi();
  const [value, setValue] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState(false),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .notificationPreferences()
      .then((v) => {
        if (active) {
          setValue(v);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api, attempt]);
  async function save() {
    if (!value || busy) return;
    setBusy(true);
    setSaved(false);
    setError(false);
    try {
      setValue(await api.saveNotificationPreferences(value));
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="สรุปและเตือนงบ" back="/app" tone="default" />
      <p className="text-sm text-secondary">
        ส่งเป็น Flex Card ผ่าน LINE OA พอใช้ ต้องเพิ่มเพื่อน OA และอนุญาตไว้ก่อน
        ค่าเริ่มต้นปิดทั้งหมด
      </p>
      {error ? (
        <>
          <Banner kind="error" text="โหลดหรือบันทึกการแจ้งเตือนไม่สำเร็จ" />
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            ลองใหม่
          </Button>
        </>
      ) : null}
      {!value ? (
        <p role="status" aria-busy="true">
          กำลังโหลด…
        </p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-card px-4">
            {(
              [
                ["daily", "สรุปรายวัน", "ยอดที่จดในวันนี้ ณ เวลาส่ง"],
                ["monthly", "สรุปรายเดือน", "ส่งวันที่ 1 สรุปเดือนก่อนหน้า"],
                [
                  "budget",
                  "เตือนงบวันนี้",
                  "เตือนเมื่อใช้เกินงบรายวัน สูงสุดวันละครั้ง ช่วง 08:00–22:00",
                ],
              ] as const
            ).map(([key, label, detail]) => (
              <label
                key={key}
                className="flex min-h-20 items-center justify-between gap-3 py-4"
              >
                <span>
                  <span className="block font-semibold text-primary">
                    {label}
                  </span>
                  <span className="text-xs text-secondary">{detail}</span>
                </span>
                <input
                  type="checkbox"
                  className="size-6 accent-[var(--green-700)]"
                  checked={value[key]}
                  disabled={busy}
                  onChange={(e) => {
                    setValue({ ...value, [key]: e.target.checked });
                    setSaved(false);
                  }}
                />
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            เวลาส่งสรุป (ประเทศไทย)
            <input
              type="time"
              className="min-h-12 rounded-sm border border-line-strong bg-card px-3"
              value={value.time}
              disabled={busy}
              onChange={(e) => {
                setValue({ ...value, time: e.target.value });
                setSaved(false);
              }}
            />
          </label>
          <Button busy={busy} onClick={save}>
            บันทึกการแจ้งเตือน
          </Button>
          {saved ? (
            <p role="status" className="text-sm text-ok">
              บันทึกแล้ว · การส่งจริงขึ้นอยู่กับระบบตั้งเวลาของเซิร์ฟเวอร์
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
