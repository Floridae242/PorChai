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

const BATCH_NAMES: Record<"C1" | "C2" | "C3" | "C4", string> = {
  C1: "C1 · เดโมหลัก (จดข้าว + เตือน 12:30)",
  C2: "C2 · ถาม AI & ลองก่อนจ่าย",
  C3: "C3 · เริ่มใช้ & เมนูหลัก",
  C4: "C4 · สลิป OCR & ลิงก์โปร/แต้ม",
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
  const [selectedId, setSelectedId] = useState<string>(
    scenarios[0]!.id,
  );
  const [showRichMenu, setShowRichMenu] = useState<boolean>(true);
  const [lastActionLog, setLastActionLog] = useState<string | null>(null);
  const [copiedMode, setCopiedMode] = useState<"bubble" | "full" | null>(null);

  const current =
    scenarios.find((s) => s.id === selectedId) ?? scenarios[0]!;

  function handleAction(action: FlexAction) {
    if (action.type === "uri") {
      setLastActionLog(`🔗 เปิดลิงก์ URI: ${action.uri}`);
      return;
    }
    const decoded = decodePostback(action.data);
    const nextScenarioId =
      decoded &&
      (current.nextOnAction?.[decoded.action] ??
        RICH_MENU_ROUTES[decoded.action]);
    if (nextScenarioId) {
      setSelectedId(nextScenarioId);
      setLastActionLog(
        `✅ กดปุ่ม "${action.label}" → ส่ง postback "${action.data}" → เปลี่ยนไปฉาก ${nextScenarioId}`,
      );
    } else {
      setLastActionLog(
        `📤 กดปุ่ม "${action.label}" → ส่ง postback "${action.data}" (displayText: "${action.displayText ?? "-"}")`,
      );
    }
  }

  async function copyJson(mode: "bubble" | "full") {
    const payload =
      mode === "bubble" && current.message.type === "flex"
        ? current.message.contents
        : current.message;
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedMode(mode);
    setTimeout(() => setCopiedMode(null), 2000);
  }

  const batches = ["C1", "C2", "C3", "C4"] as const;

  return (
    <div className="min-h-screen bg-[#F7F9F1] p-4 md:p-6 text-[#12301B]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E1E8D3] bg-white p-4 shadow-xs">
          <div>
            <h1 className="text-xl font-bold text-[#12301B]">
              💬 ตัวจำลองการ์ดแชต LINE (Flex Message Preview)
            </h1>
            <p className="text-xs text-[#4A5A48]">
              วิธีที่ 1: กดเลือกฉากและทดลองกดปุ่มในหน้าจำลองด้านล่าง · วิธีที่ 2:
              กดปุ่ม &ldquo;คัดลอก Bubble JSON&rdquo; ด้านขวาเพื่อนำไปวางใน LINE
              Flex Simulator
            </p>
          </div>
          <a
            href="https://developers.line.biz/flex-simulator/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[#1F4D2B] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            เปิด LINE Flex Simulator ↗
          </a>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left column: Scenario selector (3 cols) */}
          <aside className="space-y-3 lg:col-span-3">
            {batches.map((b) => {
              const list = scenarios.filter((s) => s.batch === b);
              return (
                <div
                  key={b}
                  className="rounded-2xl border border-[#E1E8D3] bg-white p-3"
                >
                  <h2 className="mb-2 px-1 text-xs font-bold text-[#3B7A2E]">
                    {BATCH_NAMES[b]}
                  </h2>
                  <div className="space-y-1">
                    {list.map((s) => {
                      const active = s.id === current.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(s.id);
                            setLastActionLog(null);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                            active
                              ? "bg-[#E8F3CF] font-bold text-[#12301B]"
                              : "hover:bg-[#F4F8E8] text-[#4A5A48]"
                          }`}
                        >
                          <span className="truncate">
                            <span className="mr-1.5 inline-block rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1F4D2B]">
                              {s.code}
                            </span>
                            {s.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </aside>

          {/* Center column: Simulated LINE Chat Room (5 cols for realistic phone width) */}
          <section className="lg:col-span-5">
            <div className="mx-auto max-w-[400px] flex flex-col overflow-hidden rounded-3xl border-2 border-[#B5C2A4] bg-[#8CABD9] shadow-md">
              {/* Simulated LINE Top Bar */}
              <div className="flex items-center justify-between bg-[#2A364B] px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#7EC151]" />
                  <span className="text-sm font-bold">พอใช้ (PorChai OA)</span>
                </div>
                <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px]">
                  {current.code}
                </span>
              </div>

              {/* Chat messages area — key={current.id} mounts fresh tree per scenario */}
              <div
                key={current.id}
                className="min-h-[420px] flex-1 space-y-4 p-3.5"
              >
                {current.userPrompt && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-xs bg-[#85E249] px-3.5 py-2 text-sm text-[#12301B] shadow-xs">
                      {current.userPrompt}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <Image
                    unoptimized
                    src="/mascot/greeting.png"
                    alt=""
                    width={32}
                    height={32}
                    className="mt-1 h-8 w-8 shrink-0 rounded-full bg-white p-0.5 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    {current.message.type === "flex" ? (
                      <FlexBubbleRenderer
                        bubble={current.message.contents}
                        onAction={handleAction}
                      />
                    ) : (
                      <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tl-xs bg-white px-3.5 py-2.5 text-sm text-[#12301B] shadow-xs">
                        {current.message.text}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Reply Pill Bar */}
              {current.message.quickReply &&
                current.message.quickReply.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-white/20 bg-[#7A99C7] px-3 py-2.5">
                    {current.message.quickReply.items.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleAction(item.action)}
                        className="rounded-full border border-[#E1E8D3] bg-white px-3 py-1 text-xs font-semibold text-[#1F4D2B] shadow-xs hover:bg-[#F4F8E8]"
                      >
                        {item.action.type === "uri" ? "↗ " : "🔘 "}
                        {item.action.label}
                      </button>
                    ))}
                  </div>
                )}

              {/* Simulated Rich Menu (5-button layout matching Figma) */}
              <div className="border-t border-[#E1E8D3] bg-[#F7F9F1]">
                <div className="flex items-center justify-between border-b border-[#E1E8D3] bg-white px-3 py-1.5 text-[11px] text-[#4A5A48]">
                  <span>พิมพ์ข้อความ... (แชตปกติเป็นลำดับแรก)</span>
                  <button
                    type="button"
                    onClick={() => setShowRichMenu((v) => !v)}
                    className="font-semibold text-[#1F4D2B] hover:underline"
                  >
                    {showRichMenu ? "ซ่อนเมนูพอใช้ ▾" : "เปิดเมนูพอใช้ ▴"}
                  </button>
                </div>
                {showRichMenu && (
                  <div className="grid grid-cols-3 gap-1.5 p-2">
                    {/* Top-left (2 cols): จดรายรับ/จ่าย */}
                    <button
                      type="button"
                      onClick={() => handleAction(richMenu.areas[0]!.action)}
                      className="col-span-2 flex flex-col items-start justify-center rounded-xl border border-[#B2D959] bg-[#E8F3CF] p-2.5 text-left transition hover:bg-[#dcebb9]"
                    >
                      <span className="text-xs font-bold text-[#12301B]">
                        ✏️ จดรายรับ / จ่าย
                      </span>
                      <span className="text-[10px] text-[#3B7A2E]">
                        พิมพ์สั้น ๆ เช่น ข้าว 45 · รับ 500
                      </span>
                    </button>
                    {/* Top-right (1 col): ลองก่อนจ่าย */}
                    <button
                      type="button"
                      onClick={() => handleAction(richMenu.areas[1]!.action)}
                      className="col-span-1 flex flex-col items-center justify-center rounded-xl border border-[#E1E8D3] bg-white p-2 text-center transition hover:bg-[#F4F8E8]"
                    >
                      <span className="text-xs font-bold text-[#12301B]">
                        🤔 ลองก่อนจ่าย
                      </span>
                      <span className="text-[10px] text-[#4A5A48]">
                        ถาม AI ได้
                      </span>
                    </button>
                    {/* Bottom-left: วันนี้ใช้ได้ */}
                    <button
                      type="button"
                      onClick={() => handleAction(richMenu.areas[2]!.action)}
                      className="flex flex-col items-center justify-center rounded-xl border border-[#E1E8D3] bg-white p-2 text-center transition hover:bg-[#F4F8E8]"
                    >
                      <span className="text-xs font-bold text-[#12301B]">
                        💰 วันนี้ใช้ได้
                      </span>
                      <span className="text-[10px] text-[#4A5A48]">
                        เช็กงบวันนี้
                      </span>
                    </button>
                    {/* Bottom-center: สิทธิพิเศษ & แต้ม */}
                    <button
                      type="button"
                      onClick={() => handleAction(richMenu.areas[3]!.action)}
                      className="flex flex-col items-center justify-center rounded-xl border border-[#E1E8D3] bg-white p-2 text-center transition hover:bg-[#F4F8E8]"
                    >
                      <span className="text-xs font-bold text-[#12301B]">
                        🎁 สิทธิพิเศษ
                      </span>
                      <span className="text-[10px] text-[#4A5A48]">
                        โปร & แต้ม ↗
                      </span>
                    </button>
                    {/* Bottom-right: เปิดแอป */}
                    <button
                      type="button"
                      onClick={() => handleAction(richMenu.areas[4]!.action)}
                      className="flex flex-col items-center justify-center rounded-xl border border-[#E1E8D3] bg-white p-2 text-center transition hover:bg-[#F4F8E8]"
                    >
                      <span className="text-xs font-bold text-[#12301B]">
                        📱 เปิดแอป
                      </span>
                      <span className="text-[10px] text-[#4A5A48]">
                        ดูแผนเต็ม ↗
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Action feedback log */}
              <div className="bg-[#1F2937] px-3.5 py-2.5 text-xs text-white">
                {lastActionLog ? (
                  <div>{lastActionLog}</div>
                ) : (
                  <div className="text-gray-300">
                    💡 ลองคลิกปุ่มในการ์ด ปุ่มด่วน หรือเมนูพอใช้ด้านล่างเพื่อทดสอบค่า
                    postback และการเปลี่ยนฉาก
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right column: Method 2 (LINE Flex Simulator JSON) (4 cols) */}
          <section className="space-y-4 lg:col-span-4">
            <div className="rounded-2xl border border-[#E1E8D3] bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#12301B]">
                  วิธีที่ 2: นำไปวางใน LINE Flex Simulator
                </h2>
              </div>
              <p className="mb-3 text-xs text-[#4A5A48]">
                ในเว็บ LINE Flex Simulator ให้กดปุ่ม{" "}
                <strong>&ldquo;คัดลอก Bubble JSON&rdquo;</strong>{" "}
                ด้านล่างแล้วกดวาง (Paste) ในช่อง JSON ของ Simulator ได้ทันที
              </p>
              <div className="flex flex-wrap gap-2">
                {current.message.type === "flex" && (
                  <button
                    type="button"
                    onClick={() => copyJson("bubble")}
                    className="rounded-xl bg-[#7EC151] px-3.5 py-2 text-xs font-bold text-[#12301B] hover:bg-[#6AAE3E]"
                  >
                    {copiedMode === "bubble"
                      ? "✓ คัดลอก Bubble JSON แล้ว!"
                      : "📋 คัดลอก Bubble JSON (สำหรับ Simulator)"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyJson("full")}
                  className="rounded-xl border border-[#B5C2A4] bg-white px-3 py-2 text-xs font-semibold text-[#12301B] hover:bg-[#F4F8E8]"
                >
                  {copiedMode === "full"
                    ? "✓ คัดลอก Message เต็มแล้ว!"
                    : "คัดลอก Message เต็ม (+quickReply)"}
                </button>
              </div>

              {current.message.type === "flex" && (
                <div className="mt-3 rounded-lg bg-[#F4F8E8] p-2.5 text-xs text-[#12301B]">
                  <span className="font-bold">altText (แจ้งเตือนบนมือถือ):</span>{" "}
                  {current.message.altText}
                </div>
              )}

              <pre className="mt-3 max-h-[380px] overflow-auto rounded-xl bg-[#12301B] p-3 font-mono text-[11px] text-[#E8F3CF]">
                {JSON.stringify(
                  current.message.type === "flex"
                    ? current.message.contents
                    : current.message,
                  null,
                  2,
                )}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
