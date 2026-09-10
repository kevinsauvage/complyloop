import * as Sentry from "@sentry/nextjs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppError from "./error";
import NotFound from "./not-found";

afterEach(() => {
  cleanup();
});

describe("app error and not-found pages", () => {
  it("renders an in-app error with retry and dashboard recovery", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <AppError
        error={Object.assign(new Error("Not allowed: missing permission."), {
          digest: "abc",
        })}
        retry={retry}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An unexpected error occurred while handling your request. Reference: abc",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Not allowed: missing permission.",
    );
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("renders not-found with a path back to the dashboard", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
