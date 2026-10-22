import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppGroupLoading from "./loading";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("app group loading", () => {
  it("announces the workspace load after the visibility delay", () => {
    vi.useFakeTimers();
    render(<AppGroupLoading />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Loading workspace",
    );
    expect(screen.getByText("Loading workspace…")).toBeInTheDocument();
  });
});
