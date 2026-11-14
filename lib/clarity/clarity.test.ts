// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLARITY_SCRIPT_ID, isMiniAppPath, loadClarity, shouldLoadClarity, stopClarity } from "./index";

const ok = { projectId: "abc123xyz9", pathname: "/app", consented: true, liffReady: true };

afterEach(() => {
  document.getElementById(CLARITY_SCRIPT_ID)?.remove();
  delete window.clarity;
});

describe("shouldLoadClarity", () => {
  it("loads only when id, MINI App path, consent and LIFF are all present", () => {
    expect(shouldLoadClarity(ok)).toBe(true);
    expect(shouldLoadClarity({ ...ok, pathname: "/app/plan" })).toBe(true);
  });
  it.each([
    ["no project id", { projectId: undefined }],
    ["empty project id", { projectId: "" }],
    ["malformed project id", { projectId: "x\"><script>" }],
    ["no consent", { consented: false }],
    ["LIFF not ready", { liffReady: false }],
    ["consent page", { pathname: "/app/consent" }],
    ["shop", { pathname: "/shop" }],
    ["landing", { pathname: "/" }],
    ["miniapp marketing", { pathname: "/miniapp" }],
    ["business", { pathname: "/business/demo" }],
    ["lookalike prefix", { pathname: "/application" }],
    ["null path", { pathname: null }],
  ])("does not load: %s", (_n, over) => {
    expect(shouldLoadClarity({ ...ok, ...over })).toBe(false);
  });
  it("isMiniAppPath", () => {
    expect(isMiniAppPath("/app")).toBe(true);
    expect(isMiniAppPath("/app/perks/p1")).toBe(true);
    expect(isMiniAppPath("/app/consent")).toBe(false);
  });
});

describe("loadClarity", () => {
  it("injects the tag once and grants analytics only", () => {
    expect(loadClarity("abc123xyz9")).toBe(true);
    expect(loadClarity("abc123xyz9")).toBe(false);
    const tags = document.querySelectorAll(`#${CLARITY_SCRIPT_ID}`);
    expect(tags).toHaveLength(1);
    expect((tags[0] as HTMLScriptElement).src).toBe("https://www.clarity.ms/tag/abc123xyz9");
    const q = window.clarity?.q as unknown[][];
    expect(q[0]).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }]);
  });
  it("refuses a malformed id", () => {
    expect(loadClarity("bad id")).toBe(false);
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();
  });
  it("stopClarity denies consent and erases cookies", () => {
    const fn = vi.fn();
    window.clarity = fn as never;
    stopClarity();
    expect(fn).toHaveBeenCalledWith("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
    expect(fn).toHaveBeenCalledWith("consent", false);
  });
  it("stopClarity is safe when Clarity never loaded", () => {
    expect(() => stopClarity()).not.toThrow();
  });
});

// Regression guards: privacy promises made to users.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git" || name === ".superpowers") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const root = process.cwd();
const sources = ["app", "components", "lib"].flatMap((d) => walk(join(root, d)));

describe("privacy guards", () => {
  it("only lib/clarity talks to clarity", () => {
    const offenders = sources.filter(
      (f) => !f.replace(/\\/g, "/").includes("/lib/clarity/") && /clarity\s*\(|window\.clarity/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
  it("no identify/set/event calls to Clarity (no user data leaves the app)", () => {
    const src = readFileSync(join(root, "lib/clarity/index.ts"), "utf8");
    expect(src).not.toMatch(/["'](identify|set|event|upgrade)["']/);
  });
  it("MINI App screens do not read money or personal values from the URL", () => {
    const re = /searchParams\??\.get\(\s*["'](amount|note|title|payday|balance|name)["']\s*\)/;
    const offenders = sources.filter((f) => f.replace(/\\/g, "/").includes("/app/app/") && re.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("every data-clarity-mask uses the same value", () => {
    const bad = sources.filter((f) => {
      const m = readFileSync(f, "utf8").match(/data-clarity-mask=["'{]*([^"'}\s>]*)/g) ?? [];
      return m.some((x) => !/="true$/.test(x));
    });
    expect(bad).toEqual([]);
  });
});
