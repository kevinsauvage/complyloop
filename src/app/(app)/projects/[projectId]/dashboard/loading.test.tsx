import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardLoading from "./loading";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("dashboard loading", () => {
  it("announces the dashboard load after the visibility delay", () => {
    vi.useFakeTimers();
    render(<DashboardLoading />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Loading dashboard",
    );
    expect(screen.getByText("Connecting workspace…")).toBeInTheDocument();
  });
});
