import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionMessageState } from "@/server/action-state";
import { StatefulActionForm } from "./stateful-action-form";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

afterEach(() => {
  cleanup();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("StatefulActionForm", () => {
  it("disables the submit control while pending and toasts success", async () => {
    const user = userEvent.setup();
    let resolveAction: ((value: ActionMessageState) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<ActionMessageState>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(
      <StatefulActionForm
        action={action}
        submitLabel="Save"
        pendingLabel="Saving…"
        variant="default"
      />,
    );

    const button = screen.getByRole("button", { name: "Save" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    resolveAction?.({ error: null, message: "Saved." });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Saved.");
    });
  });

  it("toasts errors", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      error: "Not allowed.",
      message: null,
    }));

    render(
      <StatefulActionForm
        action={action}
        submitLabel="Confirm"
        variant="default"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Not allowed.");
    });
  });
});
