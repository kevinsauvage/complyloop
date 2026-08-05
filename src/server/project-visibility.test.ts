import { describe, expect, it } from "vitest";
import type { OrgMembership, Organization, Project } from "@/core/types";
import {
  type AccessContext,
  isProjectVisible,
  resolveActiveProject,
  visibleProjects,
} from "./project-visibility";

function project(
  partial: Pick<Project, "id" | "source"> &
    Partial<Pick<Project, "ownerUserId" | "orgId" | "name">>,
): Project {
  return {
    name: partial.name ?? partial.id,
    rootPath: `/tmp/${partial.id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function ctx(
  userId: string | null | undefined,
  memberships: OrgMembership[] = [],
  organizations: Organization[] = [],
): AccessContext {
  return { userId, memberships, organizations };
}

describe("project visibility", () => {
  const sample = project({ id: "sample", source: "sample" });
  const local = project({ id: "local", source: "local" });
  const aliceLegacy = project({
    id: "alice-repo",
    source: "github",
    ownerUserId: "user-a",
  });
  const bobLegacy = project({
    id: "bob-repo",
    source: "github",
    ownerUserId: "user-b",
  });
  const orgProject = project({
    id: "org-repo",
    source: "github",
    orgId: "org-1",
    ownerUserId: "user-a",
  });
  const membership: OrgMembership = {
    id: "m1",
    orgId: "org-1",
    role: "member",
    userId: "user-b",
    githubLogin: "bob",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("shows unowned projects to everyone", () => {
    expect(isProjectVisible(sample, ctx(null))).toBe(true);
    expect(isProjectVisible(local, ctx(undefined))).toBe(true);
  });

  it("hides other users' legacy GitHub projects", () => {
    expect(isProjectVisible(aliceLegacy, ctx("user-b"))).toBe(false);
    expect(isProjectVisible(aliceLegacy, ctx(null))).toBe(false);
    expect(isProjectVisible(aliceLegacy, ctx("user-a"))).toBe(true);
  });

  it("requires org membership for org-scoped projects", () => {
    expect(isProjectVisible(orgProject, ctx("user-b"))).toBe(false);
    expect(
      isProjectVisible(orgProject, ctx("user-b", [membership])),
    ).toBe(true);
    expect(isProjectVisible(orgProject, ctx("user-a"))).toBe(true);
  });

  it("filters the switcher list for the signed-in user", () => {
    const all = [sample, local, aliceLegacy, bobLegacy];
    expect(visibleProjects(all, ctx(null)).map((p) => p.id)).toEqual([
      "sample",
      "local",
    ]);
    expect(visibleProjects(all, ctx("user-a")).map((p) => p.id)).toEqual([
      "sample",
      "local",
      "alice-repo",
    ]);
  });

  it("falls back to sample when the active project is not visible", () => {
    const resolved = resolveActiveProject(
      [sample, aliceLegacy, bobLegacy],
      bobLegacy.id,
      ctx("user-a"),
    );
    expect(resolved?.id).toBe("sample");
  });
});
