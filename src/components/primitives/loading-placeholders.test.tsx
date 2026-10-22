import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteLoadingStatus } from "./loading-placeholders";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RouteLoadingStatus", () => {
  it("stays empty before the visibility delay, then announces and cycles", () => {
    vi.useFakeTimers();
    render(
      <RouteLoadingStatus
        label="Loading dashboard"
        steps={["Connecting workspace…", "Loading assessments…"]}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Loading dashboard",
    );
    expect(screen.getByText("Connecting workspace…")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByText("Loading assessments…")).toBeInTheDocument();
  });

  it("renders a single step without cycling", () => {
    vi.useFakeTimers();
    render(<RouteLoadingStatus label="Loading" steps={["Preparing…"]} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Preparing…")).toBeInTheDocument();
  });
});
