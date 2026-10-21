import { describe, expect, it } from "vitest";

import type {
  Organization,
  OrgMembership,
} from "@complyloop/analysis-core/contract/project-types";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { emptyWorkspaceSlice } from "@complyloop/db/types";

import { testFinding } from "@/test-fixtures/finding";
import { testRemediation } from "@/test-fixtures/remediation";

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
  roleInOrg,
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
    createOrganization({ name, creatorUserId: userId, githubLogin }),
  );
}

/** GitHub numeric ids the fixtures' invitees resolve to (= their user id). */
const GITHUB_IDS: Record<string, string> = {
  bob: "user-b",
  carol: "user-c",
  dana: "user-d",
  erin: "user-e",
  alicedev: "user-alicedev",
};

function githubIdFor(login: string): string {
  const id = GITHUB_IDS[login.replace(/^@/, "").toLowerCase()];
  if (!id) throw new Error(`No fixture GitHub id for ${login}`);
  return id;
}

/** Test fixture: bind pending invites to the user (mirrors DB claimMembershipsForUser). */
function claimInvite(db: WorkspaceSlice, userId: string): void {
  for (const membership of db.memberships) {
    if (membership.githubUserId === userId && !membership.userId) {
      membership.userId = userId;
    }
  }
}

describe("orgs", () => {
  it("leaves pending invites unclaimed until DB provision attaches userId", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "bob",
        "member",
        githubIdFor("bob"),
      ),
    );

    expect(
      db.memberships.some((m) => m.githubLogin === "bob" && !m.userId),
    ).toBe(true);
    claimInvite(db, "user-b");
    expect(db.memberships.find((m) => m.githubLogin === "bob")?.userId).toBe(
      "user-b",
    );
  });

  it("refuses a login held by another GitHub account instead of changing its role", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "bob", "member", "user-b"),
    );
    claimInvite(db, "user-b");

    // GitHub released the login: a new account now holds it, with a new id.
    expect(() =>
      inviteOrgMember(db, org.id, "user-a", "bob", "admin", "user-recycled"),
    ).toThrow(/already a member .* as another GitHub account/);
    expect(db.memberships.find((m) => m.githubLogin === "bob")?.role).toBe(
      "member",
    );
  });

  it("binds a legacy unclaimed invite to the resolved GitHub id", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    db.memberships.push({
      id: "m-legacy",
      orgId: org.id,
      role: "member",
      githubLogin: "bob",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const invited = inviteOrgMember(
      db,
      org.id,
      "user-a",
      "bob",
      "member",
      "user-b",
    );

    expect(invited).toMatchObject({ id: "m-legacy", githubUserId: "user-b" });
  });

  it("normalizes invite GitHub logins to lowercase when storing", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "@AliceDev",
        "member",
        githubIdFor("@AliceDev"),
      ),
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
      createOrganization({
        name: "Shared Team",
        creatorUserId: "user-a",
        githubLogin: "alice",
      }),
    );
    applyMembership(
      db,
      inviteOrgMember(
        db,
        team.id,
        "user-a",
        "bob",
        "admin",
        githubIdFor("bob"),
      ),
    );
    claimInvite(db, "user-b");

    expect(
      roleInOrg(buildOrgMembershipIndex(db.memberships), team.id, "user-b"),
    ).toBe("admin");
    expect(orgsForUser(db, "user-b").map((org) => org.id)).toContain(team.id);

    // Active org can be the shared team even though bob also has a personal org.
    seedOwnerOrg(db, "user-b", "bob");
    expect(resolveActiveOrgId(db, "user-b", team.id)).toBe(team.id);

    applyMembership(
      db,
      inviteOrgMember(
        db,
        team.id,
        "user-b",
        "carol",
        "member",
        githubIdFor("carol"),
      ),
    );
    expect(
      db.memberships.some(
        (membership) =>
          membership.orgId === team.id && membership.githubLogin === "carol",
      ),
    ).toBe(true);
  });

  it("creates named team orgs with a slug base and one owner each", () => {
    const first = createOrganization({
      name: "Acme",
      creatorUserId: "user-a",
      githubLogin: "alice",
    });
    const second = createOrganization({
      name: "Acme",
      creatorUserId: "user-a",
      githubLogin: "alice",
    });
    // Global uniqueness is allocated at insert (`insertOrganization`, test:db).
    expect(first.org.slug).toBe("acme");
    expect(second.org.slug).toBe("acme");
    expect(first.org.id).not.toBe(second.org.id);
    expect(
      [first.membership, second.membership].filter((m) => m.role === "owner"),
    ).toHaveLength(2);
  });

  it("changes a member role and rejects owner / invalid promotions", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    const invite = applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "bob",
        "viewer",
        githubIdFor("bob"),
      ),
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
    applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "bob", "admin", githubIdFor("bob")),
    );
    claimInvite(db, "user-b");

    const pending = applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-b",
        "carol",
        "member",
        githubIdFor("carol"),
      ),
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
    applyMembership(
      db,
      inviteOrgMember(db, org.id, "user-a", "bob", "admin", githubIdFor("bob")),
    );
    claimInvite(db, "user-b");

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
      inviteOrgMember(db, org.id, "user-a", "bob", "admin", githubIdFor("bob")),
    );
    claimInvite(db, "user-b");

    expect(() =>
      inviteOrgMember(
        db,
        org.id,
        "user-b",
        "carol",
        "admin",
        githubIdFor("carol"),
      ),
    ).toThrow(/owners can invite or assign admins/);

    expect(() =>
      changeOrgMemberRole(db, org.id, "user-b", adminInvite.id, "member"),
    ).toThrow(/owners can change or remove admins/);

    const peer = applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "dana",
        "admin",
        githubIdFor("dana"),
      ),
    );
    expect(() => removeOrgMember(db, org.id, "user-b", peer.id)).toThrow(
      /owners can change or remove admins/,
    );

    // Admins may still manage members/viewers.
    const member = applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-b",
        "erin",
        "member",
        githubIdFor("erin"),
      ),
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
      createOrganization({
        name: "Team",
        creatorUserId: "user-b",
        githubLogin: "bob",
      }),
    );
    applyMembership(
      db,
      inviteOrgMember(
        db,
        orgA.id,
        "user-a",
        "bob",
        "member",
        githubIdFor("bob"),
      ),
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
    applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "bob",
        "member",
        githubIdFor("bob"),
      ),
    );
    claimInvite(db, "user-b");

    expect(leaveOrgMember(db, org.id, "user-b")).toEqual({
      removedMembershipId: expect.any(String),
    });
  });

  it("blocks the last owner while other members remain", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "bob",
        "member",
        githubIdFor("bob"),
      ),
    );
    claimInvite(db, "user-b");

    expect(() => leaveOrgMember(db, org.id, "user-a")).toThrow(/last owner/);
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

    expect(() => leaveOrgMember(db, org.id, "user-a")).toThrow(/last member/);
    expect(() => leaveOrgMember(db, org.id, "ghost")).toThrow(/not a member/);
  });
});

