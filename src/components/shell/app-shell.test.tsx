import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("./nav-links", () => ({
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
        navAttention={{ openFindings: 0, unreadAlerts: 0 }}
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
    expect(
      screen.getByRole("dialog", { name: "Main navigation" }),
    ).toBeInTheDocument();
  });

  it("closes the mobile sheet when a server-rendered nav link is clicked", async () => {
    const user = userEvent.setup();
    const { AppShell } = await import("./app-shell");
    render(
      <AppShell
        workspaceContext={<div>Context</div>}
        authControls={<div>Auth</div>}
        navAttention={{ openFindings: 0, unreadAlerts: 0 }}
        navLinks={
          // next/link renders a plain anchor like the server slot would.
          <ul>
            <li>
              <Link href="/findings">Findings</Link>
            </li>
          </ul>
        }
      >
        <h1>Dashboard</h1>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(
      screen.getByRole("dialog", { name: "Main navigation" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Findings" }));
    expect(
      screen.queryByRole("dialog", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
  });
});
