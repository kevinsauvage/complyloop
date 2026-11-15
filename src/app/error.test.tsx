import * as Sentry from "@sentry/nextjs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppError from "./error";
import NotFound from "./not-found";

// `not-found.tsx` is a server page that reads the session via `@/auth`.
// Mock the auth entry so the test never loads next-auth (whose `next/server`
// import Vitest cannot resolve) and renders the unauthenticated branch.
vi.mock("@/auth", () => ({
  isGitHubAuthConfigured: () => false,
}));

beforeEach(() => {
  // The browser SDK is imported on demand, and only when a DSN is configured.
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.example/1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("app error and not-found pages", () => {
  it("renders an in-app error with retry and overview recovery", async () => {
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
      screen.getByRole("heading", { name: "This page could not be loaded" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An unexpected error occurred while handling your request. Reference: abc",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Not allowed: missing permission.",
    );
    expect(
      screen.getByRole("link", { name: "Back to overview" }),
    ).toHaveAttribute("href", "/projects");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(Sentry.captureException).toHaveBeenCalled());
  });

  it("renders not-found with a path back to the overview", async () => {
    render(await NotFound());
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to overview" }),
    ).toHaveAttribute("href", "/projects");
  });
});
