import { describe, expect, it } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import { testProject } from "@/test-fixtures/project";

import { canOnProject, isOrgRole, roleHasPermission } from "./rbac";

const project = testProject({ orgId: "org-1", name: "shop" });

function membership(
  role: OrgMembership["role"],
  userId: string,
): OrgMembership {
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
        expect(roleHasPermission(role, permission)).toBe(expected[role][index]);
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

  it("denies org projects without a matching membership", () => {
    expect(canOnProject(project, [], null, "project.view")).toBe(false);
    expect(canOnProject(project, [], "stranger", "project.view")).toBe(false);
    expect(canOnProject(project, [], "owner-1", "project.view")).toBe(false);
  });

  it("validates org role strings", () => {
    expect(isOrgRole("admin")).toBe(true);
    expect(isOrgRole("viewer")).toBe(true);
    expect(isOrgRole("superuser")).toBe(false);
    expect(isOrgRole(42)).toBe(false);
  });
});
