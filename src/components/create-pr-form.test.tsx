import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/actions/pr", () => ({
  createPullRequestAction: vi.fn(),
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

describe("CreatePrForm", () => {
  it("exposes success with role=status", () => {
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

    expect(screen.getByRole("status")).toHaveTextContent("Pull request ready.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("exposes failures with role=alert", () => {
    useActionStateMock.mockReturnValue([
      { error: "Push failed.", message: null, prUrl: null },
      vi.fn(),
      false,
    ]);

    render(<CreatePrForm findingId="f1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Push failed.");
  });
});
