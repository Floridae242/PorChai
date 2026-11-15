import { describe, expect, it } from "vitest";
import { BodyLimitError, readBoundedBytes } from "./body";

function streamed(chunks: Uint8Array[], length?: string) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const chunk of chunks) c.enqueue(chunk); }, cancel() { cancelled = true; } });
  return { source: { body, headers: new Headers(length ? { "content-length": length } : {}) }, cancelled: () => cancelled };
}
describe("bounded request streams", () => {
  it("counts real UTF8 bytes and cancels chunked overflow without Content-Length", async () => {
    const s = streamed([new TextEncoder().encode("ก"), new TextEncoder().encode("ข")]);
    await expect(readBoundedBytes(s.source, 5)).rejects.toBeInstanceOf(BodyLimitError);
    expect(s.cancelled()).toBe(true);
  });
  it("does not trust a lying short Content-Length", async () => {
    const s = streamed([new Uint8Array(10)], "1");
    await expect(readBoundedBytes(s.source, 2)).rejects.toBeInstanceOf(BodyLimitError);
  });
  it("rejects an excessive declared size before reading it", async () => {
    const s = streamed([], "1000000000");
    await expect(readBoundedBytes(s.source, 2)).rejects.toBeInstanceOf(BodyLimitError);
    expect(s.cancelled()).toBe(true);
  });
  it("accepts the exact boundary, an absent body, and propagates transport errors", async () => {
    expect(await readBoundedBytes(Response.json({ a: 1 }), 7)).toHaveLength(7);
    expect(await readBoundedBytes({ body: null, headers: new Headers() }, 0)).toHaveLength(0);
    const body = new ReadableStream<Uint8Array>({ start(c) { c.error(new Error("disconnect")); } });
    await expect(readBoundedBytes({ body, headers: new Headers() }, 2)).rejects.toThrow("disconnect");
  });
});
