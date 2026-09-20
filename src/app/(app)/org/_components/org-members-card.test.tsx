import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

// Static import: the module transform must not run inside a test body, where
// it counts against the per-test timeout under parallel load.
import { OrgMembersCard } from "./org-members-card";

vi.mock("@/server/actions/org", () => ({
  changeOrgMemberRoleAction: vi.fn(async () => ({
    error: null,
    message: "Role updated to member.",
  })),
  removeOrgMemberAction: vi.fn(async () => ({
    error: null,
    message: "Invite revoked.",
  })),
  leaveOrgMemberAction: vi.fn(async () => ({
    error: null,
    message: "You left the organization.",
  })),
}));

afterEach(() => {
  cleanup();
});

function member(
  partial: Pick<OrgMembership, "id" | "githubLogin" | "role"> &
    Partial<OrgMembership>,
): OrgMembership {
  return {
    orgId: "org-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("OrgMembersCard", () => {
  it("lets managers change member/viewer roles and revoke pending invites", async () => {
    const user = userEvent.setup();

    render(
      <OrgMembersCard
        orgId="org-1"
        currentUserId="user-a"
        canManage
        members={[
          member({
            id: "m-owner",
            githubLogin: "alice",
            role: "owner",
            userId: "user-a",
          }),
          member({
            id: "m-pending",
            githubLogin: "carol",
            role: "viewer",
          }),
          member({
            id: "m-member",
            githubLogin: "bob",
            role: "member",
            userId: "user-b",
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /revoke invite/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^remove$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /role for @carol/i }),
    ).toHaveValue("viewer");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /role for @bob/i }),
      "viewer",
    );
    await user.click(
      screen.getAllByRole("button", { name: /update role/i })[1]!,
    );
  });

  it("hides admin peer controls unless canAssignAdmin", () => {
    render(
      <OrgMembersCard
        orgId="org-1"
        currentUserId="user-a"
        canManage
        canAssignAdmin={false}
        members={[
          member({
            id: "m-admin",
            githubLogin: "bob",
            role: "admin",
            userId: "user-b",
          }),
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /update role/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("hides management controls when canManage is false", () => {
    render(
      <OrgMembersCard
        orgId="org-1"
        currentUserId="user-v"
        canManage={false}
        members={[
          member({
            id: "m-member",
            githubLogin: "bob",
            role: "member",
            userId: "user-b",
          }),
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /update role/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });
});
