import { describe, expect, it } from "vitest";
import { hideNav, tabForPath } from "./tab-for-path";

describe("tabForPath", () => {
  const cases: [string, ReturnType<typeof tabForPath>][] = [
    ["/app", "summary"],
    ["/app/cycle/new", "summary"],
    ["/app/summary/categories", "summary"],
    ["/app/plan", "plan"],
    ["/app/plan/edit", "summary"],
    ["/app/plan/edit/review", "summary"],
    ["/app/plan/edit/done", "summary"],
    ["/app/balance/adjust", "summary"],
    ["/app/settings", "settings"],
    ["/app/settings/categories", "settings"],
    ["/app/settings/privacy", "settings"],
    ["/app/settings/delete", "settings"],
    ["/app/settings/bills", "settings"],
    ["/app/settings/savings", "settings"],
    ["/app/settings/notifications", "settings"],
    ["/app/perks", "perks"],
    ["/app/perks/abc", "perks"],
    ["/app/perks/abc/code", "perks"],
    ["/app/points", "perks"],
    ["/app/record/new", null],
    ["/app/record/link", null],
    ["/app/record/done", null],
    ["/app/record/123", null],
    ["/app/try", null],
    ["/app/try/result", null],
    ["/app/try/decide", null],
    ["/app/try/saved", null],
    ["/app/plus", null],
    ["/app/plus/pay", null],
    ["/app/plus/status", null],
    ["/app/unknown", null],
    ["/app/planet", null],
  ];
  it.each(cases)("%s -> %s", (path, tab) => {
    expect(tabForPath(path)).toBe(tab);
  });
});

describe("hideNav", () => {
  it.each(["/app/consent", "/app/setup", "/app/setup/income", "/app/setup/review", "/app/demo", "/app/demo/ui", "/app/loading", "/app/consent/", "/app/demo/ui/"])(
    "hides on %s",
    (p) => expect(hideNav(p)).toBe(true),
  );
  it.each(["/app", "/app/plan", "/app/record/new", "/app/settings/bills", "/app/setupx"])("shows on %s", (p) =>
    expect(hideNav(p)).toBe(false),
  );
});
