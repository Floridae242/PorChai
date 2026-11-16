"use client";

import Image from "next/image";
import { useState } from "react";
import {
  buildDemoScenarios,
  buildRichMenuSpec,
  decodePostback,
  type FlexAction,
  type FlexBox,
  type FlexBubble,
  type FlexButton,
  type FlexImage,
  type FlexNode,
  type FlexSeparator,
  type FlexText,
} from "@/lib/line/flex";

const BATCH_NAMES: Record<"C1" | "C2" | "C3" | "C4" | "C5", string> = {
  C1: "C1 · เดโมหลัก (จดข้าว + เตือน 12:30)",
  C2: "C2 · ถาม AI & ลองก่อนจ่าย",
  C3: "C3 · เริ่มใช้ & เมนูหลัก",
  C4: "C4 · สลิป OCR & ลิงก์โปร/แต้ม",
  C5: "C5 · ข้อความยาวจริงที่ถูกห่อเป็นการ์ด (ดูก่อนปรับ)",
};

const TEXT_SIZE_CLASS: Record<NonNullable<FlexText["size"]>, string> = {
  xxs: "text-[11px] leading-4",
  xs: "text-xs leading-4",
  sm: "text-sm leading-5",
  md: "text-base leading-6",
  lg: "text-lg leading-6",
  xl: "text-xl leading-7",
  xxl: "text-2xl leading-8",
  "3xl": "text-3xl leading-9",
};

const MARGIN_TOP_CLASS: Record<string, string> = {
  none: "mt-0",
  xs: "mt-1",
  sm: "mt-2",
  md: "mt-3",
  lg: "mt-4",
  xl: "mt-5",
};

const SPACING_CLASS: Record<string, string> = {
  none: "gap-0",
  xs: "gap-1.5",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
};

function toLocalImageSrc(url: string): string {
  const m = /\/mascot\/([a-zA-Z0-9_-]+\.png)$/.exec(url);
  return m ? `/mascot/${m[1]}` : url;
}

function FlexNodeRenderer({
  node,
  onAction,
}: {
  node: FlexNode;
  onAction: (action: FlexAction) => void;
}) {
  if (node.type === "separator") {
    const sep = node as FlexSeparator;
    return (
      <hr
        className={`border-t ${MARGIN_TOP_CLASS[sep.margin ?? "md"] ?? "mt-3"}`}
        style={{ borderColor: sep.color ?? "#E1E8D3" }}
      />
    );
  }

  if (node.type === "image") {
    const img = node as FlexImage;
    const sizePx = img.size === "xxs" ? 40 : img.size === "xs" ? 56 : 72;
    return (
      <Image
        unoptimized
        src={toLocalImageSrc(img.url)}
        alt=""
        width={sizePx}
        height={sizePx}
        className="shrink-0 object-contain"
      />
    );
  }

  if (node.type === "text") {
    const t = node as FlexText;
    const sizeCls = TEXT_SIZE_CLASS[t.size ?? "md"];
    const weightCls = t.weight === "bold" ? "font-bold" : "font-normal";
    const alignCls =
      t.align === "end"
        ? "text-right"
        : t.align === "center"
          ? "text-center"
          : "text-left";
    const isFixed = t.flex === 0;
    const wrapCls = t.wrap
      ? "whitespace-normal break-words min-w-0"
      : isFixed
        ? "whitespace-nowrap shrink-0"
        : "truncate min-w-0";
    const marginCls = t.margin ? MARGIN_TOP_CLASS[t.margin] ?? "" : "";

    return (
      <div
        className={`${sizeCls} ${weightCls} ${alignCls} ${wrapCls} ${marginCls}`}
        style={{
          color: t.color ?? "#12301B",
          flex: t.flex !== undefined ? t.flex : undefined,
        }}
      >
        {t.text}
      </div>
    );
  }

  if (node.type === "button") {
    const b = node as FlexButton;
    const isPrimary = b.style === "primary";
    const marginCls = b.margin ? MARGIN_TOP_CLASS[b.margin] ?? "" : "";
    return (
      <button
        type="button"
        onClick={() => onAction(b.action)}
        className={`min-w-0 rounded-lg px-2.5 py-2 text-xs font-semibold leading-tight whitespace-nowrap transition active:scale-[0.99] ${marginCls} ${
          b.flex !== undefined ? "flex-1" : "w-full"
        } ${
          isPrimary
            ? "text-white shadow-xs hover:opacity-95"
            : "bg-[#E8F3CF]/75 text-[#12301B] hover:bg-[#E8F3CF]"
        }`}
        style={{
          ...(isPrimary ? { backgroundColor: b.color ?? "#1F4D2B" } : {}),
          ...(b.flex !== undefined ? { flex: b.flex } : {}),
        }}
      >
        {b.action.label}
      </button>
    );
  }

  // Box — never mix shorthand `padding` with `paddingTop`/`paddingBottom`/`paddingLeft`/`paddingRight`
  const box = node as FlexBox;
  const isHorizontal = box.layout === "horizontal" || box.layout === "baseline";
  const dirCls = isHorizontal ? "flex flex-row" : "flex flex-col";
  const gapCls = box.spacing ? SPACING_CLASS[box.spacing] ?? "" : "";
  const marginCls = box.margin ? MARGIN_TOP_CLASS[box.margin] ?? "" : "";
  const alignCls =
    box.alignItems === "center"
      ? "items-center"
      : box.alignItems === "flex-end"
        ? "items-end"
        : box.alignItems === "flex-start"
          ? "items-start"
          : "";
  const justifyCls =
    box.justifyContent === "space-between"
      ? "justify-between"
      : box.justifyContent === "center"
        ? "justify-center"
        : box.justifyContent === "flex-end"
          ? "justify-end"
          : "";

  return (
    <div
      className={`${dirCls} ${gapCls} ${marginCls} ${alignCls} ${justifyCls}`}
      style={{
        backgroundColor: box.backgroundColor,
        borderRadius: box.cornerRadius,
        paddingTop: box.paddingTop ?? box.paddingAll,
        paddingBottom: box.paddingBottom ?? box.paddingAll,
        paddingLeft: box.paddingStart ?? box.paddingAll,
        paddingRight: box.paddingEnd ?? box.paddingAll,
        height: box.height,
        width: box.width,
        flex: box.flex !== undefined ? box.flex : undefined,
      }}
    >
      {box.contents.map((child, idx) => (
        <FlexNodeRenderer key={idx} node={child} onAction={onAction} />
      ))}
    </div>
  );
}

