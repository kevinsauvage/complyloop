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
    expect(screen.getAllByText("Early access pilot").length).toBeGreaterThan(0);
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText(/workspace owner/i)).toBeInTheDocument();
    expect(screen.getByText(/data retention/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "support@example.com" }),
    ).toHaveAttribute("href", "mailto:support@example.com");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
    expect(screen.getByText(/2 projects/i)).toBeInTheDocument();
    expect(screen.getByText(/1 pending invite/i)).toBeInTheDocument();
  });

  it("falls back when support email is unset", () => {
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

    expect(
      screen.getByText(/your complyloop pilot operator/i),
    ).toBeInTheDocument();
  });
});
