import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionState } from "@/server/action-state";

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
  it("disables the submit control while pending and confirms success inline plus toast", async () => {
    const user = userEvent.setup();
    let resolveAction: ((value: ActionState) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<ActionState>((resolve) => {
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

    resolveAction?.({ ok: true, message: "Saved." });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Saved.", { duration: 4_000 });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows errors inline without a toast", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      ok: false,
      message: "Not allowed.",
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
      expect(toastError).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("Not allowed.");
    });
  });
});
