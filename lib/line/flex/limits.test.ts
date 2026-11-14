import { describe, expect, it } from "vitest";
import {
  buildDemoScenarios,
  buildRichMenuSpec,
  decodePostback,
  encodePostback,
  type FlexButton,
  type FlexImage,
  type FlexMessage,
  type FlexNode,
} from "./index";

function collectNodes(node: FlexNode): FlexNode[] {
  if (node.type === "box") {
    return [node, ...node.contents.flatMap(collectNodes)];
  }
  return [node];
}

function collectButtons(msg: FlexMessage): FlexButton[] {
  const { header, body, footer } = msg.contents;
  const all = [
    ...(header ? collectNodes(header) : []),
    ...collectNodes(body),
    ...(footer ? collectNodes(footer) : []),
  ];
  return all.filter((n): n is FlexButton => n.type === "button");
}

function collectImages(msg: FlexMessage): FlexImage[] {
  const { header, body, footer } = msg.contents;
  const all = [
    ...(header ? collectNodes(header) : []),
    ...collectNodes(body),
    ...(footer ? collectNodes(footer) : []),
  ];
  return all.filter((n): n is FlexImage => n.type === "image");
}

describe("LINE Flex Guardrails (limits.test.ts)", () => {
  const scenarios = buildDemoScenarios("https://porchai.vercel.app");

  it("includes scenarios across all 4 batches (C1, C2, C3, C4)", () => {
    const batches = new Set(scenarios.map((s) => s.batch));
    expect(batches).toEqual(new Set(["C1", "C2", "C3", "C4"]));
    expect(scenarios.length).toBeGreaterThanOrEqual(18);
  });

  for (const s of scenarios) {
    describe(`${s.code} (${s.id}): ${s.title}`, () => {
      it("never contains the '฿' symbol anywhere in serialized JSON", () => {
        const json = JSON.stringify(s.message);
        expect(json).not.toContain("฿");
      });

      it("stays well under the 50 KB LINE Flex payload limit", () => {
        const json = JSON.stringify(s.message);
        const bytes = Buffer.byteLength(json, "utf8");
        expect(bytes).toBeLessThan(50 * 1024);
      });

      if (s.message.type === "flex") {
        const flexMsg = s.message;

        it("has a non-empty Thai altText (<= 400 chars)", () => {
          expect(flexMsg.altText.trim().length).toBeGreaterThan(0);
          expect(flexMsg.altText.length).toBeLessThanOrEqual(400);
        });

        it("has at most 3 buttons inside the Flex Bubble", () => {
          const buttons = collectButtons(flexMsg);
          expect(buttons.length).toBeLessThanOrEqual(3);
        });

        it("uses only HTTPS PNG/JPEG URLs for images (never WebP)", () => {
          const images = collectImages(flexMsg);
          for (const img of images) {
            expect(img.url).toMatch(/^https:\/\/.+\.(png|jpg|jpeg)$/i);
          }
        });

        it("encodes all postback buttons with valid v1.<action>.<id> <= 300 chars", () => {
          const buttons = collectButtons(flexMsg);
          for (const btn of buttons) {
            if (btn.action.type === "postback") {
              expect(btn.action.data.length).toBeLessThanOrEqual(300);
              const decoded = decodePostback(btn.action.data);
              expect(decoded).not.toBeNull();
              expect(decoded?.version).toBe("v1");
            }
          }
        });
      }

      if (s.message.quickReply) {
        it("keeps quickReply items <= 13 and validates postback actions", () => {
          const items = s.message.quickReply!.items;
          expect(items.length).toBeLessThanOrEqual(13);
          for (const item of items) {
            expect(item.action.label.length).toBeLessThanOrEqual(20);
            if (item.action.type === "postback") {
              expect(item.action.data.length).toBeLessThanOrEqual(300);
              expect(decodePostback(item.action.data)).not.toBeNull();
            }
          }
        });
      }
    });
  }

  describe("postback encode/decode contract", () => {
    it("round-trips valid postback payloads", () => {
      const raw = encodePostback("rem_yes", "rem_123");
      expect(raw).toBe("v1.rem_yes.rem_123");
      expect(decodePostback(raw)).toEqual({
        version: "v1",
        action: "rem_yes",
        id: "rem_123",
      });
    });

    it("round-trips 4-segment postback payloads with extra data", () => {
      const raw = encodePostback("ocr_pick_amount", "ocr_99", "10700");
      expect(raw).toBe("v1.ocr_pick_amount.ocr_99.10700");
      expect(decodePostback(raw)).toEqual({
        version: "v1",
        action: "ocr_pick_amount",
        id: "ocr_99",
        extra: "10700",
      });
    });

    it("rejects malformed or unknown postback strings", () => {
      expect(decodePostback("")).toBeNull();
      expect(decodePostback("v2.rem_yes.123")).toBeNull();
      expect(decodePostback("v1.unknown_action.123")).toBeNull();
      expect(decodePostback('{"a":"pay"}')).toBeNull();
    });
  });

  describe("Rich Menu 5-button specification", () => {
    it("uses 2500x1686 grid and postback for chat triggers (prevents E-26)", () => {
      const spec = buildRichMenuSpec("https://porchai.vercel.app");
      expect(spec.size).toEqual({ width: 2500, height: 1686 });
      expect(spec.areas).toHaveLength(5);
      for (const area of spec.areas) {
        if (area.action.type === "postback") {
          expect(decodePostback(area.action.data)).not.toBeNull();
        } else {
          expect(area.action.type).toBe("uri");
          expect(area.action.uri).toMatch(/^https:\/\//);
        }
      }
    });
  });
});
