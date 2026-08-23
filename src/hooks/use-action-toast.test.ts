import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useActionToast } from "./use-action-toast";

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

describe("useActionToast", () => {
  it("toasts errors and success messages once per distinct result", async () => {
    const { rerender } = renderHook(
      ({ state }) => useActionToast(state),
      {
        initialProps: {
          state: {
            error: null as string | null,
            message: null as string | null,
          },
        },
      },
    );

    rerender({ state: { error: "Nope.", message: null } });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Nope.", { duration: 8_000 });
    });

    rerender({ state: { error: "Nope.", message: null } });
    expect(toastError).toHaveBeenCalledTimes(1);

    rerender({ state: { error: null, message: "Done." } });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Done.", { duration: 4_000 });
    });
  });
});
