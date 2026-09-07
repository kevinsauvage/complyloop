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
  it("toasts when pending flips to false after a submit", async () => {
    const { rerender } = renderHook(
      ({ state, pending }) => useActionToast(state, pending),
      {
        initialProps: {
          state: {
            error: null as string | null,
            message: null as string | null,
          },
          pending: false,
        },
      },
    );

    rerender({
      state: { error: null, message: null },
      pending: true,
    });
    rerender({
      state: { error: "Nope.", message: null },
      pending: false,
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Nope.", { duration: 8_000 });
    });

    rerender({
      state: { error: null, message: null },
      pending: true,
    });
    rerender({
      state: { error: null, message: "Done." },
      pending: false,
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Done.", { duration: 4_000 });
    });
  });

  it("toasts the same success message on every completed submit", async () => {
    const { rerender } = renderHook(
      ({ state, pending }) => useActionToast(state, pending),
      {
        initialProps: {
          state: {
            error: null as string | null,
            message: null as string | null,
          },
          pending: false,
        },
      },
    );

    rerender({
      state: { error: null, message: null },
      pending: true,
    });
    rerender({
      state: { error: null, message: "Assessment complete." },
      pending: false,
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledTimes(1);
    });

    rerender({
      state: { error: null, message: "Assessment complete." },
      pending: true,
    });
    rerender({
      state: { error: null, message: "Assessment complete." },
      pending: false,
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledTimes(2);
    });
  });

  it("does not toast the initial idle state", () => {
    renderHook(() =>
      useActionToast({ error: null, message: "Should not toast" }, false),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
