import { describe, expect, it } from "vitest";
import type {
  OrgMembership,
  Organization,
} from "@complyloop/analysis-core/contract/project-types";
import { emptyDb } from "@complyloop/db/types";
import {
  claimMembershipsForLogin,
  changeOrgMemberRole,
  createOrganization,
  deleteOrganization,
  ensurePersonalOrg,
  exportOrgData,
  inviteOrgMember,
  orgsForUser,
  removeOrgMember,
  resolveActiveOrgId,
  userRoleInOrg,
} from "./orgs";
import type { Db } from "./db";

function applyMembership(db: Db, membership: OrgMembership): OrgMembership {
  const index = db.memberships.findIndex((row) => row.id === membership.id);
  if (index >= 0) {
    db.memberships[index] = membership;
  } else {
    db.memberships.push(membership);
  }
  return membership;
}

function applyOrg(
  db: Db,
  created: { org: Organization; membership: OrgMembership },
): Organization {
  db.organizations.push(created.org);
  db.memberships.push(created.membership);
  return created.org;
}

describe("orgs", () => {
  it("creates a personal org for a new user", () => {
    const db = emptyDb();

    const { org, changed } = ensurePersonalOrg(db, "user-a", "alice");
    expect(changed).toBe(true);
    expect(org.slug).toBe("alice");
    expect(db.memberships[0]?.role).toBe("owner");

    const again = ensurePersonalOrg(db, "user-a", "alice");
    expect(again.changed).toBe(false);
    expect(again.org.id).toBe(org.id);
  });

  it("claims invites by GitHub login on sign-in", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    applyMembership(db, inviteOrgMember(db, orgId, "user-a", "bob", "member"));

    expect(db.memberships.some((m) => m.githubLogin === "bob" && !m.userId)).toBe(
      true,
    );
    expect(claimMembershipsForLogin(db, "user-b", "bob")).toBe(true);
    expect(
      db.memberships.find((m) => m.githubLogin === "bob")?.userId,
    ).toBe("user-b");
  });

  it("prevents removing the owner", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    const ownerId = db.memberships[0]!.id;
    expect(() => removeOrgMember(db, orgId, "user-a", ownerId)).toThrow(
      /owner/,
    );
  });

  it("lets an invited admin manage a shared team org (not only personal)", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const team = applyOrg(
      db,
      createOrganization(db, {
        name: "Shared Team",
        creatorUserId: "user-a",
        githubLogin: "alice",
      }),
    );
    applyMembership(db, inviteOrgMember(db, team.id, "user-a", "bob", "admin"));
    claimMembershipsForLogin(db, "user-b", "bob");

    expect(userRoleInOrg(db, team.id, "user-b")).toBe("admin");
    expect(orgsForUser(db, "user-b").map((org) => org.id)).toContain(team.id);

    // Active org can be the shared team even though bob also has a personal org.
    ensurePersonalOrg(db, "user-b", "bob");
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
    const db = emptyDb();
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
    expect([first.membership, second.membership].filter((m) => m.role === "owner")).toHaveLength(2);
  });

  it("changes a member role and rejects owner / invalid promotions", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    const invite = applyMembership(
      db,
      inviteOrgMember(db, orgId, "user-a", "bob", "viewer"),
    );

    const updated = changeOrgMemberRole(
      db,
      orgId,
      "user-a",
      invite.id,
      "admin",
    );
    expect(updated.role).toBe("admin");
    expect(invite.role).toBe("viewer");

    expect(() =>
      changeOrgMemberRole(db, orgId, "user-a", invite.id, "owner"),
    ).toThrow(/owner/);

    const ownerId = db.memberships.find((m) => m.role === "owner")!.id;
    expect(() =>
      changeOrgMemberRole(db, orgId, "user-a", ownerId, "member"),
    ).toThrow(/owner's role/);
  });

  it("lets admins revoke pending invites via remove", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    applyMembership(db, inviteOrgMember(db, orgId, "user-a", "bob", "admin"));
    claimMembershipsForLogin(db, "user-b", "bob");

    const pending = applyMembership(
      db,
      inviteOrgMember(db, orgId, "user-b", "carol", "member"),
    );
    expect(pending.userId).toBeUndefined();

    removeOrgMember(db, orgId, "user-b", pending.id);
    // validate-only; caller would persist deleteMembershipIds
    db.memberships = db.memberships.filter(
      (membership) => membership.id !== pending.id,
    );
    expect(
      db.memberships.some((membership) => membership.githubLogin === "carol"),
    ).toBe(false);
  });

  it("exports and deletes org data as owner only", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    db.projects.push({
      id: "p1",
      name: "shop",
      source: "github",
      orgId,
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
    applyMembership(db, inviteOrgMember(db, orgId, "user-a", "bob", "admin"));
    claimMembershipsForLogin(db, "user-b", "bob");

    expect(() => exportOrgData(db, orgId, "user-b")).toThrow(/owner/);
    const exported = exportOrgData(db, orgId, "user-a");
    expect(exported.projects).toHaveLength(1);
    expect(exported.evidence).toHaveLength(1);

    expect(() => deleteOrganization(db, orgId, "user-b")).toThrow(/owner/);
    const { deleteMembershipIds } = deleteOrganization(db, orgId, "user-a");
    expect(deleteMembershipIds.length).toBeGreaterThan(0);
    // Pure validate: in-memory db is unchanged; FK cascade + evidence append-only
    // are persistence concerns.
    expect(db.organizations.find((org) => org.id === orgId)).toBeDefined();
    expect(db.projects.find((project) => project.id === "p1")).toBeDefined();
    expect(db.evidence.find((entry) => entry.id === "e1")).toBeDefined();
  });

  it("denies admins inviting, changing, or removing other admins", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    const adminInvite = applyMembership(
      db,
      inviteOrgMember(db, orgId, "user-a", "bob", "admin"),
    );
    claimMembershipsForLogin(db, "user-b", "bob");

    expect(() =>
      inviteOrgMember(db, orgId, "user-b", "carol", "admin"),
    ).toThrow(/owners can invite or assign admins/);

    expect(() =>
      changeOrgMemberRole(db, orgId, "user-b", adminInvite.id, "member"),
    ).toThrow(/owners can change or remove admins/);

    const peer = applyMembership(
      db,
      inviteOrgMember(db, orgId, "user-a", "dana", "admin"),
    );
    expect(() => removeOrgMember(db, orgId, "user-b", peer.id)).toThrow(
      /owners can change or remove admins/,
    );

    // Admins may still manage members/viewers.
    const member = applyMembership(
      db,
      inviteOrgMember(db, orgId, "user-b", "erin", "member"),
    );
    const updated = changeOrgMemberRole(db, orgId, "user-b", member.id, "viewer");
    expect(updated.role).toBe("viewer");
    expect(member.role).toBe("member");
  });
});
