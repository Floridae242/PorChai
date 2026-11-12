import { formatBaht } from "@/lib/format/money";
import { appUrl } from "@/lib/liff/config";
import type { MascotPose, Satang, UserCategory } from "./types";

// Re-export formatBaht so card builders never write their own formatter.
export { formatBaht };

/** Format satang with " บาท" suffix — never uses the "฿" symbol. */
export function bahtText(satang: Satang): string {
  return `${formatBaht(satang)} บาท`;
}

export const CATEGORY_LABELS: Record<UserCategory | "bills" | "uncategorized", string> = {
  food: "อาหาร",
  transport: "เดินทาง",
  supplies: "ของใช้",
  other: "อื่น ๆ",
  bills: "บิล",
  uncategorized: "ยังไม่ระบุหมวด",
};

export function categoryLabel(category: UserCategory | "bills" | "uncategorized"): string {
  return CATEGORY_LABELS[category] ?? "ยังไม่ระบุหมวด";
}

const DEFAULT_PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL || "https://porchai.vercel.app";

/**
 * LINE Flex requires HTTPS URLs ending in .png or .jpg (no WebP).
 * Uses `public/mascot/<pose>.png` hosted on the app domain.
 */
export function mascotPngUrl(pose: MascotPose, origin = DEFAULT_PUBLIC_ORIGIN): string {
  const base = origin.replace(/\/+$/, "");
  const httpsBase = base.startsWith("https://") ? base : `https://porchai.vercel.app`;
  return `${httpsBase}/mascot/${pose}.png`;
}

/**
 * Build a deep link into the MINI App / LIFF app.
 */
export function miniAppUrl(path = "/app", origin?: string): string {
  if (origin && origin.startsWith("https://")) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${origin.replace(/\/+$/, "")}${cleanPath}`;
  }
  const base = appUrl().replace(/\/+$/, "");
  if (!path || path === "/app") return base;
  const sub = path.replace(/^\/app/, "");
  return `${base}${sub.startsWith("/") ? sub : `/${sub}`}`;
}

// PorChai Green-Yellow Theme tokens for LINE Flex hex colors
export const FLEX_COLORS = {
  green900: "#12301B",
  green800: "#1F4D2B",
  green700: "#3B7A2E",
  green600: "#6AAE3E",
  green500: "#7EC151",
  lime300: "#B2D959",
  lime100: "#E8F3CF",
  lime50: "#F4F8E8",
  yellow400: "#FED24F",
  yellow50: "#FFF6D6",
  canvas50: "#F7F9F1",
  white: "#FFFFFF",
  sage500: "#4A5A48",
  sage400: "#6F7D6B",
  line200: "#E1E8D3",
  line400: "#B5C2A4",
  amber600: "#B5650A",
  amber50: "#FCEFD9",
  red600: "#C0362C",
  red50: "#FBE7E6",
} as const;
