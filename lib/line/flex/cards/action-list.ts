import { FLEX_COLORS as C, iconPngUrl, type PorchaiIcon } from "../format";
import type { FlexAction, FlexMessage, FlexNode } from "../types";

export interface ActionRow {
  title: string;
  detail?: string;
  value?: string;
  icon?: PorchaiIcon;
  action?: FlexAction;
}

/** One continuous list, with a full-row target for every item (including 4–10). */
export function buildActionList(input: {
  title: string;
  subtitle: string;
  icon: PorchaiIcon;
  rows: ActionRow[];
  actions?: FlexAction[];
}): FlexMessage {
  const rows: FlexNode[] = input.rows.flatMap((row, index): FlexNode[] => [
    ...(index ? [{ type: "separator" as const, color: C.line200 }] : []),
    {
      type: "box", layout: "horizontal", spacing: "sm", alignItems: "center",
      paddingTop: "12px", paddingBottom: "12px",
      ...(row.action ? { action: row.action } : {}),
      contents: [
        { type: "image", url: iconPngUrl(row.icon ?? input.icon), size: "xxs", aspectMode: "fit", flex: 0 },
        { type: "box", layout: "vertical", spacing: "xs", flex: row.value ? 4 : 1, contents: [
          { type: "text", text: row.title, size: "md", color: C.green900, weight: "bold", wrap: true },
          ...(row.detail ? [{ type: "text" as const, text: row.detail, size: "sm" as const, color: C.sage500, wrap: true }] : []),
        ] },
        ...(row.value ? [{ type: "text" as const, text: row.value, size: "sm" as const, weight: "bold" as const, color: C.green800, wrap: true, align: "end" as const, flex: 1 }] : []),
        ...(row.action ? [{ type: "text" as const, text: "›", size: "lg" as const, color: C.green800, flex: 0 }] : []),
      ],
    },
  ]);
  return {
    type: "flex",
    altText: `${input.title} · ${input.subtitle}`.slice(0, 400),
    contents: {
      type: "bubble", size: "mega",
      header: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "16px", paddingBottom: "0px", contents: [
        { type: "text", text: input.title, size: "lg", weight: "bold", color: C.green900, wrap: true },
        { type: "text", text: input.subtitle, size: "sm", color: C.sage500, wrap: true },
      ] },
      body: { type: "box", layout: "vertical", paddingAll: "16px", paddingTop: "0px", contents: rows },
      ...(input.actions?.length ? { footer: {
        type: "box" as const, layout: "horizontal" as const, spacing: "sm" as const, paddingAll: "12px", paddingTop: "0px",
        contents: input.actions.map((action, index) => ({ type: "button" as const, action, height: "sm" as const,
          style: index === 0 && action.type === "postback" && action.label === "ยืนยัน" ? "primary" as const : "link" as const,
          color: C.green800,
        })),
      } } : {}),
    },
  };
}
