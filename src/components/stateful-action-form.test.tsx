import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionMessageState } from "@/server/action-state";
import { StatefulActionForm } from "./stateful-action-form";

afterEach(() => {
  cleanup();
});

describe("StatefulActionForm", () => {
  it("disables the submit control while pending and surfaces success", async () => {
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
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("announces errors with role=alert", async () => {
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");
  });
});
