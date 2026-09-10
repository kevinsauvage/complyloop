import type { OrgMembership, Organization, Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import { type EvidenceRecord, type Finding } from "@complyloop/db/types";
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

/** Generic project-id filter (single source for per-entity helpers). */
export function rowsForProject<T extends { projectId?: string }>(
  rows: ReadonlyArray<T>,
  projectId: string,
): T[] {
  return rows.filter((row) => row.projectId === projectId);
}

/** Evidence rows belonging to a single project (export / report / evidence UI). */
export function evidenceForProject(
  evidence: ReadonlyArray<EvidenceRecord>,
  projectId: string,
): EvidenceRecord[] {
  return rowsForProject(evidence, projectId);
}

export function requirementsForProject(
  requirements: ReadonlyArray<Requirement>,
  projectId: string,
): Requirement[] {
  return rowsForProject(requirements, projectId);
}

export function findingsForProject(
  findings: ReadonlyArray<Finding>,
  projectId: string,
): Finding[] {
  return rowsForProject(findings, projectId);
}

/**
 * Picks the active project among visible ones, preferring the current id when
 * still allowed, otherwise the first visible project.
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

  return visible[0];
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

/** Validates the viewer can access `projectId` (active selection is cookie-scoped). */
export function setActiveProject(
  db: {
    projects: ReadonlyArray<Project>;
    organizations: ReadonlyArray<Organization>;
    memberships: ReadonlyArray<OrgMembership>;
  },
  projectId: string,
  userId?: string | null,
): Project {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new PublicError("Unknown project.", "connect");
  if (!isProjectVisible(project, accessFromStore(db, userId))) {
    throw new PublicError("You do not have access to that project.", "connect");
  }
  return project;
}