function FlexBubbleRenderer({
  bubble,
  onAction,
}: {
  bubble: FlexBubble;
  onAction: (action: FlexAction) => void;
}) {
  return (
    <div className="w-full max-w-[330px] overflow-hidden rounded-2xl border border-[#E1E8D3] bg-white shadow-sm">
      {bubble.header && (
        <FlexNodeRenderer node={bubble.header} onAction={onAction} />
      )}
      <FlexNodeRenderer node={bubble.body} onAction={onAction} />
      {bubble.footer && (
        <div className="border-t border-[#E1E8D3]/60">
          <FlexNodeRenderer node={bubble.footer} onAction={onAction} />
        </div>
      )}
    </div>
  );
}

const RICH_MENU_ROUTES: Partial<Record<string, string>> = {
  menu_record: "c14-howto",
  menu_try: "c6-try-shoes",
  menu_today: "c5-today-budget",
};

export function FlexPreviewClient() {
  const scenarios = buildDemoScenarios();
  const richMenu = buildRichMenuSpec();
  const [selectedId, setSelectedId] = useState<string>(scenarios[0]!.id);
  const [showRichMenu, setShowRichMenu] = useState<boolean>(false);
  const [lastActionLog, setLastActionLog] = useState<string | null>(null);
  const [copiedMode, setCopiedMode] = useState<"bubble" | "full" | null>(null);

  const current = scenarios.find((s) => s.id === selectedId) ?? scenarios[0]!;
  const batches = ["C1", "C2", "C3", "C4", "C5"] as const;
  const batchScenarios = scenarios.filter((s) => s.batch === current.batch);

  function select(id: string) {
    setSelectedId(id);
    setLastActionLog(null);
  }

  function handleAction(action: FlexAction) {
    if (action.type === "uri") {
      setLastActionLog(`เปิดลิงก์: ${action.uri}`);
      return;
    }
    const decoded = decodePostback(action.data);
    const nextScenarioId =
      decoded && (current.nextOnAction?.[decoded.action] ?? RICH_MENU_ROUTES[decoded.action]);
    if (nextScenarioId) {
      setSelectedId(nextScenarioId);
      setLastActionLog(`กดปุ่ม "${action.label}" → ส่ง postback "${action.data}" → ไปฉาก ${nextScenarioId}`);
    } else {
      setLastActionLog(
        `กดปุ่ม "${action.label}" → ส่ง postback "${action.data}" (ข้อความที่ผู้ใช้เห็น: "${action.displayText ?? "-"}")`,
      );
    }
  }

  async function copyJson(mode: "bubble" | "full") {
    const payload =
      mode === "bubble" && current.message.type === "flex" ? current.message.contents : current.message;
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedMode(mode);
    setTimeout(() => setCopiedMode(null), 2000);
  }

  const quickReplies = current.message.quickReply?.items ?? [];

  return (
    <div className="min-h-screen bg-[#F7F9F1] font-body text-[#12301B] [color-scheme:light]">
      <div className="mx-auto max-w-[1180px] px-4 py-6 md:px-8 md:py-10">
        {/* Header (same look as the other /dev previews) */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#4A5A48]">PORCHAI · DEV PREVIEW</p>
            <h1 className="font-display text-4xl leading-tight text-[#12301B] md:text-5xl">ตัวจำลองการ์ดแชต LINE</h1>
          </div>
          <a
            href="https://developers.line.biz/flex-simulator/"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[#3B7A2E] underline underline-offset-4"
          >
            เปิด LINE Flex Simulator ↗
          </a>
        </header>

        <p className="mb-6 rounded-2xl border border-[#F3E3A4] bg-[#FFF6D6] px-4 py-3 text-xs text-[#4A5A48]">
          ข้อมูลสมมติทั้งหมด · ปุ่มในพรีวิวไม่ส่งข้อความหรือบันทึกรายการจริง · ภาพใน LINE จริงอาจต่างเล็กน้อยตามอุปกรณ์
          · หน้านี้ปิดใน production
        </p>

        {/* Batch tabs + scenario chips */}
        <nav aria-label="กลุ่มฉาก" className="mb-3 flex flex-wrap gap-2">
          {batches.map((b) => {
            const active = current.batch === b;
            return (
              <button
                key={b}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const first = scenarios.find((s) => s.batch === b);
                  if (first) select(first.id);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-[#1F4D2B] bg-[#1F4D2B] text-white"
                    : "border-[#B5C2A4] bg-white text-[#12301B] hover:bg-[#F4F8E8]"
                }`}
              >
                {BATCH_NAMES[b]}
              </button>
            );
          })}
        </nav>
        <div aria-label="ฉาก" className="mb-8 flex flex-wrap gap-2">
          {batchScenarios.map((s) => {
            const active = s.id === current.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => select(s.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                  active
                    ? "border-[#7EC151] bg-[#E8F3CF] font-bold text-[#12301B]"
                    : "border-[#E1E8D3] bg-white text-[#4A5A48] hover:bg-[#F4F8E8]"
                }`}
              >
                <span className="mr-1.5 font-mono text-[10px] font-bold text-[#3B7A2E]">{s.code}</span>
                {s.title}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* LINE chat room */}
          <section aria-label="หน้าจอแชต">
            <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[28px] border border-[#E1E8D3] bg-white shadow-md">
              {/* LINE header */}
              <div className="flex items-center gap-3 border-b border-[#E1E8D3] bg-white px-4 py-3">
                <Image
                  unoptimized
                  src="/mascot/greeting.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-full bg-[#E8F3CF] object-contain p-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#12301B]">พอใช้</p>
                  <p className="truncate text-[11px] text-[#4A5A48]">เพื่อนช่วยคิด เรื่องใช้เงิน</p>
                </div>
                <span className="rounded bg-[#F4F8E8] px-2 py-0.5 font-mono text-[11px] font-bold text-[#3B7A2E]">
                  {current.code}
                </span>
              </div>

              {/* Messages: real padding on every side so cards never touch the edges */}
              <div key={current.id} className="min-h-[460px] space-y-4 bg-[#8CABD9] px-5 pb-6 pt-5">
                <p className="mx-auto w-fit rounded-full bg-black/15 px-3 py-0.5 text-[10px] text-white">
                  ตัวอย่างบทสนทนา
                </p>
                {current.userPrompt && (
                  <div className="flex justify-end pl-10">
                    <div className="max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[#85E249] px-3.5 py-2 text-sm text-[#12301B] shadow-sm">
                      {current.userPrompt}
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2.5">
                  <Image
                    unoptimized
                    src="/mascot/greeting.png"
                    alt=""
                    width={32}
                    height={32}
                    className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-white object-contain p-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-[11px] text-white/90">พอใช้</p>
                    {current.message.type === "flex" ? (
                      <FlexBubbleRenderer bubble={current.message.contents} onAction={handleAction} />
                    ) : (
                      <div className="max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-sm text-[#12301B] shadow-sm">
                        {current.message.text}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick replies */}
              {quickReplies.length > 0 && (
                <div className="flex flex-wrap gap-2 bg-[#8CABD9] px-5 pb-5 pt-0">
                  {quickReplies.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleAction(item.action)}
                      className="rounded-full border border-[#E1E8D3] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1F4D2B] shadow-sm hover:bg-[#F4F8E8]"
                    >
                      {item.action.type === "uri" ? "↗ " : ""}
                      {item.action.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Input bar + rich menu */}
              <div className="border-t border-[#E1E8D3] bg-[#F7F9F1]">
                <div className="flex items-center justify-between bg-white px-4 py-2 text-[11px] text-[#4A5A48]">
                  <span>พิมพ์ข้อความ…</span>
                  <button
                    type="button"
                    onClick={() => setShowRichMenu((v) => !v)}
                    className="font-semibold text-[#1F4D2B] hover:underline"
                  >
                    {showRichMenu ? "ซ่อนเมนูพอใช้ ▾" : "เปิดเมนูพอใช้ ▴"}
                  </button>
                </div>
                {showRichMenu && (
                  <div className="grid grid-cols-3 gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => handleAction(richMenu.areas[0]!.action)}
                      className="col-span-2 flex flex-col items-start justify-center rounded-xl border border-[#B2D959] bg-[#E8F3CF] p-3 text-left transition hover:bg-[#dcebb9]"
                    >
                      <span className="text-xs font-bold text-[#12301B]">จดรายรับ / จ่าย</span>
                      <span className="text-[10px] text-[#3B7A2E]">พิมพ์สั้น ๆ เช่น ข้าว 45 · รับ 500</span>
                    </button>
                    {[
                      { i: 1, t: "ลองก่อนจ่าย", s: "ถาม AI ได้" },
                      { i: 2, t: "วันนี้ใช้ได้", s: "เช็กงบวันนี้" },
                      { i: 3, t: "สิทธิพิเศษ", s: "โปร & แต้ม ↗" },
                      { i: 4, t: "เปิดแอป", s: "ดูแผนเต็ม ↗" },
                    ].map((m) => (
                      <button
                        key={m.i}
                        type="button"
                        onClick={() => handleAction(richMenu.areas[m.i]!.action)}
                        className="flex flex-col items-center justify-center rounded-xl border border-[#E1E8D3] bg-white p-2.5 text-center transition hover:bg-[#F4F8E8]"
                      >
                        <span className="text-xs font-bold text-[#12301B]">{m.t}</span>
                        <span className="text-[10px] text-[#4A5A48]">{m.s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Inspector */}
          <section aria-label="รายละเอียดฉาก" className="min-w-0 space-y-4">
            <div className="rounded-[20px] border border-[#E1E8D3] bg-white p-5 shadow-xs">
              <p className="text-xs font-semibold text-[#4A5A48]">ฉากที่เลือก</p>
              <h2 className="mt-1 text-xl font-bold text-[#12301B]">{current.title}</h2>
              {current.userPrompt && (
                <p className="mt-2 text-xs text-[#4A5A48]">ผู้ใช้พิมพ์ / ที่มา: {current.userPrompt}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {current.message.type === "flex" && (
                  <button
                    type="button"
                    onClick={() => copyJson("bubble")}
                    className="rounded-full bg-[#1F4D2B] px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    {copiedMode === "bubble" ? "คัดลอก Bubble JSON แล้ว" : "คัดลอก Bubble JSON (สำหรับ Simulator)"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyJson("full")}
                  className="rounded-full border border-[#B5C2A4] bg-white px-4 py-2 text-xs font-semibold text-[#12301B] hover:bg-[#F4F8E8]"
                >
                  {copiedMode === "full" ? "คัดลอกข้อความเต็มแล้ว" : "คัดลอกข้อความเต็ม (+quickReply)"}
                </button>
              </div>

              <p
                role="status"
                className="mt-4 rounded-xl bg-[#F4F8E8] px-3 py-2.5 text-xs text-[#4A5A48]"
              >
                {lastActionLog ?? "ลองกดปุ่มในการ์ด ปุ่มด่วน หรือเมนูพอใช้ เพื่อดูค่า postback และเปลี่ยนฉาก"}
              </p>

              {current.message.type === "flex" && (
                <p className="mt-3 rounded-xl bg-[#F4F8E8] px-3 py-2.5 text-xs text-[#12301B]">
                  <span className="font-bold">altText (แจ้งเตือนบนมือถือ):</span> {current.message.altText}
                </p>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-[#3B7A2E]">ดู JSON</summary>
                <pre className="mt-2 max-h-[420px] overflow-auto rounded-xl bg-[#12301B] p-3 font-mono text-[11px] text-[#E8F3CF]">
                  {JSON.stringify(
                    current.message.type === "flex" ? current.message.contents : current.message,
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