describe("createOrganization validation", () => {
  it("rejects blank names and logins", () => {
    expect(() =>
      createOrganization({
        name: "   ",
        creatorUserId: "user-a",
        githubLogin: "alice",
      }),
    ).toThrow(/name is required/);
    expect(() =>
      createOrganization({
        name: "Acme",
        creatorUserId: "user-a",
        githubLogin: "  ",
      }),
    ).toThrow(/login is required/);
  });
});

describe("exportOrgData scoping", () => {
  function seedOrgWithHistory(db: WorkspaceSlice): Organization {
    const org = seedOwnerOrg(db, "user-a", "alice");
    const other: Organization = {
      id: "org-other",
      name: "Other",
      slug: "other",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    db.organizations.push(other);
    for (const [id, orgId] of [
      ["p1", org.id],
      ["p2", other.id],
    ] as const) {
      db.projects.push({
        id,
        name: id,
        source: "github",
        orgId,
        ownerUserId: "user-a",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      db.findings.push(testFinding({ id: `f-${id}`, projectId: id }));
      db.requirements.push({
        id: `req-${id}`,
        projectId: id,
        controlId: "ctl-img-alt",
        status: "failed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      db.assessments.push({
        id: `a-${id}`,
        projectId: id,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        filesScanned: 1,
        summary: {
          passed: 0,
          failed: 1,
          needs_review: 0,
          not_applicable: 0,
          unable_to_verify: 0,
        },
      });
      db.remediations.push(
        testRemediation({ id: `r-${id}`, findingId: `f-${id}` }),
      );
      db.evidence.push({
        id: `e-${id}`,
        at: "2026-01-01T00:00:00.000Z",
        kind: "assessment_completed",
        summary: "ran",
        projectId: id,
      });
      db.alerts.push({
        id: `al-${id}`,
        projectId: id,
        kind: "compliance_regression",
        summary: "regression",
        at: "2026-01-01T00:00:00.000Z",
        read: false,
      });
    }
    return org;
  }

  it("exports only the org's own project history", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOrgWithHistory(db);
    applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "erin",
        "member",
        githubIdFor("erin"),
      ),
    );
    const exported = exportOrgData(db, org.id, "user-a") as Record<
      string,
      Array<{ id: string; userId?: string | null }>
    >;
    const idsOf = (key: string): string[] =>
      (exported[key] as Array<{ id: string }>).map((row) => row.id);
    expect(idsOf("projects")).toEqual(["p1"]);
    expect(idsOf("requirements")).toEqual(["req-p1"]);
    expect(idsOf("assessments")).toEqual(["a-p1"]);
    expect(idsOf("findings")).toEqual(["f-p1"]);
    expect(idsOf("remediations")).toEqual(["r-p1"]);
    expect(idsOf("evidence")).toEqual(["e-p1"]);
    expect(idsOf("alerts")).toEqual(["al-p1"]);
    const memberships = (exported as Record<string, Array<unknown>>)
      .memberships as Array<{ githubLogin: string; userId: string | null }>;
    expect(
      memberships.find((m) => m.githubLogin === "erin")?.userId,
    ).toBeNull();
    expect(exported.evidenceTruncated).toBe(false);
  });

  it("flags truncated evidence projects", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOrgWithHistory(db);
    const exported = exportOrgData(db, org.id, "user-a", {
      evidenceTruncatedProjectIds: ["p1"],
    });
    expect(exported.evidenceTruncated).toBe(true);
    expect(exported.evidenceTruncatedProjectIds).toEqual(["p1"]);
  });

  it("flags projects whose findings were windowed", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOrgWithHistory(db);
    const exported = exportOrgData(db, org.id, "user-a", {
      findingsTruncatedProjectIds: ["p1"],
    });
    expect(exported.findingsTruncated).toBe(true);
    expect(exported.findingsTruncatedProjectIds).toEqual(["p1"]);
  });

  it("throws when the org row is missing", () => {
    const db = emptyWorkspaceSlice();
    db.memberships.push({
      id: "m-ghost",
      orgId: "org-missing",
      role: "owner",
      userId: "user-a",
      githubLogin: "alice",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(() => exportOrgData(db, "org-missing", "user-a")).toThrow(
      /not found/,
    );
    expect(() => deleteOrganization(db, "org-missing", "user-a")).toThrow(
      /not found/,
    );
  });
});

