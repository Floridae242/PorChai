import { afterEach, describe, expect, it, vi } from "vitest";
import { flexExamples } from "./flex-examples";
import type { FlexComponent } from "./flex";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function actions(nodes: FlexComponent[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "box"
      ? actions(node.contents)
      : node.type === "button" && node.action.type === "postback"
        ? [node.action.data]
        : [],
  );
}

describe("public Flex examples", () => {
  it("uses six real message builders without a database or outgoing network request", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "private-dummy-token");
    vi.stubEnv("LINE_ASSET_BASE_URL", "https://porchai.vercel.app");
    const examples = flexExamples();
    expect(examples.map((example) => example.id)).toEqual([
      "welcome",
      "receipt",
      "confirm",
      "trial",
      "kept",
      "setup",
    ]);
    expect(examples.every((example) => example.message.type === "flex")).toBe(
      true,
    );
    expect(JSON.stringify(examples)).not.toContain("private-dummy-token");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the same calculator numbers as the actual expense receipt", () => {
    const receipt = flexExamples().find((example) => example.id === "receipt")!;
    expect(receipt.message.altText).toContain("จดแล้ว ✓ ข้าวเที่ยง 45 บาท");
    expect(receipt.message.altText).toContain("วันนี้ใช้ได้อีก 75 บาท");
    expect(JSON.stringify(receipt.message)).toContain("2,355");
  });
  it("makes exported example postbacks inert even if a demo is sent from the Simulator", () => {
    let postbackCount = 0;
    for (const { message } of flexExamples()) {
      const bubbles =
        message.contents.type === "carousel"
          ? message.contents.contents
          : [message.contents];
      const data = bubbles.flatMap((bubble) =>
        actions([
          ...(bubble.header?.contents ?? []),
          ...bubble.body.contents,
          ...(bubble.footer?.contents ?? []),
        ]),
      );
      for (const value of data) {
        expect(JSON.parse(value).k).toBe("");
        postbackCount++;
      }
    }
    expect(postbackCount).toBeGreaterThan(0);
  });
});
