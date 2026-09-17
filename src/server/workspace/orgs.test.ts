import { describe, expect, it } from "vitest";

import type {
  Organization,
  OrgMembership,
} from "@complyloop/analysis-core/contract/project-types";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { emptyWorkspaceSlice } from "@complyloop/db/types";

import {
  changeOrgMemberRole,
  findOrgMembershipByLogin,
  inviteOrgMember,
  leaveOrgMember,
  removeOrgMember,
} from "./org-membership";
import {
  buildOrgMembershipIndex,
  orgsForUser,
  resolveActiveOrgId,
  userRoleInOrg,
} from "./org-queries";
import { createOrganization, deleteOrganization, exportOrgData } from "./orgs";

function applyMembership(
  db: WorkspaceSlice,
  membership: OrgMembership,
): OrgMembership {
  const index = db.memberships.findIndex((row) => row.id === membership.id);
  if (index >= 0) {
    db.memberships[index] = membership;
  } else {
    db.memberships.push(membership);
  }
  return membership;
}

function applyOrg(
  db: WorkspaceSlice,
  created: { org: Organization; membership: OrgMembership },
): Organization {
  db.organizations.push(created.org);
  db.memberships.push(created.membership);
  return created.org;
}

/** Seed an owner org for fixtures (production uses `provisionPersonalOrg`). */
function seedOwnerOrg(
  db: WorkspaceSlice,
  userId: string,
  githubLogin: string,
  name = `${githubLogin}'s workspace`,
): Organization {
  return applyOrg(
    db,
    createOrganization(db, { name, creatorUserId: userId, githubLogin }),
  );
}

/** Test fixture: attach userId to invite rows (mirrors DB claimMembershipsForLogin). */
function claimInvite(
  db: WorkspaceSlice,
  userId: string,
  githubLogin: string,
): void {
  const login = githubLogin.trim().toLowerCase();
  for (const membership of db.memberships) {
    if (
      membership.githubLogin.toLowerCase() === login &&
      membership.userId !== userId
    ) {
      membership.userId = userId;
    }
  }
}

describe("orgs", () => {
  it("leaves pending invites unclaimed until DB provision attaches userId", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(db, inviteOrgMember(db, org.id, "user-a", "bob", "member"));

    expect(
      db.memberships.some((m) => m.githubLogin === "bob" && !m.userId),
    ).toBe(true);
    claimInvite(db, "user-b", "bob");
    expect(db.memberships.find((m) => m.githubLogin === "bob")?.userId).toBe(
      "user-b",
    );
  });

  it("normalizes invite GitHub logins to lowercase when storing", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "@AliceDev", "member"),
    );
    const invited = db.memberships.find(
      (membership) => membership.githubLogin === "alicedev",
    );
    expect(invited).toMatchObject({
      githubLogin: "alicedev",
      role: "member",
    });
    expect(invited?.userId).toBeUndefined();
  });

  it("prevents removing the owner", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    const ownerId = db.memberships[0]!.id;
    expect(() => removeOrgMember(db, org.id, "user-a", ownerId)).toThrow(
      /owner/,
    );
  });

  it("lets an invited admin manage a shared team org (not only personal)", () => {
    const db = emptyWorkspaceSlice();
    seedOwnerOrg(db, "user-a", "alice");
    const team = applyOrg(
      db,
      createOrganization(db, {
        name: "Shared Team",
        creatorUserId: "user-a",
        githubLogin: "alice",
      }),
    );
    applyMembership(db, inviteOrgMember(db, team.id, "user-a", "bob", "admin"));
    claimInvite(db, "user-b", "bob");

    expect(userRoleInOrg(db, team.id, "user-b")).toBe("admin");
    expect(orgsForUser(db, "user-b").map((org) => org.id)).toContain(team.id);

    // Active org can be the shared team even though bob also has a personal org.
    seedOwnerOrg(db, "user-b", "bob");
    expect(resolveActiveOrgId(db, "user-b", team.id)).toBe(team.id);

    applyMembership(
      db,
      inviteOrgMember(db, team.id, "user-b", "carol", "member"),
    );
    expect(
      db.memberships.some(
        (membership) =>
          membership.orgId === team.id && membership.githubLogin === "carol",
      ),
    ).toBe(true);
  });

  it("creates named team orgs with unique slugs", () => {
    const db = emptyWorkspaceSlice();
    const first = createOrganization(db, {
      name: "Acme",
      creatorUserId: "user-a",
      githubLogin: "alice",
    });
    applyOrg(db, first);
    const second = createOrganization(db, {
      name: "Acme",
      creatorUserId: "user-a",
      githubLogin: "alice",
    });
    expect(first.org.slug).toBe("acme");
    expect(second.org.slug).toBe("acme-2");
    expect(
      [first.membership, second.membership].filter((m) => m.role === "owner"),
    ).toHaveLength(2);
  });

  it("changes a member role and rejects owner / invalid promotions", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    const invite = applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "bob", "viewer"),
    );

    const updated = changeOrgMemberRole(
      db,
      org.id,
      "user-a",
      invite.id,
      "admin",
    );
    expect(updated.role).toBe("admin");
    expect(invite.role).toBe("viewer");

    expect(() =>
      changeOrgMemberRole(db, org.id, "user-a", invite.id, "owner"),
    ).toThrow(/owner/);

    const ownerId = db.memberships.find((m) => m.role === "owner")!.id;
    expect(() =>
      changeOrgMemberRole(db, org.id, "user-a", ownerId, "member"),
    ).toThrow(/owner's role/);
  });

  it("lets admins revoke pending invites via remove", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(db, inviteOrgMember(db, org.id, "user-a", "bob", "admin"));
    claimInvite(db, "user-b", "bob");

    const pending = applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-b", "carol", "member"),
    );
    expect(pending.userId).toBeUndefined();

    removeOrgMember(db, org.id, "user-b", pending.id);
    // validate-only; caller would persist deleteMembershipIds
    db.memberships = db.memberships.filter(
      (membership) => membership.id !== pending.id,
    );
    expect(
      db.memberships.some((membership) => membership.githubLogin === "carol"),
    ).toBe(false);
  });

  it("exports and deletes org data as owner only", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    db.projects.push({
      id: "p1",
      name: "shop",
      source: "github",
      orgId: org.id,
      ownerUserId: "user-a",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    db.evidence.push({
      id: "e1",
      at: "2026-01-01T00:00:00.000Z",
      kind: "assessment_completed",
      summary: "ran",
      projectId: "p1",
    });
    applyMembership(db, inviteOrgMember(db, org.id, "user-a", "bob", "admin"));
    claimInvite(db, "user-b", "bob");

    expect(() => exportOrgData(db, org.id, "user-b")).toThrow(/owner/);
    const exported = exportOrgData(db, org.id, "user-a");
    expect(exported.projects).toHaveLength(1);
    expect(exported.evidence).toHaveLength(1);

    expect(() => deleteOrganization(db, org.id, "user-b")).toThrow(/owner/);
    const { deleteMembershipIds } = deleteOrganization(db, org.id, "user-a");
    expect(deleteMembershipIds.length).toBeGreaterThan(0);
    // Pure validate: in-memory db is unchanged; FK cascade + evidence append-only
    // are persistence concerns.
    expect(db.organizations.find((row) => row.id === org.id)).toBeDefined();
    expect(db.projects.find((project) => project.id === "p1")).toBeDefined();
    expect(db.evidence.find((entry) => entry.id === "e1")).toBeDefined();
  });

  it("denies admins inviting, changing, or removing other admins", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    const adminInvite = applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "bob", "admin"),
    );
    claimInvite(db, "user-b", "bob");

    expect(() =>
      inviteOrgMember(db, org.id, "user-b", "carol", "admin"),
    ).toThrow(/owners can invite or assign admins/);

    expect(() =>
      changeOrgMemberRole(db, org.id, "user-b", adminInvite.id, "member"),
    ).toThrow(/owners can change or remove admins/);

    const peer = applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "dana", "admin"),
    );
    expect(() => removeOrgMember(db, org.id, "user-b", peer.id)).toThrow(
      /owners can change or remove admins/,
    );

    // Admins may still manage members/viewers.
    const member = applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-b", "erin", "member"),
    );
    const updated = changeOrgMemberRole(
      db,
      org.id,
      "user-b",
      member.id,
      "viewer",
    );
    expect(updated.role).toBe("viewer");
    expect(member.role).toBe("member");
  });
});

