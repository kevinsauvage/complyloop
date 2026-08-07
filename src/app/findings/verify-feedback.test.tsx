import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { STILL_FAILING_VERIFY_MESSAGE } from "@/server/verify-messages";

afterEach(() => {
  cleanup();
});

describe("failed automated verification feedback", () => {
  it("announces the still-failing message with role=alert", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      error: STILL_FAILING_VERIFY_MESSAGE,
      message: null,
    }));

    render(
      <StatefulActionForm
        action={action}
        submitLabel="Verify fix (automated re-check)"
        pendingLabel="Verifying…"
        variant="default"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Verify fix (automated re-check)" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(STILL_FAILING_VERIFY_MESSAGE);
  });
});
