import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    message: "Organization deleted. Evidence history was retained for audit.",
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

    const { OrgDataLifecycle } = await import("./org-data-lifecycle");
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
    expect(screen.getByRole("status")).toHaveTextContent(
      /exported acme data as json/i,
    );
    clickSpy.mockRestore();
  });

  it("requires typing DELETE before permanent deletion submits", async () => {
    const user = userEvent.setup();
    const { OrgDataLifecycle } = await import("./org-data-lifecycle");
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

  it("surfaces export failures accessibly", async () => {
    const user = userEvent.setup();
    exportOrgDataAction.mockResolvedValue({
      error: "Only the organization owner can export data.",
      json: null,
    });
    const { OrgDataLifecycle } = await import("./org-data-lifecycle");
    render(<OrgDataLifecycle orgId="org-1" orgName="Acme" />);

    await user.click(
      screen.getByRole("button", { name: /export organization json/i }),
    );
    await user.click(screen.getByRole("button", { name: /download json/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/only the organization owner/i);
  });
});
