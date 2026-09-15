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

const idle = { ok: false, message: null as string | null };

describe("useActionToast", () => {
  it("toasts when pending flips to false after a submit", async () => {
    const { rerender } = renderHook(
      ({ state, pending }) => useActionToast(state, pending),
      {
        initialProps: {
          state: idle,
          pending: false,
        },
      },
    );

    rerender({ state: idle, pending: true });
    rerender({ state: { ok: false, message: "Nope." }, pending: false });
    await waitFor(() => {
      // Errors stay inline by default — no error toast.
      expect(toastError).not.toHaveBeenCalled();
    });

    rerender({ state: idle, pending: true });
    rerender({ state: { ok: true, message: "Done." }, pending: false });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Done.", { duration: 4_000 });
    });
  });

  it("toasts the same success message on every completed submit", async () => {
    const { rerender } = renderHook(
      ({ state, pending }) => useActionToast(state, pending),
      {
        initialProps: {
          state: idle,
          pending: false,
        },
      },
    );

    rerender({ state: idle, pending: true });
    rerender({
      state: { ok: true, message: "Assessment complete." },
      pending: false,
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledTimes(1);
    });

    rerender({
      state: { ok: true, message: "Assessment complete." },
      pending: true,
    });
    rerender({
      state: { ok: true, message: "Assessment complete." },
      pending: false,
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledTimes(2);
    });
  });

  it("toasts errors only when opted in for fire-and-forget actions", async () => {
    const { rerender } = renderHook(
      ({ state, pending }) =>
        useActionToast(state, pending, { toastErrors: true }),
      {
        initialProps: {
          state: idle,
          pending: false,
        },
      },
    );

    rerender({ state: idle, pending: true });
    rerender({ state: { ok: false, message: "Nope." }, pending: false });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Nope.", { duration: 8_000 });
    });
  });

  it("does not toast the initial idle state", () => {
    renderHook(() =>
      useActionToast({ ok: true, message: "Should not toast" }, false),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
