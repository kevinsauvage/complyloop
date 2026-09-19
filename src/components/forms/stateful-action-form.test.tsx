import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionState } from "@/core/action-state";

import { StatefulActionForm } from "./stateful-action-form";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: (...args: unknown[]) => routerRefresh(...args) }),
}));

afterEach(() => {
  cleanup();
  toastSuccess.mockClear();
  toastError.mockClear();
  routerRefresh.mockClear();
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
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("refreshes the route after success only when refreshOnSuccess is set", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ ok: true, message: "Queued." }));

    const { unmount } = render(
      <StatefulActionForm
        action={action}
        submitLabel="Run"
        variant="default"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled();
    });
    expect(routerRefresh).not.toHaveBeenCalled();
    unmount();

    toastSuccess.mockClear();
    render(
      <StatefulActionForm
        action={action}
        submitLabel="Run again"
        variant="default"
        refreshOnSuccess
      />,
    );
    await user.click(screen.getByRole("button", { name: "Run again" }));
    await waitFor(() => {
      expect(routerRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
