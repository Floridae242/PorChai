import Link from "next/link";
import { TAB_ICON } from "./icons";
import { NAV_TABS, type NavTab } from "./nav-items";
import type { TabKey } from "./tab-for-path";

function TabLink({ tab, active }: { tab: NavTab; active: boolean }) {
  const Icon = TAB_ICON[tab.key];
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 font-body text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${
        active ? "font-semibold text-link" : "text-muted"
      }`}
    >
      {active ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-pill bg-[var(--text-link)]" /> : null}
      <Icon />
      <span>{tab.label}</span>
    </Link>
  );
}

/** Bottom tab bar, < 1280px. Middle slot is the raised ＋ จด button. */
export function TabBar({ active, onRecord }: { active: TabKey | null; onRecord: () => void }) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      <div className="mx-auto flex h-16 max-w-3xl items-stretch">
        <TabLink tab={NAV_TABS.summary} active={active === "summary"} />
        <TabLink tab={NAV_TABS.plan} active={active === "plan"} />
        <div className="relative flex flex-1 justify-center">
          <button
            type="button"
            onClick={onRecord}
            aria-label="จด"
            className="absolute -top-5 flex size-14 items-center justify-center rounded-pill bg-action-primary text-on-action outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-700)] focus-visible:ring-offset-2 enabled:active:bg-action-pressed"
          >
            <span aria-hidden="true" className="font-body text-3xl font-semibold leading-none">
              ＋
            </span>
          </button>
          <span aria-hidden="true" className="mt-auto pb-1.5 font-body text-xs text-muted">
            จด
          </span>
        </div>
        <TabLink tab={NAV_TABS.perks} active={active === "perks"} />
        <TabLink tab={NAV_TABS.settings} active={active === "settings"} />
      </div>
    </nav>
  );
}
