import "server-only";

import type {
  Organization,
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { canOnProject, type Permission } from "@/core/rbac";

export interface AccessContext {
  userId: string | null | undefined;
  githubLogin?: string | null;
  organizations: ReadonlyArray<Organization>;
  memberships: ReadonlyArray<OrgMembership>;
}

/** Builds AccessContext from the in-memory store collections. */
export function accessFromStore(
  store: {
    organizations: ReadonlyArray<Organization>;
    memberships: ReadonlyArray<OrgMembership>;
  },
  userId: string | null | undefined,
  githubLogin?: string | null,
): AccessContext {
  return {
    userId,
    githubLogin,
    organizations: store.organizations,
    memberships: store.memberships,
  };
}

/** Project visibility requires org membership. */
export function isProjectVisible(
  project: Project,
  ctx: AccessContext,
): boolean {
  return canOnProject(project, ctx.memberships, ctx.userId, "project.view");
}

export function visibleProjects(
  projects: ReadonlyArray<Project>,
  ctx: AccessContext,
): Project[] {
  return projects.filter((project) => isProjectVisible(project, ctx));
}

export function assertProjectPermission(
  project: Project,
  ctx: AccessContext,
  permission: Permission,
): void {
  if (!canOnProject(project, ctx.memberships, ctx.userId, permission)) {
    throw new PublicError(`Not allowed: missing permission ${permission}.`);
  }
}
