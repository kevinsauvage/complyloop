import type { OrgMembership, Organization, Project } from "@/core/types";
import { canOnProject, type Permission } from "@/core/rbac";

export interface AccessContext {
  userId: string | null | undefined;
  githubLogin?: string | null;
  organizations: ReadonlyArray<Organization>;
  memberships: ReadonlyArray<OrgMembership>;
}

/**
 * Sample and unowned demo projects (no org) stay visible without sign-in.
 * Org-scoped projects require membership (or legacy connector ownership).
 */
export function isProjectVisible(
  project: Project,
  ctx: AccessContext,
): boolean {
  return canOnProject(
    project,
    ctx.memberships,
    ctx.userId,
    "project.view",
  );
}

export function visibleProjects(
  projects: ReadonlyArray<Project>,
  ctx: AccessContext,
): Project[] {
  return projects.filter((project) => isProjectVisible(project, ctx));
}

/**
 * Picks the active project among visible ones, preferring the current id when
 * still allowed, otherwise sample, otherwise the first visible project.
 */
export function resolveActiveProject(
  projects: ReadonlyArray<Project>,
  activeProjectId: string | null | undefined,
  ctx: AccessContext,
): Project | undefined {
  const visible = visibleProjects(projects, ctx);
  if (visible.length === 0) return undefined;

  const preferred = visible.find((project) => project.id === activeProjectId);
  if (preferred) return preferred;

  const sample = visible.find((project) => project.source === "sample");
  return sample ?? visible[0];
}

export function assertProjectPermission(
  project: Project,
  ctx: AccessContext,
  permission: Permission,
): void {
  if (!canOnProject(project, ctx.memberships, ctx.userId, permission)) {
    throw new Error(`Not allowed: missing permission ${permission}.`);
  }
}
