import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FindingQueueNav } from "./finding-queue-nav";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("FindingQueueNav", () => {
  it("shows an out-of-queue explanation when not in a queue", () => {
    const { container } = render(
      <FindingQueueNav
        listParams={{ tab: "open", page: 1 }}
        prevId={null}
        nextId={null}
        index={-1}
        total={0}
      />,
    );
    expect(
      screen.getByText(/This finding isn't in the current Open queue/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view all open findings/i }),
    ).toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });

  it("navigates with j/k and announces via a live region", async () => {
    const user = userEvent.setup();
    render(
      <FindingQueueNav
        listParams={{ tab: "open", page: 1 }}
        prevId="f0"
        nextId="f2"
        index={1}
        total={3}
      />,
    );

    expect(screen.getByText(/2 of 3 · Open/)).toBeInTheDocument();
    await user.keyboard("j");
    expect(push).toHaveBeenCalledWith(expect.stringContaining("/findings/f2"));
    expect(screen.getByText(/Moving to finding 3 of 3/i)).toBeInTheDocument();

    push.mockClear();
    await user.keyboard("k");
    expect(push).toHaveBeenCalledWith(expect.stringContaining("/findings/f0"));
    expect(screen.getByText(/Moving to finding 1 of 3/i)).toBeInTheDocument();
  });
});
