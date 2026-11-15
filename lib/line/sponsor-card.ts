import { campaigns } from "@/lib/promotions/demo";
import type { FlexBubble, FlexComponent, FlexMessage } from "./branded-flex";

/** Read-only campaign fixtures. No merchant links, claim actions or redeemable codes. */
export function sponsorCarousel(): FlexMessage {
  const label = (text: string, size = "sm", color = "#173E2B", bold = false): FlexComponent => ({
    type: "text", text, size, color, wrap: true, ...(bold ? { weight: "bold" as const } : {}),
  });
  const contents: FlexBubble[] = campaigns.map(c => ({
    type: "bubble",
    size: "mega",
    header: {
      type: "box", layout: "vertical", paddingAll: "16px", spacing: "xs", backgroundColor: "#173E2B",
      contents: [label("โฆษณาตัวอย่าง", "xs", "#FFFFFF", true), label("ผู้สนับสนุนสมมติ", "xs", "#FFFFFF")],
    },
    body: {
      type: "box", layout: "vertical", paddingAll: "20px", spacing: "md", backgroundColor: "#FFFFFF",
      contents: [
        label(c.shop, "xs", "#627064"),
        label(c.title, "lg", "#173E2B", true),
        label(c.offer, "md", "#246B45", true),
        { type: "separator", color: "#DDE5DA" },
        label(c.terms, "sm", "#627064"),
      ],
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "16px", spacing: "xs", backgroundColor: "#F6F5E9",
      contents: [label("ใช้ซื้อจริงไม่ได้", "sm", "#9B332F", true), label("ไม่มีสิทธิ์หรือสินค้าแจกจริง · แสดงเพื่อสาธิตเท่านั้น", "xs", "#627064")],
    },
  }));
  return { type: "flex", altText: "โฆษณาตัวอย่างจากผู้สนับสนุนสมมติ ใช้ซื้อจริงไม่ได้", contents: { type: "carousel", contents } };
}
