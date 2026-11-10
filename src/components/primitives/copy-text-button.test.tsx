import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CopyTextButton } from "./copy-text-button";

describe("CopyTextButton", () => {
  it("copies the text and announces it politely", async () => {
    // userEvent.setup() installs its own clipboard stub; spy on that one.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyTextButton label="Copy for AI" icon="ai" text="# prompt" />);

    await user.click(screen.getByRole("button", { name: "Copy for AI" }));

    expect(writeText).toHaveBeenCalledWith("# prompt");
    const live = await screen.findByText("Copied");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("names the button with its description", () => {
    render(
      <CopyTextButton
        label="Copy for AI"
        icon="ai"
        text="x"
        description="3 requirements"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Copy for AI: 3 requirements" }),
    ).toBeInTheDocument();
  });

  it("copies an absolute URL for a path, icon-only with an accessible name", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(
      <CopyTextButton
        label="Copy link"
        icon="link"
        iconOnly
        description="WCAG 1.1.1"
        path="/requirements?q=WCAG%201.1.1#requirement-c1"
      />,
    );

    const button = screen.getByRole("button", {
      name: "Copy link: WCAG 1.1.1",
    });
    expect(button).not.toHaveTextContent("Copy link");
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/requirements?q=WCAG%201.1.1#requirement-c1`,
    );
  });
});