describe("buildOrgMembershipIndex", () => {
  it("returns the same membership sets as filter scans", () => {
    const db = emptyWorkspaceSlice();
    const orgA = seedOwnerOrg(db, "user-a", "alice");
    const orgB = applyOrg(
      db,
      createOrganization(db, {
        name: "Team",
        creatorUserId: "user-b",
        githubLogin: "bob",
      }),
    );
    applyMembership(
      db,
      inviteOrgMember(db, orgA.id, "user-a", "bob", "member"),
    );
    const bobOnA = db.memberships.find(
      (m) => m.orgId === orgA.id && m.githubLogin === "bob",
    );
    if (bobOnA) bobOnA.userId = "user-b";

    const index = buildOrgMembershipIndex(db.memberships);
    const filterByOrg = (orgId: string) =>
      db.memberships.filter((m) => m.orgId === orgId);
    const filterByUser = (userId: string) =>
      db.memberships.filter((m) => m.userId === userId);

    expect(index.byOrgId.get(orgA.id)).toEqual(filterByOrg(orgA.id));
    expect(index.byOrgId.get(orgB.id)).toEqual(filterByOrg(orgB.id));
    expect(index.byUserId.get("user-a")).toEqual(filterByUser("user-a"));
    expect(index.byUserId.get("user-b")).toEqual(filterByUser("user-b"));
  });
});

describe("leaveOrgMember", () => {
  it("returns the caller's membership id for removal", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(db, inviteOrgMember(db, org.id, "user-a", "bob", "member"));
    claimInvite(db, "user-b", "bob");

    expect(leaveOrgMember(db, org.id, "user-b")).toEqual({
      removedMembershipId: expect.any(String),
    });
  });

  it("blocks the last owner while other members remain", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(db, inviteOrgMember(db, org.id, "user-a", "bob", "member"));
    claimInvite(db, "user-b", "bob");

    expect(() => leaveOrgMember(db, org.id, "user-a")).toThrow(
      /last owner/,
    );
  });

  it("lets an owner leave when another owner remains", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    db.memberships.push({
      id: "m-zoe",
      orgId: org.id,
      role: "owner",
      userId: "user-zoe",
      githubLogin: "zoe",
      createdAt: new Date().toISOString(),
    });

    expect(leaveOrgMember(db, org.id, "user-a").removedMembershipId).toBe(
      db.memberships[0]!.id,
    );
  });

  it("blocks the sole member and strangers", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");

    expect(() => leaveOrgMember(db, org.id, "user-a")).toThrow(
      /last member/,
    );
    expect(() => leaveOrgMember(db, org.id, "ghost")).toThrow(
      /not a member/,
    );
  });
});

describe("findOrgMembershipByLogin", () => {
  it("matches case-insensitively and tolerates @", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "Bob", "member"),
    );

    expect(findOrgMembershipByLogin(db, org.id, "@BOB")?.role).toBe("member");
    expect(findOrgMembershipByLogin(db, org.id, "carol")).toBeUndefined();
  });
});
