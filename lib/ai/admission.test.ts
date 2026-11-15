import { afterEach, describe, expect, it, vi } from "vitest";
import { AiGate, aiDeadline, withAiScope } from "./admission";

afterEach(() => vi.useRealTimers());
describe("bounded AI work", () => {
  it("1,000 simultaneous admissions occupy at most 8 slots, with no waiting queue", () => {
    const gate = new AiGate(8);
    const releases = Array.from({ length: 1000 }, () => gate.enter()).filter((r) => r !== null);
    expect(releases).toHaveLength(8);
    for (const release of releases) { release(true); release(true); }
    expect(Array.from({ length: 9 }, () => gate.enter()).filter(Boolean)).toHaveLength(8);
  });
  it("opens after five failures, allows a single recovery probe, then recovers", () => {
    let time = 0;
    const gate = new AiGate(8, () => time);
    for (let i = 0; i < 5; i++) gate.enter()!(false);
    expect(gate.enter()).toBeNull();
    time = 30001;
    const probe = gate.enter()!;
    expect(gate.enter()).toBeNull();
    probe(true);
    expect(gate.enter()).not.toBeNull();
  });
  it("quota rejection does not count as provider outage", () => {
    const gate = new AiGate(1);
    for (let i = 0; i < 100; i++) gate.enter()!(null);
    expect(gate.enter()).not.toBeNull();
  });
  it("nested calls share their deadline and concurrent users cannot share context", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    await withAiScope("a", async () => {
      expect(aiDeadline()).toBe(16000);
      vi.setSystemTime(2000);
      await withAiScope("a", async () => expect(aiDeadline()).toBe(16000));
      await withAiScope("b", async () => expect(aiDeadline()).toBe(17000));
      expect(aiDeadline()).toBe(16000);
    });
  });
});
