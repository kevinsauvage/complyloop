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
    const successState = {
      error: null as string | null,
      message: "Pull request ready." as string | null,
      prUrl: "https://github.com/acme/shop/pull/1" as string | null,
    };
    useActionStateMock.mockReturnValue([successState, vi.fn(), true]);
    const { rerender } = render(<CreatePrForm findingId="f1" />);
    useActionStateMock.mockReturnValue([successState, vi.fn(), false]);
    rerender(<CreatePrForm findingId="f1" />);

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

   it("shows failures inline instead of a toast", async () => {
     const errorState = {
       error: "Push failed." as string | null,
       message: null as string | null,
       prUrl: null as string | null,
     };
     useActionStateMock.mockReturnValue([errorState, vi.fn(), true]);
     const { rerender } = render(<CreatePrForm findingId="f1" />);
     useActionStateMock.mockReturnValue([errorState, vi.fn(), false]);
     rerender(<CreatePrForm findingId="f1" />);

     await waitFor(() => {
       expect(toastError).not.toHaveBeenCalled();
       expect(screen.getByRole("alert")).toHaveTextContent("Push failed.");
     });
   });
});
