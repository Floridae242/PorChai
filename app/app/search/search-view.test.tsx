// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";
import { SearchView } from "./search-view";
afterEach(cleanup);
it("separates private lookup from explicit web search and isolates provider widgets", async () => {
  const api = createMockApi({ consented: true });
  const search = vi
    .spyOn(api, "search")
    .mockResolvedValueOnce({
      mode: "entries",
      answer: "ไม่พบรายการ",
      sources: [],
      entries: [],
    })
    .mockResolvedValueOnce({
      mode: "web",
      answer: "ข้อมูลจากแหล่งอ้างอิง",
      sources: [{ title: "แหล่งข้อมูล", url: "https://example.org" }],
      suggestions: ["<script>alert('x')</script><div>Google</div>"],
    });
  const { container } = render(
    <ApiContext.Provider value={api}>
      <SearchView />
    </ApiContext.Provider>,
  );
  fireEvent.change(screen.getByLabelText("คำค้น"), { target: { value: "ข้าว" } });
  fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
  await screen.findByText("ไม่พบรายการ");
  expect(search).toHaveBeenLastCalledWith("ข้าว", "entries", "month");
  fireEvent.click(screen.getByRole("button", { name: "ค้นเว็บ" }));
  fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
  await screen.findByRole("heading", { name: "แหล่งอ้างอิง" });
  expect(search).toHaveBeenLastCalledWith("ข้าว", "web", "month");
  await waitFor(() => expect(container.querySelector("iframe")).not.toBeNull());
  const frame = container.querySelector("iframe")!;
  expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  expect(frame.getAttribute("srcdoc")).toContain("default-src 'none'");
  expect(container.querySelector("script")).toBeNull();
});
