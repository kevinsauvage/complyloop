import type { Project } from "@/core/project-types";

/** Default org-scoped project for server/core tests. */
export function testProject(partial: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Shop",
    source: "github",
    orgId: "org-test",
    ownerUserId: "owner-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}
