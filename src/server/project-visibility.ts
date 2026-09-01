import type { OrgMembership, Organization, Project, Requirement } from "@/core/project-types";
import type { EvidenceRecord, Finding } from "@/core/finding-types";
import { PublicError } from "@/core/public-error";
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

/** Project ids the viewer may read (findings, evidence, exports). */
export function visibleProjectIds(
  projects: ReadonlyArray<Project>,
  ctx: AccessContext,
): Set<string> {
  return new Set(visibleProjects(projects, ctx).map((project) => project.id));
}

/** Evidence rows belonging to a single project (export / report / evidence UI). */
export function evidenceForProject(
  evidence: ReadonlyArray<EvidenceRecord>,
  projectId: string,
): EvidenceRecord[] {
  return evidence.filter((record) => record.projectId === projectId);
}

export function requirementsForProject(
  requirements: ReadonlyArray<Requirement>,
  projectId: string,
): Requirement[] {
  return requirements.filter(
    (requirement) => requirement.projectId === projectId,
  );
}

export function findingsForProject(
  findings: ReadonlyArray<Finding>,
  projectId: string,
): Finding[] {
  return findings.filter((finding) => finding.projectId === projectId);
}

/**
 * Resolves a finding only when its project is visible to the viewer.
 * Returns null when the finding is missing or cross-tenant.
 */
export function resolveVisibleFinding(
  findingId: string,
  findings: ReadonlyArray<Finding>,
  projects: ReadonlyArray<Project>,
  ctx: AccessContext,
): { finding: Finding; project: Project } | null {
  const finding = findings.find((candidate) => candidate.id === findingId);
  if (!finding) return null;
  const project = projects.find(
    (candidate) => candidate.id === finding.projectId,
  );
  if (!project || !isProjectVisible(project, ctx)) return null;
  return { finding, project };
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
