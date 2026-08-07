import { describe, expect, it } from "vitest";
import type { Db } from "./db";
import {
  claimMembershipsForLogin,
  changeOrgMemberRole,
  createOrganization,
  ensurePersonalOrg,
  inviteOrgMember,
  orgsForUser,
  removeOrgMember,
  resolveActiveOrgId,
  userRoleInOrg,
} from "./orgs";

function emptyDb(): Db {
  return {
    frameworks: [],
    controls: [],
    organizations: [],
    memberships: [],
    projects: [],
    activeProjectId: null,
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}

describe("orgs", () => {
  it("creates a personal org and migrates legacy projects", () => {
    const db = emptyDb();
    db.projects.push({
      id: "gh-1",
      name: "shop",
      source: "github",
      ownerUserId: "user-a",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const { org, changed } = ensurePersonalOrg(db, "user-a", "alice");
    expect(changed).toBe(true);
    expect(org.slug).toBe("alice");
    expect(db.memberships[0]?.role).toBe("owner");
    expect(db.projects[0]?.orgId).toBe(org.id);

    const again = ensurePersonalOrg(db, "user-a", "alice");
    expect(again.changed).toBe(false);
    expect(again.org.id).toBe(org.id);
  });

  it("claims invites by GitHub login on sign-in", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    inviteOrgMember(db, orgId, "user-a", "bob", "member");

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
    const team = createOrganization(db, {
      name: "Shared Team",
      creatorUserId: "user-a",
      githubLogin: "alice",
    });
    inviteOrgMember(db, team.id, "user-a", "bob", "admin");
    claimMembershipsForLogin(db, "user-b", "bob");

    expect(userRoleInOrg(db, team.id, "user-b")).toBe("admin");
    expect(orgsForUser(db, "user-b").map((org) => org.id)).toContain(team.id);

    // Active org can be the shared team even though bob also has a personal org.
    ensurePersonalOrg(db, "user-b", "bob");
    expect(resolveActiveOrgId(db, "user-b", team.id)).toBe(team.id);

    inviteOrgMember(db, team.id, "user-b", "carol", "member");
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
    const second = createOrganization(db, {
      name: "Acme",
      creatorUserId: "user-a",
      githubLogin: "alice",
    });
    expect(first.slug).toBe("acme");
    expect(second.slug).toBe("acme-2");
    expect(db.memberships.filter((m) => m.role === "owner")).toHaveLength(2);
  });

  it("changes a member role and rejects owner / invalid promotions", () => {
    const db = emptyDb();
    ensurePersonalOrg(db, "user-a", "alice");
    const orgId = db.organizations[0]!.id;
    const invite = inviteOrgMember(db, orgId, "user-a", "bob", "viewer");

    const updated = changeOrgMemberRole(
      db,
      orgId,
      "user-a",
      invite.id,
      "admin",
    );
    expect(updated.role).toBe("admin");

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
    inviteOrgMember(db, orgId, "user-a", "bob", "admin");
    claimMembershipsForLogin(db, "user-b", "bob");

    const pending = inviteOrgMember(db, orgId, "user-b", "carol", "member");
    expect(pending.userId).toBeUndefined();

    removeOrgMember(db, orgId, "user-b", pending.id);
    expect(
      db.memberships.some((membership) => membership.githubLogin === "carol"),
    ).toBe(false);
  });
});
