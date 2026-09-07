import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/pr", () => ({
  createPullRequestAction: vi.fn(),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const useActionStateMock = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (...args: unknown[]) => useActionStateMock(...args),
  };
});

import { CreatePrForm } from "./create-pr-form";

afterEach(() => {
  cleanup();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("CreatePrForm", () => {
  it("toasts success with a PR action when a url is present", async () => {
    useActionStateMock.mockReturnValue([
      {
        error: null,
        message: "Pull request ready.",
        prUrl: "https://github.com/acme/shop/pull/1",
      },
      vi.fn(),
      false,
    ]);

    render(<CreatePrForm findingId="f1" />);

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "Pull request ready.",
        expect.objectContaining({
          duration: 6_000,
          action: expect.objectContaining({ label: "Open draft PR" }),
        }),
      );
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("toasts failures", async () => {
    useActionStateMock.mockReturnValue([
      { error: "Push failed.", message: null, prUrl: null },
      vi.fn(),
      false,
    ]);

    render(<CreatePrForm findingId="f1" />);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Push failed.", {
        duration: 8_000,
      });
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
