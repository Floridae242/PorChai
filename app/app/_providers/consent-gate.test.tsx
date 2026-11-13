// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiContext } from "@/lib/client/use-api";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";

const replace = vi.fn();
let pathname = "/app";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
}));

import { ConsentGate } from "./consent-gate";

function spied(consented: boolean) {
  const api = createMockApi({ consented });
  const spies = {
    consent: vi.spyOn(api, "consent"),
    summary: vi.spyOn(api, "summary"),
    entries: vi.spyOn(api, "entries"),
    me: vi.spyOn(api, "me"),
  };
  return { api: api as PorchaiApi, spies };
}

function renderGate(api: PorchaiApi) {
  return render(
    <ApiContext.Provider value={api}>
      <ConsentGate>
        <p>เนื้อหา</p>
      </ConsentGate>
    </ApiContext.Provider>,
  );
}

describe("ConsentGate", () => {
  beforeEach(() => {
    replace.mockClear();
    pathname = "/app";
  });
  afterEach(cleanup);

  it("redirects to /app/consent and calls no financial method when not consented", async () => {
    const { api, spies } = spied(false);
    renderGate(api);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/consent"));
    expect(screen.queryByText("เนื้อหา")).toBeNull();
    expect(spies.summary).not.toHaveBeenCalled();
    expect(spies.entries).not.toHaveBeenCalled();
    expect(spies.me).not.toHaveBeenCalled();
  });

  it("renders children once consented", async () => {
    const { api } = spied(true);
    renderGate(api);
    expect(await screen.findByText("เนื้อหา")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders children on /app/consent without checking", () => {
    pathname = "/app/consent";
    const { api, spies } = spied(false);
    renderGate(api);
    expect(screen.getByText("เนื้อหา")).toBeTruthy();
    expect(spies.consent).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
