import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { proposalFor, recentChat, remember } from "@/lib/db/chat-memory";

// Short chat memory: the last 10 lines, at most 30 minutes old, forgotten by the database itself.

const db = getDb();
const users: string[] = [];

async function makeUser(): Promise<string> {
  const { data, error } = await db.from("users").insert({ line_user_id: `U${crypto.randomUUID()}` }).select("id").single();
  expect(error).toBeNull();
  users.push(data!.id);
  return data!.id;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe("chat memory", () => {
  afterEach(async () => {
    await db.from("users").delete().in("id", users);
  });

  it("gives back both sides in the order they were said, with what the bot waits for", async () => {
    const u = await makeUser();
    await remember(u, [
      { role: "user", body: "ข้าว" },
      { role: "bot", body: "ข้าว กี่บาท?", pending: { kind: "amount", title: "ข้าว" } },
    ]);
    expect(await recentChat(u)).toEqual([
      { role: "user", body: "ข้าว", pending: null },
      { role: "bot", body: "ข้าว กี่บาท?", pending: { kind: "amount", title: "ข้าว" } },
    ]);
  });

  it("keeps only the newest 10 lines of a user", async () => {
    const u = await makeUser();
    for (let i = 1; i <= 12; i++) await remember(u, [{ role: "user", body: `m${i}` }]);
    const lines = await recentChat(u);
    expect(lines.map((l) => l.body)).toEqual(["m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"]);
    const { count } = await db.from("chat_messages").select("id", { count: "exact", head: true }).eq("user_id", u);
    expect(count).toBe(10); // deleted, not just hidden
  });

  it("forgets everyone's lines older than 30 minutes when anyone writes", async () => {
    const quiet = await makeUser();
    const other = await makeUser();
    // As if written 31 minutes ago, before the trigger ran on a newer line
    await db.from("chat_messages").insert({ user_id: quiet, role: "user", body: "old" });
    await db.from("chat_messages").update({ created_at: minutesAgo(31) }).eq("user_id", quiet);
    await remember(other, [{ role: "user", body: "hi" }]);
    const { data } = await db.from("chat_messages").select("body").eq("user_id", quiet);
    expect(data).toEqual([]);
  });

  it("a line just under 30 minutes old is still remembered", async () => {
    const u = await makeUser();
    await db.from("chat_messages").insert({ user_id: u, role: "user", body: "เมื่อกี้" });
    await db.from("chat_messages").update({ created_at: minutesAgo(29) }).eq("user_id", u);
    await remember(u, [{ role: "user", body: "ตอนนี้" }]);
    expect((await recentChat(u)).map((l) => l.body)).toEqual(["เมื่อกี้", "ตอนนี้"]);
  });

  it("does not read lines older than 30 minutes even before they are deleted", async () => {
    const u = await makeUser();
    await remember(u, [{ role: "user", body: "เก่า" }]);
    await db.from("chat_messages").update({ created_at: minutesAgo(31) }).eq("user_id", u);
    expect(await recentChat(u)).toEqual([]);
  });

  it("one user never sees another's lines", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await remember(a, [{ role: "user", body: "ของ a" }]);
    expect(await recentChat(b)).toEqual([]);
  });

  it("a pending line cannot belong to the user side", async () => {
    const u = await makeUser();
    const { error } = await db.from("chat_messages").insert({ user_id: u, role: "user", body: "x", pending: { kind: "amount", title: "x" } });
    expect(error?.code).toBe("23514");
  });

  it("finds a proposal by its key within 30 minutes, and only the user's own", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const items = [
      { title: "ข้าว", amount: 4500, category: "food" as const },
      { title: "น้ำ", amount: 2000, category: "food" as const },
    ];
    await remember(a, [{ role: "bot", body: "จดไหม", pending: { kind: "items", key: "E1", items } }]);
    expect(await proposalFor(a, "E1")).toEqual(items);
    expect(await proposalFor(a, "E2")).toBeNull();
    expect(await proposalFor(b, "E1")).toBeNull();

    await db.from("chat_messages").update({ created_at: minutesAgo(31) }).eq("user_id", a);
    expect(await proposalFor(a, "E1")).toBeNull();
  });
});
