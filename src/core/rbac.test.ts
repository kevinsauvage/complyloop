import { describe, expect, it } from "vitest";
import { canOnProject, roleHasPermission } from "./rbac";
import type { OrgMembership, Project } from "./types";

const project: Project = {
  id: "p1",
  name: "shop",
  rootPath: "/tmp/shop",
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
  });
});
