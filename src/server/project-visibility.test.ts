import { describe, expect, it } from "vitest";
import type { Project } from "@/core/types";
import {
  isProjectVisible,
  resolveActiveProject,
  visibleProjects,
} from "./project-visibility";

function project(
  partial: Pick<Project, "id" | "source"> &
    Partial<Pick<Project, "ownerUserId" | "name">>,
): Project {
  return {
    name: partial.name ?? partial.id,
    rootPath: `/tmp/${partial.id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("project visibility", () => {
  const sample = project({ id: "sample", source: "sample" });
  const local = project({ id: "local", source: "local" });
  const alice = project({
    id: "alice-repo",
    source: "github",
    ownerUserId: "user-a",
  });
  const bob = project({
    id: "bob-repo",
    source: "github",
    ownerUserId: "user-b",
  });

  it("shows unowned projects to everyone", () => {
    expect(isProjectVisible(sample, null)).toBe(true);
    expect(isProjectVisible(local, undefined)).toBe(true);
  });

  it("hides other users' GitHub projects", () => {
    expect(isProjectVisible(alice, "user-b")).toBe(false);
    expect(isProjectVisible(alice, null)).toBe(false);
    expect(isProjectVisible(alice, "user-a")).toBe(true);
  });

  it("filters the switcher list for the signed-in user", () => {
    const all = [sample, local, alice, bob];
    expect(visibleProjects(all, null).map((p) => p.id)).toEqual([
      "sample",
      "local",
    ]);
    expect(visibleProjects(all, "user-a").map((p) => p.id)).toEqual([
      "sample",
      "local",
      "alice-repo",
    ]);
  });

  it("falls back to sample when the active project is not visible", () => {
    const resolved = resolveActiveProject(
      [sample, alice, bob],
      bob.id,
      "user-a",
    );
    expect(resolved?.id).toBe("sample");
  });
});
