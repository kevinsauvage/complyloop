import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrgDataLifecycle } from "./org-data-lifecycle";

const toastSuccess = vi.fn();
const toastError = vi.fn();
const exportOrgDataAction = vi.fn();
const deleteOrgAction = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("@/server/actions/org", () => ({
  exportOrgDataAction: (...args: unknown[]) => exportOrgDataAction(...args),
  deleteOrgAction: (...args: unknown[]) => deleteOrgAction(...args),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  exportOrgDataAction.mockReset();
  deleteOrgAction.mockReset();
  deleteOrgAction.mockImplementation(async () => ({
    error: null,
    message: "Organization deleted, including its evidence history.",
  }));
});

describe("OrgDataLifecycle", () => {
  it("confirms export, downloads JSON, and announces success", async () => {
    const user = userEvent.setup();
    exportOrgDataAction.mockResolvedValue({
      error: null,
      json: '{"ok":true}',
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    // jsdom implements neither object-URL API; stub them rather than rely on
    // whichever global `URL` the test environment happens to expose.
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => "blob:org-export");
        static revokeObjectURL = vi.fn();
      },
    );

    render(<OrgDataLifecycle orgId="org-1" orgName="Acme" />);

    await user.click(
      screen.getByRole("button", { name: /export organization json/i }),
    );
    expect(
      screen.getByRole("heading", { name: /export organization data/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /download json/i }));

    await waitFor(() => {
      expect(exportOrgDataAction).toHaveBeenCalledWith("org-1");
      expect(toastSuccess).toHaveBeenCalledWith("Exported Acme data as JSON.");
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("requires typing DELETE before permanent deletion submits", async () => {
    const user = userEvent.setup();
    render(<OrgDataLifecycle orgId="org-1" orgName="Acme" />);

    await user.click(
      screen.getByRole("button", { name: /^delete organization$/i }),
    );
    expect(
      screen.getByRole("heading", { name: /delete acme/i }),
    ).toBeInTheDocument();

    const confirm = screen.getByLabelText(/confirmation/i);
    const submit = screen.getByRole("button", { name: /delete permanently/i });
    expect(submit).toBeDisabled();

    await user.type(confirm, "DELETE");
    expect(submit).toBeEnabled();
  });

  it("toasts export failures", async () => {
    const user = userEvent.setup();
    exportOrgDataAction.mockResolvedValue({
      error: "Only the organization owner can export data.",
      json: null,
    });
    render(<OrgDataLifecycle orgId="org-1" orgName="Acme" />);

    await user.click(
      screen.getByRole("button", { name: /export organization json/i }),
    );
    await user.click(screen.getByRole("button", { name: /download json/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Only the organization owner can export data.",
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
