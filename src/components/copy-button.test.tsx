import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("announces Copied in a polite live region", async () => {
    const user = userEvent.setup();
    render(<CopyButton label="Copy patch" text="hello" />);

    await user.click(screen.getByRole("button", { name: "Copy patch" }));

    expect(await screen.findByText("Copied")).toBeInTheDocument();
    const live = screen.getByText("Copied");
    expect(live).toHaveAttribute("aria-live", "polite");
  });
});
