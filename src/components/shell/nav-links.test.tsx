import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/projects" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

import { isProjectScopedPath, NavLinks } from "./nav-links";

afterEach(() => {
  cleanup();
  pathname.current = "/projects";
});

describe("NavLinks", () => {
  it("lists only workspace-level destinations", () => {
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Organization" }),
    ).toBeInTheDocument();
    // Project pages live in the project tabs, never the sidebar.
    for (const label of ["Dashboard", "Requirements", "Findings", "Evidence"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });

  it("keeps Overview current while inside a project", () => {
    pathname.current = "/findings/f1";
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Organization" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks Organization current on /org", () => {
    pathname.current = "/org";
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Organization" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("isProjectScopedPath", () => {
  it("matches project pages and their children only", () => {
    expect(isProjectScopedPath("/dashboard")).toBe(true);
    expect(isProjectScopedPath("/findings/abc")).toBe(true);
    expect(isProjectScopedPath("/settings")).toBe(true);
    expect(isProjectScopedPath("/projects")).toBe(false);
    expect(isProjectScopedPath("/org")).toBe(false);
  });
});
