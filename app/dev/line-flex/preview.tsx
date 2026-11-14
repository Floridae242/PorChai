"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import type { FlexBubble, FlexComponent, FlexMessage } from "@/lib/line/branded-flex";
import type { FlexExample } from "@/lib/line/flex-examples";
import type { QuickReplyAction } from "@/lib/line/reply";
import styles from "./preview.module.css";

const spacing: Record<string, number> = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};
const sizes: Record<string, number> = {
  xxs: 10,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
};
const length = (value?: string) =>
  value ? (spacing[value] ?? value) : undefined;

function Node({
  node,
  onAction,
}: {
  node: FlexComponent;
  onAction: (action: QuickReplyAction) => void;
}) {
  if (node.type === "separator")
    return (
      <hr style={{ marginTop: length(node.margin), borderColor: node.color }} />
    );
  if (node.type === "text")
    return (
      <p
        style={{
          color: node.color,
          fontSize: node.size ? (sizes[node.size] ?? node.size) : 14,
          fontWeight: node.weight === "bold" ? 700 : 400,
          flex: node.flex,
          textAlign: node.align,
          marginTop: length(node.margin),
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {node.text}
      </p>
    );
  if (node.type === "image")
    return (
      <Image
        src={node.url}
        alt=""
        width={300}
        height={200}
        unoptimized
        loading="lazy"
        style={{
          width: node.size === "full" ? "100%" : node.size,
          height: "auto",
          flexShrink: 0,
          aspectRatio: node.aspectRatio.replace(":", "/"),
          objectFit: "contain",
        }}
      />
    );
  if (node.type === "button")
    return (
      <button
        type="button"
        className={styles.flexButton}
        onClick={() => onAction(node.action)}
        style={{
          backgroundColor:
            node.style === "primary" ? (node.color ?? "#246B45") : "#EDF2E6",
          color: node.style === "primary" ? "white" : "#173E2B",
          marginTop: length(node.margin),
        }}
      >
        {node.action.label}
        <span aria-hidden="true">{node.action.type === "uri" ? "↗" : "→"}</span>
      </button>
    );
  const style: CSSProperties = {
    display: "flex",
    flexDirection: node.layout === "horizontal" ? "row" : "column",
    alignItems: node.layout === "horizontal" ? "center" : "stretch",
    gap: length(node.spacing),
    padding: length(node.paddingAll),
    backgroundColor: node.backgroundColor,
    borderRadius: length(node.cornerRadius),
    marginTop: length(node.margin),
    flex: node.flex,
    minWidth: 0,
  };
  return (
    <div style={style}>
      {node.contents.map((child, index) => (
        <Node key={index} node={child} onAction={onAction} />
      ))}
    </div>
  );
}

function Bubble({
  bubble,
  onAction,
}: {
  bubble: FlexBubble;
  onAction: (action: QuickReplyAction) => void;
}) {
  return (
    <article className={styles.bubble}>
      {bubble.header && <Node node={bubble.header} onAction={onAction} />}
      <div
        className={styles.bubbleBody}
        style={{ backgroundColor: bubble.body.backgroundColor }}
      >
        <Node node={bubble.body} onAction={onAction} />
      </div>
      {bubble.footer && <Node node={bubble.footer} onAction={onAction} />}
    </article>
  );
}

function Card({
  message,
  onAction,
}: {
  message: FlexMessage;
  onAction: (action: QuickReplyAction) => void;
}) {
  return message.contents.type === "carousel" ? (
    <div className={styles.carousel} aria-label="การ์ดต้อนรับ เลื่อนแนวนอนได้">
      {message.contents.contents.map((bubble, index) => (
        <Bubble key={index} bubble={bubble} onAction={onAction} />
      ))}
    </div>
  ) : (
    <Bubble bubble={message.contents} onAction={onAction} />
  );
}

export function FlexPreview({ examples }: { examples: FlexExample[] }) {
  const [selectedId, setSelectedId] = useState(examples[0].id);
  const [notice, setNotice] = useState("");
  const selected = examples.find((example) => example.id === selectedId)!;
  const contentsJson = JSON.stringify(selected.message.contents, null, 2);

  async function copyContents() {
    try {
      await navigator.clipboard.writeText(contentsJson);
      setNotice("คัดลอก contents JSON แล้ว นำไปวางใน Flex Simulator ได้เลย");
    } catch {
      setNotice("คัดลอกอัตโนมัติไม่ได้ เลือก JSON ด้านล่างแล้วคัดลอกเองได้ครับ");
    }
  }

  function downloadPayload() {
    const blob = new Blob(
      [JSON.stringify({ messages: [selected.message] }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `porchai-flex-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("ดาวน์โหลด payload ตัวอย่างแล้ว ไม่มี token หรือข้อมูลผู้ใช้จริง");
  }

  function previewAction(action: QuickReplyAction) {
    setNotice(
      action.type === "uri"
        ? `ลิงก์ที่จะเปิดใน LINE: ${action.uri}`
        : `ตัวอย่างปุ่ม “${action.label}” — พรีวิวนี้ไม่ส่งคำสั่ง ไม่บันทึกเงินจริง`,
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/miniapp" className={styles.brand}>
          พอใช้<span>PORCHAI</span>
        </Link>
        <span className={styles.tag}>FLEX MESSAGE LAB</span>
      </header>
      <div className={styles.heading}>
        <div>
          <p>การ์ดเล็ก ๆ ที่ช่วยให้จดง่ายขึ้น</p>
          <h1>พอใช้ ในแชต LINE</h1>
        </div>
        <a
          href="https://developers.line.biz/flex-simulator/"
          target="_blank"
          rel="noreferrer"
        >
          เปิด LINE Flex Simulator ↗
        </a>
      </div>
      <p className={styles.disclaimer}>
        ข้อมูลสมมติทั้งหมด · ปุ่มในพรีวิวไม่ส่งข้อความหรือบันทึกรายการ · ภาพจริงใน LINE
        อาจต่างเล็กน้อยตามอุปกรณ์
      </p>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="รูปแบบ Flex Message"
      >
        {examples.map((example, index) => (
          <button
            type="button"
            key={example.id}
            role="tab"
            tabIndex={selected.id === example.id ? 0 : -1}
            aria-selected={selected.id === example.id}
            aria-controls="flex-panel"
            id={`tab-${example.id}`}
            onClick={() => {
              setSelectedId(example.id);
              setNotice("");
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % examples.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + examples.length) % examples.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? examples.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setSelectedId(examples[next].id);
              setNotice("");
              document.getElementById(`tab-${examples[next].id}`)?.focus();
            }}
          >
            {example.label}
          </button>
        ))}
      </div>
      <div className={styles.layout}>
        <section
          id="flex-panel"
          role="tabpanel"
          aria-labelledby={`tab-${selected.id}`}
          className={styles.phone}
        >
          <div className={styles.chatHeader}>
            <Image src="/mascot/greeting.png" width={42} height={42} alt="" />
            <div>
              <strong>พอใช้</strong>
              <span>เพื่อนช่วยคิด เรื่องใช้เงิน</span>
            </div>
            <span aria-hidden="true">☰</span>
          </div>
          <div className={styles.conversation}>
            <p className={styles.day}>ตัวอย่างบทสนทนา</p>
            {selected.userText && (
              <div className={styles.user}>{selected.userText}</div>
            )}
            <div className={styles.botLabel}>
              <Image src="/mascot/greeting.png" width={30} height={30} alt="" />
              <span>พอใช้</span>
            </div>
            <Card
              key={selected.id}
              message={selected.message}
              onAction={previewAction}
            />
            {selected.message.quickReply && (
              <div className={styles.quickReply}>
                {selected.message.quickReply.items.map(({ action }, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => previewAction(action)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={styles.composer}>
            <span aria-hidden="true">＋</span>
            <span>พิมพ์รายการกับยอด เช่น ข้าว 45</span>
            <span aria-hidden="true">☺</span>
          </div>
        </section>
        <section className={styles.export} aria-labelledby="export-title">
          <p className={styles.eyebrow}>ใช้การ์ดชุดเดียวกับ webhook</p>
          <h2 id="export-title">{selected.label}</h2>
          <p>{selected.description}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => void copyContents()}>
              คัดลอก Flex JSON
            </button>
            <button type="button" onClick={downloadPayload}>
              ดาวน์โหลด payload ↓
            </button>
          </div>
          <output className={styles.notice} aria-live="polite">
            {notice || "ลองกดปุ่มในการ์ดเพื่อดูปลายทาง หรือคัดลอก JSON ไปทดสอบได้เลย"}
          </output>
          <details>
            <summary>ดู contents JSON</summary>
            <pre tabIndex={0}>{contentsJson}</pre>
          </details>
          <small>
            ไฟล์ดาวน์โหลดใช้รูปแบบ messages สำหรับ Messaging API ส่วนปุ่มคัดลอกใช้เฉพาะ
            contents สำหรับ Simulator. Postback ในตัวอย่างใช้ key ว่าง
            จึงยืนยันบันทึกเงินจริงไม่ได้แม้นำไปส่งทดสอบ.
          </small>
        </section>
      </div>
    </main>
  );
}
