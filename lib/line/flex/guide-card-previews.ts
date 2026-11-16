import { buildGuideCard, visibleTextLength } from "./cards/guide-cards";
import { guideCardSpec } from "./guide-specs";
import { miniAppUrl } from "./format";
import { longTextSamples } from "./long-text-previews";
import type { FlexDemoScenario } from "./index";

// Dev preview only (batch C5N = "C5 ใหม่"): every long chat answer of batch C5 as the guide card the chat
// now sends (specs live in guide-specs.ts), to compare with the old text side by side.

export function buildNewLongTextScenarios(appOrigin?: string): FlexDemoScenario[] {
  const open = (path: string) => miniAppUrl(path, appOrigin);
  const out: FlexDemoScenario[] = [];
  longTextSamples().forEach((sample, i) => {
    const spec = guideCardSpec(sample.id.replace(/^guide-/, ""), open);
    if (!spec) return;
    const card = buildGuideCard(spec, appOrigin);
    const nowChars = visibleTextLength(card);
    card.quickReply = {
      items: [
        { type: "action", action: { type: "uri", label: "เปิดแอป", uri: open("/app") } },
        { type: "action", action: { type: "postback", label: "วิธีใช้", data: "guide:all", displayText: "ขอวิธีใช้" } },
      ],
    };
    out.push({
      id: `new-${sample.id}`,
      batch: "C5N",
      code: `N-${String(i + 1).padStart(2, "0")}`,
      title: `${sample.title} · ${nowChars} ตัวอักษร`,
      userPrompt: `${sample.userPrompt}  ·  ที่มา: ${sample.source}`,
      message: card,
      compareId: `long-${sample.id}`,
      notes: [
        `ข้อความเดิม ${sample.text.length} ตัวอักษร → การ์ดใหม่ ${nowChars} ตัวอักษร (นับเฉพาะข้อความที่เห็นบนการ์ด)`,
        ...spec.buttons.map((b) => `ปุ่ม "${b.action.label}": ${b.reason}`),
      ],
    });
  });
  return out;
}
