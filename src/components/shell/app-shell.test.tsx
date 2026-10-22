import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { afterEach, describe, expect, it, vi } from "vitest";

// Static import: the module transform must not run inside a test body, where
// it counts against the per-test timeout under parallel load.
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/p1/dashboard",
}));

vi.mock("./nav-links", () => ({
  NavLinks: () => <Link href="/projects">Projects</Link>,
}));

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("exposes a skip link to main content and a mobile menu control", async () => {
    const user = userEvent.setup();
    render(
      <AppShell authControls={<div>Auth</div>}>
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
    render(
      <AppShell authControls={<div>Auth</div>}>
        <h1>Dashboard</h1>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(
      screen.getByRole("dialog", { name: "Main navigation" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Projects" }));
    expect(
      screen.queryByRole("dialog", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
  });
});
