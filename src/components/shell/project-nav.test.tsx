import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/projects/p1/dashboard" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

import { badgeAccessibleLabel, ProjectNav } from "./project-nav";

afterEach(() => {
  cleanup();
  pathname.current = "/projects/p1/dashboard";
});

describe("badgeAccessibleLabel", () => {
  it("includes the visible label text as a contiguous substring (WCAG 2.5.3)", () => {
    const name = badgeAccessibleLabel("Findings", 71, "openFindings");
    expect(name).toBe("Findings 71 open findings");
    expect(name).toContain("Findings 71");
  });

  it("handles singular counts and the alerts badge", () => {
    expect(badgeAccessibleLabel("Dashboard", 1, "unreadAlerts")).toBe(
      "Dashboard 1 unread alert",
    );
  });
});

describe("ProjectNav", () => {
  const project = { name: "Shop", repo: "acme/shop" };

  it("names the project, links back to the portfolio and lists the tabs", () => {
    render(<ProjectNav projectId="p1" project={project} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(screen.getByText("Shop")).toBeInTheDocument();
    expect(screen.getByText("acme/shop")).toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "Project" });
    expect(
      within(tabs).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(tabs).getByRole("link", { name: "Findings" }),
    ).toHaveAttribute("href", "/projects/p1/findings");
    for (const label of ["Requirements", "Findings", "Evidence", "Settings"]) {
      expect(
        within(tabs).getByRole("link", { name: label }),
      ).not.toHaveAttribute("aria-current");
    }
  });

  it("keeps the Findings tab current on a finding page", () => {
    pathname.current = "/projects/p1/findings/f1";
    render(<ProjectNav projectId="p1" project={project} />);

    expect(screen.getByRole("link", { name: "Findings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("annotates counts for screen readers", () => {
    render(
      <ProjectNav
        projectId="p1"
        project={project}
        navAttention={{ openFindings: 4, unreadAlerts: 2 }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Findings 4 open findings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Dashboard 2 unread alerts" }),
    ).toBeInTheDocument();
  });

  it("renders nothing without a project", () => {
    const { container } = render(<ProjectNav projectId="p1" project={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
