import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/components/nav-links", () => ({
  NavLinks: () => <span>Findings</span>,
}));

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("exposes a skip link to main content and a mobile menu control", async () => {
    const user = userEvent.setup();
    const { AppShell } = await import("./app-shell");
    render(
      <AppShell
        workspaceContext={<div>Context</div>}
        authControls={<div>Auth</div>}
      >
        <h1>Dashboard</h1>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).not.toBeNull();

    const menu = screen.getByRole("button", { name: "Menu" });
    await user.click(menu);
    expect(screen.getByRole("dialog", { name: "Main navigation" })).toBeInTheDocument();
  });
});
