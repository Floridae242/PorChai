import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";
import { GET as insights } from "@/app/api/insights/route";
import { getDb } from "@/lib/db/client";
import { generate } from "@/lib/ai/gemini";
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string) =>
    token === "invalid"
      ? { ok: false, reason: "invalid" }
      : { ok: true, lineUserId: token },
  ),
}));
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null) }));
const db = getDb(),
  line = `U_category-api-${crypto.randomUUID()}`;
const req = (path: string, method = "GET", body?: unknown, token = line) =>
  new Request(`http://localhost/api/${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "test-channel");
  vi.mocked(generate).mockClear();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  expect(
    (await db.from("users").delete().eq("line_user_id", line)).error,
  ).toBeNull();
});
it.each(["", "invalid"])(
  "requires verified identity for category reads/writes and analysis: %s",
  async (token) => {
    for (const r of await Promise.all([
      GET(req("categories", "GET", undefined, token)),
      PUT(
        req(
          "categories",
          "PUT",
          { label: "x", parent: "food", monthlyBudget: null },
          token,
        ),
      ),
      insights(req("insights", "GET", undefined, token)),
    ]))
      expect(r.status).toBe(401);
  },
);
it("settings persist through authenticated APIs; overview has real empty state without calling AI", async () => {
  const rows = await GET(req("categories"));
  expect(rows.status).toBe(200);
  expect(await rows.json()).toHaveLength(5);
  const save = await PUT(
    req("categories", "PUT", {
      label: "ชานม",
      parent: "food",
      monthlyBudget: 50000,
    }),
  );
  expect(save.status).toBe(200);
  const c = await save.json();
  expect(c).toMatchObject({ label: "ชานม", monthlyBudget: 50000 });
  const result = await insights(req("insights"));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ count: 0, total: 0 });
  expect(generate).not.toHaveBeenCalled();
  const edited = await PUT(
    req("categories", "PUT", { ...c, monthlyBudget: 60000 }),
  );
  expect(edited.status).toBe(200);
  expect(
    (await PUT(req("categories", "PUT", { ...c, monthlyBudget: 70000 })))
      .status,
  ).toBe(409);
});
it.each([
  { label: "", parent: "food", monthlyBudget: null },
  { label: "x", parent: "other-user", monthlyBudget: 100 },
  { label: "x", parent: "food", monthlyBudget: -1 },
])("invalid input cannot create settings %j", async (body) => {
  expect((await PUT(req("categories", "PUT", body))).status).toBe(422);
});
it("malformed JSON and excessive request bodies cannot become category settings", async () => {
  const jsonRequest = (body: string) =>
    new Request("http://localhost/api/categories", {
      method: "PUT",
      headers: { Authorization: `Bearer ${line}` },
      body,
    });
  expect((await PUT(jsonRequest("{"))).status).toBe(400);
  expect(
    (
      await PUT(
        jsonRequest(
          JSON.stringify({
            label: "x".repeat(70000),
            parent: "food",
            monthlyBudget: null,
          }),
        ),
      )
    ).status,
  ).toBe(413);
  expect(await (await GET(req("categories"))).json()).toHaveLength(5);
});
it("body user identifiers cannot select another account's settings", async () => {
  const other = `${line}-victim`;
  try {
    const own = await (
      await PUT(
        req("categories", "PUT", {
          label: "Own",
          parent: "food",
          monthlyBudget: 100,
          userId: other,
        }),
      )
    ).json();
    const victim = await (
      await PUT(
        req(
          "categories",
          "PUT",
          { label: "Victim", parent: "food", monthlyBudget: 200 },
          other,
        ),
      )
    ).json();
    expect(
      (
        await PUT(
          req("categories", "PUT", {
            ...victim,
            label: "stolen",
            userId: other,
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await (await GET(req("categories"))).json()).some(
        (x: { id: string }) => x.id === own.id,
      ),
    ).toBe(true);
    expect(
      (
        await (await GET(req("categories", "GET", undefined, other))).json()
      ).some(
        (x: { id: string; label: string }) =>
          x.id === victim.id && x.label === "Victim",
      ),
    ).toBe(true);
  } finally {
    expect(
      (await db.from("users").delete().eq("line_user_id", other)).error,
    ).toBeNull();
  }
});
