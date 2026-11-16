import { FLEX_COLORS, mascotPngUrl } from "../format";
import type { FlexAction, FlexBox, FlexMessage, FlexNode, FlexText, MascotPose } from "../types";

/**
 * Guide / help card: the same look as our other cards (mascot header, soft blocks, at most two buttons)
 * for what used to be a wall of text. Rules, so every card reads the same way:
 *  - a short lead, at most 4 labelled rows, one example the user can type, one small note
 *  - a button exists only for a reason: try something SAFE (read-only, sent as a message), open the place
 *    in the app where the user does it, or go back to the other topics. Anything that changes money is
 *    never a one-tap button.
 */
export interface GuideButton {
  action: FlexAction;
  /** Why this button is on the card (shown in the preview, not on the card). */
  reason: string;
}

export interface GuideCardSpec {
  pose: MascotPose;
  title: string; // ≤ ~20 characters
  subtitle?: string; // ≤ ~32 characters
  lead?: string; // one short sentence
  rows?: { label: string; text: string }[]; // ≤ 4
  example?: string; // what to type, as the user would write it
  note?: string; // one small line (amber): what is NOT done / a caution
  buttons: GuideButton[]; // ≤ 2, the first is the main one
}

const text = (
  value: string,
  props: Partial<FlexText> = {},
): FlexText => ({ type: "text", text: value, wrap: true, size: "xs", color: FLEX_COLORS.green900, ...props });

const block = (contents: FlexNode[], bg: string = FLEX_COLORS.lime50): FlexBox => ({
  type: "box",
  layout: "vertical",
  backgroundColor: bg,
  cornerRadius: "10px",
  paddingAll: "10px",
  spacing: "xs",
  contents,
});

export function buildGuideCard(spec: GuideCardSpec, appOrigin?: string): FlexMessage {
  const body: FlexNode[] = [];
  if (spec.lead) body.push(text(spec.lead, { size: "sm" }));
  for (const row of spec.rows ?? []) {
    body.push(block([text(row.label, { weight: "bold" }), text(row.text, { size: "xxs", color: FLEX_COLORS.sage500 })]));
  }
  if (spec.example) {
    body.push(
      block(
        [
          text("พิมพ์ได้เลย เช่น", { size: "xxs", color: FLEX_COLORS.sage500 }),
          text(spec.example, { size: "sm", weight: "bold", color: FLEX_COLORS.green800 }),
        ],
        FLEX_COLORS.lime100,
      ),
    );
  }
  if (spec.note) body.push(text(spec.note, { size: "xxs", color: FLEX_COLORS.sage500 }));

  const buttons = spec.buttons.slice(0, 2);
  const alt = [spec.title, spec.lead, ...(spec.rows ?? []).map((r) => `${r.label}: ${r.text}`)].filter(Boolean).join(" · ");

  return {
    type: "flex",
    altText: alt.length > 400 ? `${alt.slice(0, 399)}…` : alt,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: FLEX_COLORS.lime100,
        contents: [
          { type: "image", url: mascotPngUrl(spec.pose, appOrigin), size: "xxs", aspectRatio: "1:1", aspectMode: "fit" },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              text(spec.title, { size: "md", weight: "bold" }),
              ...(spec.subtitle ? [text(spec.subtitle, { size: "xxs", color: FLEX_COLORS.sage500 })] : []),
            ],
          },
        ],
      },
      body: { type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm", backgroundColor: FLEX_COLORS.white, contents: body },
      ...(buttons.length
        ? {
            footer: {
              type: "box" as const,
              layout: "vertical" as const,
              paddingAll: "12px",
              spacing: "sm" as const,
              backgroundColor: FLEX_COLORS.white,
              contents: buttons.map((b, i) => ({
                type: "button" as const,
                action: b.action,
                height: "sm" as const,
                style: i === 0 ? ("primary" as const) : ("secondary" as const),
                ...(i === 0 ? { color: FLEX_COLORS.green800 } : {}),
              })),
            },
          }
        : {}),
    },
  };
}

/** Characters a user actually reads on a card (text nodes only), for before/after comparisons. */
export function visibleTextLength(message: FlexMessage): number {
  let n = 0;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const o = node as { type?: string; text?: string; contents?: unknown[]; header?: unknown; body?: unknown; footer?: unknown };
    if (o.type === "text" && typeof o.text === "string") n += o.text.length;
    for (const k of ["header", "body", "footer"] as const) walk(o[k]);
    for (const c of o.contents ?? []) walk(c);
  };
  walk(message.contents);
  return n;
}
