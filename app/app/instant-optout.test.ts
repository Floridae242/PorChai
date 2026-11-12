import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The MINI App is client-gated (LIFF + consent), so every page opts out of instant-navigation validation.
// Layout opt-out does not cover child segments, and a "use client" file cannot export `instant`.
const pages = globSync("app/app/**/page.tsx");

describe("instant opt-out", () => {
  it("finds the app pages", () => expect(pages.length).toBeGreaterThanOrEqual(3));
  it.each(pages)("%s exports instant = false from a server file", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/^export const instant = false;?$/m);
    expect(src).not.toMatch(/^["']use client["']/m);
  });
});
