export class BodyLimitError extends Error {
  constructor() { super("Body exceeds configured byte limit"); this.name = "BodyLimitError"; }
}

// Enforce actual bytes as they arrive; Content-Length alone is untrusted/optional.
export async function readBoundedBytes(source: { body: ReadableStream<Uint8Array> | null; headers: Headers }, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("Invalid byte limit");
  const length = source.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    await source.body?.cancel().catch(() => {});
    throw new BodyLimitError();
  }
  if (!source.body) return new Uint8Array();
  const reader = source.body.getReader();
  let buffer = new Uint8Array(Math.min(maxBytes, 4096));
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new BodyLimitError();
      }
      if (total > buffer.length) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(total, buffer.length * 2)));
        grown.set(buffer);
        buffer = grown;
      }
      buffer.set(value, total - value.byteLength);
    }
  } finally { reader.releaseLock(); }
  return buffer.subarray(0, total);
}
