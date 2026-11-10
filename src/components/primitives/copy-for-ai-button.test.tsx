import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CopyForAiButton } from "./copy-for-ai-button";

describe("CopyForAiButton", () => {
  it("copies the prompt and announces it politely", async () => {
    // userEvent.setup() installs its own clipboard stub; spy on that one.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyForAiButton text="# prompt" />);

    await user.click(screen.getByRole("button", { name: "Copy for AI" }));

    expect(writeText).toHaveBeenCalledWith("# prompt");
    const live = await screen.findByText("Prompt copied");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("names the button with its description", () => {
    render(
      <CopyForAiButton
        text="x"
        description="3 unable-to-verify requirements"
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Copy for AI: 3 unable-to-verify requirements",
      }),
    ).toBeInTheDocument();
  });
});
