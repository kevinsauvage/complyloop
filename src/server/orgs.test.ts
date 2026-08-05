import { describe, expect, it } from "vitest";
import type { Db } from "./db";
import {
  claimMembershipsForLogin,
  ensurePersonalOrg,
  inviteOrgMember,
  removeOrgMember,
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
      rootPath: "/tmp/shop",
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
});
