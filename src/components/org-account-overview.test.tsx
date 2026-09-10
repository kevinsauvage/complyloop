import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrgAccountOverview } from "./org-account-overview";

afterEach(() => {
  cleanup();
});

describe("OrgAccountOverview", () => {
  it("shows ownership, pilot plan, retention, and support contact", () => {
    render(
      <OrgAccountOverview
        orgName="Acme Compliance"
        orgSlug="acme-compliance"
        createdAt="2026-01-15T12:00:00.000Z"
        ownerGithubLogin="alice"
        viewerRole="owner"
        projectCount={2}
        memberCount={3}
        pendingInviteCount={1}
        supportEmail="support@example.com"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Early access pilot")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText(/organization owner/i)).toBeInTheDocument();
    expect(screen.getByText(/data retention/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "support@example.com" }),
    ).toHaveAttribute("href", "mailto:support@example.com");
    expect(
      screen.getAllByRole("link", { name: "Privacy" }).length,
    ).toBeGreaterThan(0);
    const projectsChip = screen.getByText("Projects").parentElement;
    expect(projectsChip).toHaveTextContent("2");
    const invitesChip = screen.getByText("Pending invites").parentElement;
    expect(invitesChip).toHaveTextContent("1");
    expect(screen.queryByText("Members")?.parentElement).toHaveTextContent("3");
  });

  it("hides the support contact when support email is unset", () => {
    render(
      <OrgAccountOverview
        orgName="Personal"
        orgSlug="personal-alice"
        createdAt="2026-01-15T12:00:00.000Z"
        ownerGithubLogin="alice"
        viewerRole="member"
        projectCount={0}
        memberCount={1}
        pendingInviteCount={0}
        supportEmail={null}
      />,
    );

    expect(screen.queryByRole("link", { name: /@/ })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/your complyloop pilot operator/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/manually provisioned/i)).toBeInTheDocument();
  });
});