describe("resolveActiveOrgId fallbacks", () => {
  it("falls back to the personal owner org when the preference is foreign", () => {
    const db = emptyWorkspaceSlice();
    const personal = seedOwnerOrg(db, "user-a", "alice");
    const team = applyOrg(
      db,
      createOrganization({
        name: "Team",
        creatorUserId: "user-b",
        githubLogin: "bob",
      }),
    );
    expect(resolveActiveOrgId(db, "user-a", team.id)).toBe(personal.id);
  });

  it("returns undefined for strangers", () => {
    const db = emptyWorkspaceSlice();
    seedOwnerOrg(db, "user-a", "alice");
    expect(resolveActiveOrgId(db, "ghost", null)).toBeUndefined();
    expect(orgsForUser(db, "ghost")).toEqual([]);
  });
});

describe("findOrgMembershipByLogin", () => {
  it("matches case-insensitively and tolerates @", () => {
    const db = emptyWorkspaceSlice();
    const org = seedOwnerOrg(db, "user-a", "alice");
    applyMembership(
      db,
      inviteOrgMember(
        db,
        org.id,
        "user-a",
        "Bob",
        "member",
        githubIdFor("Bob"),
      ),
    );

    expect(findOrgMembershipByLogin(db, org.id, "@BOB")?.role).toBe("member");
    expect(findOrgMembershipByLogin(db, org.id, "carol")).toBeUndefined();
  });
});
