import type { ReactNode } from "react";
import type { TabKey } from "./tab-for-path";

// Temporary inline outline icons (24px, currentColor) until the Figma icon set is exported.
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SummaryIcon() {
  return (
    <Svg>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h13V10" />
    </Svg>
  );
}

export function PlanIcon() {
  return (
    <Svg>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </Svg>
  );
}

export function PerksIcon() {
  return (
    <Svg>
      <rect x="3.5" y="9" width="17" height="11" rx="2" />
      <path d="M3.5 13h17M12 9v11" />
      <path d="M12 9C10.5 5.5 7 5 7 7.2 7 8.6 9 9 12 9Zm0 0c1.5-3.5 5-4 5-1.8 0 1.4-2 1.8-5 1.8Z" />
    </Svg>
  );
}

export function SettingsIcon() {
  return (
    <Svg>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Svg>
  );
}

export const TAB_ICON: Record<Exclude<TabKey, "record">, () => ReactNode> = {
  summary: SummaryIcon,
  plan: PlanIcon,
  perks: PerksIcon,
  settings: SettingsIcon,
};
