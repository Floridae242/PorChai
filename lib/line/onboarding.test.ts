import { afterEach, expect, it, vi } from "vitest";
import {
  buildOnboardingCarousel,
  ONBOARDING_STEPS,
  onboardingHelp,
} from "./onboarding";
import type { FlexComponent } from "./branded-flex";
import { presentReply } from "./presentation";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const nodes = (list: FlexComponent[]): FlexComponent[] =>
  list.flatMap((n) => (n.type === "box" ? [n, ...nodes(n.contents)] : [n]));
it("covers every supported feature in ten bounded, same-width swipeable bubbles", () => {
  const card = buildOnboardingCarousel();
  expect(card.contents.type).toBe("carousel");
  if (card.contents.type !== "carousel") throw Error("carousel required");
  expect(card.contents.contents).toHaveLength(10);
  expect(new Set(card.contents.contents.map((b) => b.size))).toEqual(
    new Set(["mega"]),
  );
  expect(Buffer.byteLength(JSON.stringify(card.contents))).toBeLessThan(
    50 * 1024,
  );
  expect(card.altText.length).toBeLessThanOrEqual(400);
  for (const bubble of card.contents.contents) {
    expect(Buffer.byteLength(JSON.stringify(bubble))).toBeLessThan(30 * 1024);
    for (const n of nodes([
      ...(bubble.header?.contents ?? []),
      ...bubble.body.contents,
      ...(bubble.footer?.contents ?? []),
    ])) {
      if (n.type === "text") expect(n.wrap).toBe(true);
      if (n.type === "button")
        expect(n.action.label.length, n.action.label).toBeLessThanOrEqual(20);
      if (n.type === "image") {
        expect(n.url).toMatch(/^https:\/\//);
        expect(n.url).toMatch(/\.png$/);
        expect(new URL(n.url).username).toBe("");
      }
    }
  }
  expect(presentReply(card)).toBe(card);
});
it.each(ONBOARDING_STEPS)(
  "guide $id is read-only, explains the step and never calls a service",
  (step) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const help = onboardingHelp(`guide:${step.id}`);
    expect(help?.text).toContain(step.detail);
    expect(help?.text).toContain("ยังไม่ได้บันทึกหรือเปลี่ยนข้อมูล");
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it.each([
  "guide:pay:1000",
  "guide:../start",
  "guide:record;drop",
  "guide:income:100000",
  "pc:yes:any",
  "guide:unknown",
])("unknown guide action is not executable: %s", (data) =>
  expect(onboardingHelp(data)).toBeNull(),
);
it("contains honest limits and chat-first instructions without claiming rewards or purchases", () => {
  const json = JSON.stringify(buildOnboardingCarousel());
  for (const text of [
    "เริ่มรอบเงิน",
    "1 แต้ม",
    "ยืนยัน",
    "จดย้อนหลัง",
    "ข้อมูลจำลอง",
    "รายรับ",
    "รายเดือน",
    "ไม่หักเงิน",
    "ยังไม่จดเป็นรายจ่าย",
  ]) {
    // Some details appear when opening a topic instead of overcrowding its front face.
    expect(json + ONBOARDING_STEPS.map((s) => s.detail).join()).toContain(text);
  }
});
