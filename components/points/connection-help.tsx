"use client";
import { useEffect,useRef,useState } from "react";
import { useApi } from "@/lib/client/use-api";
import type { PointsConnection } from "@/lib/support/points-connection";
import {DATA_CHANGED} from "@/lib/client/data-events";
export function PointsConnectionHelp() {
  const epoch=useRef(0);
  const api = useApi(),
    [data, setData] = useState<PointsConnection | null>(null),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  async function check() {
    const request=++epoch.current;
    setBusy(true);
    setFailed(false);
    try {
      const result=await api.pointsConnection();if(request===epoch.current)setData(result);
    } catch {
      if(request===epoch.current)setFailed(true);
    } finally {
      if(request===epoch.current)setBusy(false);
    }
  }
  useEffect(()=>{const clear=()=>{epoch.current++;setData(null);setBusy(false);};const changed=(event:Event)=>{if((event as CustomEvent).detail?.api===api)clear();};window.addEventListener(DATA_CHANGED,changed);window.addEventListener("focus",clear);return()=>{epoch.current++;window.removeEventListener(DATA_CHANGED,changed);window.removeEventListener("focus",clear);};},[api]);
  return (
    <section className="rounded-md border border-line bg-card p-4">
      <button
        type="button"
        disabled={busy}
        onClick={check}
        className="min-h-11 text-sm font-semibold text-link"
      >
        {busy ? "กำลังตรวจแต้ม…" : "แต้มไม่ตรงกับแชต? ตรวจการเชื่อมต่อ"}
      </button>
      {failed && (
        <p role="status" className="text-sm text-danger">
          ยังตรวจไม่ได้ ลองใหม่อีกครั้ง
        </p>
      )}
      {data && (
        <div role="status" className="mt-2 space-y-2 text-sm text-secondary">
          <p>ยอดจากเซิร์ฟเวอร์ขณะตรวจ {data.balance} แต้ม</p>
          <p>
            รหัสบัญชี <code className="break-all">{data.accountCode}</code>
          </p>
          <p>
            รหัสระบบ <code>{data.systemCode}</code> · เวอร์ชัน {data.release}
          </p>
          <p className="text-xs leading-5">
            พิมพ์ “ตรวจแต้ม” ในแชต รหัสบัญชีและรหัสระบบควรตรงกัน
            หากไม่ตรงให้ส่งเฉพาะรหัสเหล่านี้ให้ทีมช่วยตรวจครับ
          </p>
        </div>
      )}
    </section>
  );
}
