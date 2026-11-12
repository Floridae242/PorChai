import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const TARGETS = ["app/app/consent", "app/app/setup", "components/setup", "lib/client/setup-draft.ts", "lib/client/use-setup-draft.ts"];

function sourceFiles(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => {
    const child = join(rel, name);
    if (statSync(join(ROOT, child)).isDirectory()) return sourceFiles(child);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [join(ROOT, child)] : [];
  });
}

describe("setup/consent screens never import mock data", () => {
  const files = TARGETS.flatMap(sourceFiles);

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(files.map((f) => [f.replace(ROOT, "")]))("%s has no mock / fixture import and no fake constants", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*(client\/mock|\.\/mock|mock-fixtures)["']/);
    expect(src).not.toMatch(/DEFAULT_TODAY|CYCLE_DAYS|DEFAULT_CYCLE/);
    expect(src).not.toContain("ใช้แผนนี้");
  });
});
