// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSubmit } from "./use-submit";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useSubmit", () => {
  it("(a) two synchronous taps call send once; second is skipped", async () => {
    const { result } = renderHook(() => useSubmit<string>());
    let release!: (v: string) => void;
    const send = vi.fn(() => new Promise<string>((r) => (release = r)));
    let p1!: Promise<unknown>;
    let r2: unknown;
    await act(async () => {
      p1 = result.current.submit({ a: 1 }, send);
      r2 = await result.current.submit({ a: 1 }, send);
    });
    expect(r2).toEqual({ ok: false, skipped: true });
    await act(async () => {
      release("x");
      await p1;
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("(b) stays busy and skips after success until reset()", async () => {
    const { result } = renderHook(() => useSubmit<string>());
    const send = vi.fn(async () => "ok");
    await act(async () => {
      expect(await result.current.submit(1, send)).toEqual({ ok: true, value: "ok" });
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.done).toBe(true);
    await act(async () => {
      expect(await result.current.submit(1, send)).toEqual({ ok: false, skipped: true });
    });
    expect(send).toHaveBeenCalledTimes(1);
    act(() => result.current.reset());
    expect(result.current.busy).toBe(false);
    expect(result.current.done).toBe(false);
    await act(async () => {
      await result.current.submit(1, send);
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("(c) after failure busy is false, error set, retry with same payload reuses key", async () => {
    const { result } = renderHook(() => useSubmit<string>());
    const keys: string[] = [];
    const boom = new Error("net");
    await act(async () => {
      const r = await result.current.submit({ a: 1 }, async (k) => {
        keys.push(k);
        throw boom;
      });
      expect(r).toEqual({ ok: false, error: boom });
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe(boom);
    await act(async () => {
      await result.current.submit({ a: 1 }, async (k) => {
        keys.push(k);
        return "ok";
      });
    });
    expect(keys[1]).toBe(keys[0]);
    expect(result.current.error).toBeNull();
  });

  it("(d) retry with a different payload uses a new key", async () => {
    const { result } = renderHook(() => useSubmit<string>());
    const keys: string[] = [];
    const fail = async (k: string): Promise<string> => {
      keys.push(k);
      throw new Error("x");
    };
    await act(async () => {
      await result.current.submit({ a: 1 }, fail);
      await result.current.submit({ a: 2 }, fail);
    });
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("(e) next submit after reset() uses a new key", async () => {
    const { result } = renderHook(() => useSubmit<string>());
    const keys: string[] = [];
    const ok = async (k: string) => {
      keys.push(k);
      return "ok";
    };
    await act(async () => {
      await result.current.submit({ a: 1 }, ok);
    });
    act(() => result.current.reset());
    await act(async () => {
      await result.current.submit({ a: 1 }, ok);
    });
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("(f) uses crypto.randomUUID, with a hex fallback", async () => {
    const { result } = renderHook(() => useSubmit<string>());
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111");
    let got = "";
    await act(async () => {
      await result.current.submit(1, async (k) => {
        got = k;
        return "ok";
      });
    });
    expect(got).toBe("11111111-1111-4111-8111-111111111111");
    vi.restoreAllMocks();

    const { result: r2 } = renderHook(() => useSubmit<string>());
    vi.stubGlobal("crypto", {});
    let fb = "";
    await act(async () => {
      await r2.current.submit(1, async (k) => {
        fb = k;
        return "ok";
      });
    });
    expect(fb).toMatch(/^[0-9a-f]{32}$/);
  });

  it("(f2) without randomUUID the key is hex of 16 crypto.getRandomValues bytes; Math.random only with no crypto", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (a: Uint8Array) => {
        a.fill(0xab);
        return a;
      },
    });
    const { result } = renderHook(() => useSubmit<string>());
    let k1 = "";
    await act(async () => {
      await result.current.submit(1, async (k) => {
        k1 = k;
        return "ok";
      });
    });
    expect(k1).toBe("ab".repeat(16));

    vi.stubGlobal("crypto", undefined);
    const rnd = vi.spyOn(Math, "random");
    const { result: r2 } = renderHook(() => useSubmit<string>());
    let k2 = "";
    await act(async () => {
      await r2.current.submit(1, async (k) => {
        k2 = k;
        return "ok";
      });
    });
    expect(k2).toMatch(/^[0-9a-f]{32}$/);
    expect(rnd).toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("(g) no state update / warning after unmount", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useSubmit<string>());
    let release!: (v: string) => void;
    let p!: Promise<unknown>;
    act(() => {
      p = result.current.submit(1, () => new Promise<string>((r) => (release = r)));
    });
    unmount();
    release("late");
    await p;
    expect(err).not.toHaveBeenCalled();
  });
});
