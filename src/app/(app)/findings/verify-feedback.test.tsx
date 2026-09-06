import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatefulActionForm } from "@/components/stateful-action-form";

/** Mirrors the server's still-failing message (see remediation-verify.ts). */
const STILL_FAILING_VERIFY_MESSAGE =
  "Still failing — the violation is still detected at this location.";

const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  toastError.mockClear();
});

describe("failed automated verification feedback", () => {
  it("toasts the still-failing message", async () => {
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

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(STILL_FAILING_VERIFY_MESSAGE, {
        duration: 8_000,
      });
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      STILL_FAILING_VERIFY_MESSAGE,
    );
  });
});
