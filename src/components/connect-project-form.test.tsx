import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions", () => ({
  connectProjectAction: vi.fn(async () => ({
    error: "That path is not allowed.",
  })),
}));

afterEach(() => {
  cleanup();
});

describe("ConnectProjectForm", () => {
  it("associates the error with the target input for assistive tech", async () => {
    const user = userEvent.setup();
    const { ConnectProjectForm } = await import("./connect-project-form");
    render(<ConnectProjectForm />);

    await user.type(
      screen.getByRole("textbox", { name: /git repository url|local path/i }),
      "https://example.com/repo.git",
    );
    await user.click(screen.getByRole("button", { name: /connect project/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That path is not allowed.");
    const input = screen.getByRole("textbox", {
      name: /git repository url|local path/i,
    });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });
});
