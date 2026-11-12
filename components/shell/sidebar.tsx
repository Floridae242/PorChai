import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { TAB_ICON } from "./icons";
import { NAV_TABS, type NavTab } from "./nav-items";
import type { TabKey } from "./tab-for-path";

function SideLink({ tab, active }: { tab: NavTab; active: boolean }) {
  const Icon = TAB_ICON[tab.key];
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`flex h-12 items-center gap-3 rounded-pill px-4 font-body text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${
        active ? "bg-selected font-semibold text-primary" : "text-muted"
      }`}
    >
      <Icon />
      <span>{tab.label}</span>
    </Link>
  );
}

/** Left sidebar, >= 1280px, 240px wide. ＋ จด sits on top. */
export function Sidebar({ active, onRecord }: { active: TabKey | null; onRecord: () => void }) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-2 border-r border-line bg-card p-4 xl:flex"
    >
      <button type="button" onClick={onRecord} className={`${buttonClass("primary", true)} mb-4`}>
        <span aria-hidden="true">＋</span> จด
      </button>
      <SideLink tab={NAV_TABS.summary} active={active === "summary"} />
      <SideLink tab={NAV_TABS.plan} active={active === "plan"} />
      <SideLink tab={NAV_TABS.perks} active={active === "perks"} />
      <SideLink tab={NAV_TABS.settings} active={active === "settings"} />
    </nav>
  );
}
