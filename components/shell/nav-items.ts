import type { TabKey } from "./tab-for-path";

export type NavTab = { key: Exclude<TabKey, "record">; label: string; href: string };

export const NAV_TABS: Record<NavTab["key"], NavTab> = {
  summary: { key: "summary", label: "สรุป", href: "/app" },
  plan: { key: "plan", label: "แผนเงิน", href: "/app/plan" },
  perks: { key: "perks", label: "สิทธิพิเศษ", href: "/app/perks" },
  settings: { key: "settings", label: "ตั้งค่า", href: "/app/settings" },
};
