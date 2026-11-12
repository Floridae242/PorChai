import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "theme.css"), "utf8");

const names = [
  "--green-900", "--green-800", "--green-700", "--green-600", "--green-500",
  "--lime-300", "--lime-100", "--lime-50", "--yellow-400", "--yellow-50",
  "--lemon-300", "--canvas-50", "--white", "--sage-500", "--sage-400",
  "--line-200", "--line-400", "--amber-600", "--amber-50", "--red-600", "--red-50",
  "--bg-app", "--bg-card", "--bg-subtle", "--bg-selected",
  "--text-primary", "--text-secondary", "--text-muted", "--text-on-action",
  "--text-on-hero", "--text-link", "--action-primary", "--action-primary-pressed",
  "--action-strong", "--border-default", "--border-strong", "--chart-past",
  "--status-ok", "--status-ok-bg", "--status-warn", "--status-warn-bg",
  "--status-danger", "--status-danger-bg", "--accent-reward",
  "--accent-reward-bg", "--accent-highlight", "--hero-gradient",
  "--font-body", "--font-display",
  "--radius-sm", "--radius-md", "--radius-sheet", "--radius-pill",
  "--space-1", "--space-2", "--space-3", "--space-4", "--space-6", "--space-8",
];

describe("app theme tokens", () => {
  it.each(names)("declares %s", (name) => {
    expect(css).toMatch(new RegExp(`(?<![\\w-])${name}\\s*:`));
  });

  it("pins key values", () => {
    expect(css).toContain("--green-500: #7EC151");
    expect(css).toContain("--green-900: #12301B");
    expect(css).toContain("--text-on-action: var(--green-900)");
  });

  it("does not import tailwind itself", () => {
    expect(css).not.toContain('@import "tailwindcss"');
  });
});

describe("always-light /app", () => {
  it("forces light color-scheme when the app root is present", () => {
    expect(css).toMatch(/html:has\(\[data-app-root\]\)\s*\{[^}]*color-scheme:\s*light/);
  });
});
