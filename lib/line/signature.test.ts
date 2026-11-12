import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./signature";

const secret = "test-secret";
const body = '{"events":[]}';
const sign = (b: string) => createHmac("sha256", secret).update(b).digest("base64");

describe("verifySignature", () => {
  it("accepts a correct signature", () => {
    expect(verifySignature(body, sign(body), secret)).toBe(true);
  });

  it("rejects when the body changed by one character", () => {
    expect(verifySignature('{"events":[ ]}', sign(body), secret)).toBe(false);
  });

  it("rejects a null signature", () => {
    expect(verifySignature(body, null, secret)).toBe(false);
  });

  it("rejects a shorter signature without throwing", () => {
    expect(verifySignature(body, sign(body).slice(0, 10), secret)).toBe(false);
  });
});
