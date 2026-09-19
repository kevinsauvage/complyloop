import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithUiProviders } from "@/test-fixtures/render-ui";

import { DashboardOverview, type DashboardQuickStat } from "./dashboard-overview";

afterEach(() => {
  cleanup();
});

const stats: DashboardQuickStat[] = [
  { label: "Open findings", value: 3, href: "/findings", tone: "warning" },
  { label: "Unread alerts", value: 0, tone: "muted" },
  {
    label: "Failed requirements",
    value: 2,
    href: "/requirements?status=failed",
    tone: "warning",
  },
  { label: "Pass rate", value: "88%", tone: "signal" },
];

describe("DashboardOverview", () => {
  it("labels the stat list and linked tiles for assistive tech", () => {
    renderWithUiProviders(<DashboardOverview title="shop" stats={stats} />);

    expect(
      screen.getByRole("list", { name: "Key compliance metrics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open findings: 3. View details" }),
    ).toHaveAttribute("href", "/findings");
    expect(screen.getByText("Pass rate")).toBeInTheDocument();
  });

  it("renders the repo chip label", () => {
    renderWithUiProviders(
      <DashboardOverview title="shop" repoLabel="acme/shop" stats={[]} />,
    );

    expect(screen.getByText("acme/shop")).toBeInTheDocument();
  });

  it("hides the repo chip when it duplicates the title", () => {
    renderWithUiProviders(
      <DashboardOverview
        title="kevinsauvage/next-portfolio"
        repoLabel="kevinsauvage/next-portfolio"
        stats={[]}
      />,
    );

    const headings = screen.getAllByText("kevinsauvage/next-portfolio");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.tagName).toBe("H1");
  });

  it("renders no stat list without stats", () => {
    renderWithUiProviders(
      <DashboardOverview title="Welcome to ComplyLoop" stats={[]} />,
    );

    expect(
      screen.queryByRole("list", { name: "Key compliance metrics" }),
    ).toBeNull();
  });
});
