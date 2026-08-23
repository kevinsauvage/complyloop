import { describe, expect, it } from "vitest";
import { canOnProject, isOrgRole, roleHasPermission } from "./rbac";
import type { OrgMembership, Project } from "./project-types";

const project: Project = {
  id: "p1",
  name: "shop",
  source: "github",
  orgId: "org-1",
  ownerUserId: "owner-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function membership(role: OrgMembership["role"], userId: string): OrgMembership {
  return {
    id: `m-${userId}`,
    orgId: "org-1",
    role,
    userId,
    githubLogin: userId,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("rbac", () => {
  it("maps roles to permissions", () => {
    expect(roleHasPermission("viewer", "project.view")).toBe(true);
    expect(roleHasPermission("viewer", "project.assess")).toBe(false);
    expect(roleHasPermission("member", "project.remediate")).toBe(true);
    expect(roleHasPermission("member", "project.connect")).toBe(false);
    expect(roleHasPermission("admin", "org.manage_members")).toBe(true);
  });

  it("covers the role × permission matrix for project actions", () => {
    const roles = ["viewer", "member", "admin", "owner"] as const;
    const permissions = [
      "project.view",
      "project.assess",
      "project.remediate",
      "project.connect",
      "org.manage_members",
    ] as const;
    const expected: Record<(typeof roles)[number], boolean[]> = {
      viewer: [true, false, false, false, false],
      member: [true, true, true, false, false],
      admin: [true, true, true, true, true],
      owner: [true, true, true, true, true],
    };
    for (const role of roles) {
      for (const [index, permission] of permissions.entries()) {
        expect(roleHasPermission(role, permission)).toBe(
          expected[role][index],
        );
      }
    }
  });

  it("allows members to assess but not connect", () => {
    const memberships = [membership("member", "u1")];
    expect(canOnProject(project, memberships, "u1", "project.assess")).toBe(
      true,
    );
    expect(canOnProject(project, memberships, "u1", "project.connect")).toBe(
      false,
    );
  });

  it("keeps demo projects open without an org", () => {
    const demo: Project = { ...project, orgId: undefined, ownerUserId: undefined };
    expect(canOnProject(demo, [], null, "project.view")).toBe(true);
    expect(canOnProject(demo, [], null, "project.connect")).toBe(false);
    expect(canOnProject(demo, [], null, "org.manage_members")).toBe(false);
  });

  it("restricts unscoped owned projects to the owner", () => {
    const owned: Project = {
      ...project,
      orgId: undefined,
      ownerUserId: "owner-1",
    };
    expect(canOnProject(owned, [], "owner-1", "project.assess")).toBe(true);
    expect(canOnProject(owned, [], "owner-1", "org.manage_members")).toBe(
      false,
    );
    expect(canOnProject(owned, [], "other", "project.view")).toBe(false);
    expect(canOnProject(owned, [], null, "project.view")).toBe(false);
  });

  it("denies org projects without a matching membership or legacy owner", () => {
    expect(canOnProject(project, [], null, "project.view")).toBe(false);
    expect(canOnProject(project, [], "stranger", "project.view")).toBe(false);
  });

  it("lets the legacy connector retain access while org membership is missing", () => {
    expect(canOnProject(project, [], "owner-1", "project.assess")).toBe(true);
    expect(canOnProject(project, [], "owner-1", "org.manage_members")).toBe(
      false,
    );
  });

  it("validates org role strings", () => {
    expect(isOrgRole("admin")).toBe(true);
    expect(isOrgRole("viewer")).toBe(true);
    expect(isOrgRole("superuser")).toBe(false);
    expect(isOrgRole(42)).toBe(false);
  });
});
