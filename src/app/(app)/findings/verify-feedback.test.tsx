import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatefulActionForm } from "@/components/stateful-action-form";

/** Mirrors the server's still-failing message (see remediation-verify.ts). */
const STILL_FAILING_VERIFY_MESSAGE =
  "Still failing — the violation is still detected at this location.";

const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  toastSuccess.mockClear();
});

describe("failed automated verification feedback", () => {
  it("surfaces the still-failing outcome as a success-channel message", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      ok: true,
      message: STILL_FAILING_VERIFY_MESSAGE,
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
      expect(toastSuccess).toHaveBeenCalledWith(STILL_FAILING_VERIFY_MESSAGE, {
        duration: 4_000,
      });
    });
  });
});
