"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/shell/app-header";
import { FlexBubblePreview } from "@/app/dev/line-flex/preview";
import { ONBOARDING_STEPS, onboardingHelp } from "@/lib/line/onboarding";
import type { FlexMessage } from "@/lib/line/branded-flex";
export function HelpView({ message }: { message: FlexMessage }) {
  const router = useRouter(),
    [detail, setDetail] = useState("");
  const bubbles =
    message.contents.type === "carousel"
      ? message.contents.contents
      : [message.contents];
  return (
    <main className="flex min-w-0 flex-col gap-4 py-2 font-body">
      <AppHeader title="วิธีใช้พอใช้" back="/app/settings" tone="default" />
      <p className="text-sm text-secondary">
        เลื่อนดูทีละเรื่อง หรือพิมพ์ “ขอวิธีใช้” ในแชต LINE ได้ทุกเมื่อ แม้กำลังจดรายการอยู่
      </p>
      <section
        aria-label="หัวข้อวิธีใช้ เลื่อนแนวนอนได้"
        className="flex min-w-0 gap-3 overflow-x-auto rounded-md bg-subtle p-3"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {bubbles.map((bubble, i) => (
          <div key={i} style={{ flex: "0 0 280px", scrollSnapAlign: "start" }}>
            <FlexBubblePreview
              bubble={bubble}
              onAction={(action) => {
                if (action.type === "postback")
                  setDetail(
                    onboardingHelp(action.data)?.text ??
                      "พิมพ์ ขอวิธีใช้ ใน LINE ได้เลยครับ",
                  );
                else {
                  const step = ONBOARDING_STEPS[i];
                  router.push(
                    step.id === "income"
                      ? `${step.path}?type=income`
                      : step.path,
                  );
                }
              }}
            />
          </div>
        ))}
      </section>
      {detail && (
        <section
          role="status"
          className="rounded-md border border-line bg-card p-4"
        >
          <h2 className="font-semibold text-primary">วิธีใช้งาน</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-secondary">
            {detail}
          </p>
        </section>
      )}
      <p className="text-xs text-secondary">
        น้องพอใช้เตรียมตัวอย่างให้ลองอ่านครับ ยอดบนการ์ดยังไม่ได้บันทึก ปุ่มวิธีใช้ไม่เปลี่ยนข้อมูลของคุณ
      </p>
    </main>
  );
}
