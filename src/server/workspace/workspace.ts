import "server-only";

import { cache } from "react";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import {
  type Alert,
  type Finding,
  type Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Organization,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import { getAlertById } from "@complyloop/db/repo/alerts";
import { getFindingById } from "@complyloop/db/repo/findings";
import { listMembershipsForOrgs } from "@complyloop/db/repo/orgs";
import { getProjectById } from "@complyloop/db/repo/projects";
import { getRemediationByFindingId } from "@complyloop/db/repo/remediations";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { loadTenancyDb } from "@complyloop/db/workspace-load";

import type { Permission } from "@/core/rbac";

import { getSession } from "../auth-session";
import { readActiveOrgCookie, readActiveProjectCookie } from "./active-cookies";
import { orgsForUser, resolveActiveOrgId } from "./org-queries";
import {
  type AccessContext,
  accessFromStore,
  assertProjectPermission,
  isProjectVisible,
  resolveActiveProject,
  visibleProjects,
} from "./project-visibility";

/**
 * Request-scoped tenancy + active project. Compliance rows (findings, etc.)
 * load via {@link getProjectRuntime} or write-time slices — not here.
 */
export interface Workspace {
  /** Null when the viewer has no connected project yet. */
  project: Project | null;
  /** Auth.js user id when signed in; null when unsigned. */
  userId: string | null;
  githubLogin: string | null;
  access: AccessContext;
  /** All projects in the viewer's orgs (permission / lookup). */
  projects: Project[];
  /** Projects the current viewer may switch between (scoped to active org). */
  visibleProjects: Project[];
  /** Orgs the signed-in user belongs to. */
  organizations: Organization[];
  /** Selected org for management + new connects; null when unsigned. */
  activeOrgId: string | null;
}

/** Workspace plus the in-transaction project slice for {@link withProjectWrite}. */
export type ProjectWriteWorkspace = Workspace & { db: WorkspaceSlice };

function projectsForActiveOrg(
  projects: ReadonlyArray<Project>,
  access: AccessContext,
  activeOrgId: string | null,
): Project[] {
  const visible = visibleProjects(projects, access);
  if (!activeOrgId) return [];
  return visible.filter((project) => project.orgId === activeOrgId);
}

export function prepareWorkspaceState(
  db: Pick<WorkspaceSlice, "organizations" | "memberships" | "projects">,
  userId: string | null,
  githubLogin: string | null,
  preferredOrgId: string | null,
  preferredProjectId: string | null,
): Workspace {
  const access = accessFromStore(db, userId, githubLogin);
  const organizations = userId ? orgsForUser(db, userId) : [];
  const activeOrgId =
    userId != null
      ? (resolveActiveOrgId(db, userId, preferredOrgId) ?? null)
      : null;

  const scoped = projectsForActiveOrg(db.projects, access, activeOrgId);
  // When an org is selected, never fall back to other orgs' projects — a
  // stale project cookie must not leak tenancy context into an empty org.
  const project = activeOrgId
    ? (resolveActiveProject(scoped, preferredProjectId, access) ?? null)
    : null;

  return {
    project,
    userId,
    githubLogin,
    access,
    projects: db.projects,
    visibleProjects: activeOrgId ? scoped : [],
    organizations,
    activeOrgId,
  };
}

/** Auth + active org/project cookies — shared by read and write paths. */
export async function readViewerSession(): Promise<{
  userId: string | null;
  githubLogin: string | null;
  preferredOrgId: string | null;
  preferredProjectId: string | null;
}> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  return {
    userId,
    githubLogin,
    preferredOrgId: userId ? await readActiveOrgCookie() : null,
    preferredProjectId: await readActiveProjectCookie(),
  };
}

async function loadViewerWorkspaceState(): Promise<Workspace> {
  const { userId, githubLogin, preferredOrgId, preferredProjectId } =
    await readViewerSession();

  const db = await loadTenancyDb(await getDrizzle(), {
    userId,
    githubLogin,
    activeProjectId: preferredProjectId,
  });
  return prepareWorkspaceState(
    db,
    userId,
    githubLogin,
    preferredOrgId,
    preferredProjectId,
  );
}

/**
 * Tenancy + active project for app pages and layout. Memoized per React request.
 * Load findings/requirements/etc. with {@link getProjectRuntime}.
 */
export const getWorkspace = cache(async (): Promise<Workspace> =>
  loadViewerWorkspaceState(),
);

/**
 * Lightweight project-permission check for hot endpoints and single-row
 * actions (e.g. assessment-job polling, alert reads): session + one project
 * row + that project org's memberships. Avoids the full tenancy load in
 * {@link getWorkspace} on every request. Actions use this (never raw
 * `getDrizzle()`) before entering `withProjectLock`.
 */
export async function requireProjectAccess(
  projectId: string,
  permission: Permission,
): Promise<Project> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");
  const drizzle = await getDrizzle();
  const project = await getProjectById(drizzle, projectId);
  if (!project) throw new PublicError("Unknown project.");
  const memberships = await listMembershipsForOrgs(drizzle, [project.orgId]);
  assertProjectPermission(
    project,
    {
      userId,
      githubLogin: session?.user?.login ?? null,
      organizations: [],
      memberships,
    },
    permission,
  );
  return project;
}

/**
 * Alert-scoped variant of {@link requireProjectAccess}: resolves the alert's
 * project and checks the permission against it.
 */
export async function requireAlertAccess(
  alertId: string,
  permission: Permission,
): Promise<{ alert: Alert; project: Project }> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");
  const drizzle = await getDrizzle();
  const alert = await getAlertById(drizzle, alertId);
  if (!alert) throw new PublicError("Unknown alert.");
  const project = await getProjectById(drizzle, alert.projectId);
  if (!project) throw new PublicError("Unknown alert.");
  const memberships = await listMembershipsForOrgs(drizzle, [project.orgId]);
  assertProjectPermission(
    project,
    {
      userId,
      githubLogin: session?.user?.login ?? null,
      organizations: [],
      memberships,
    },
    permission,
  );
  return { alert, project };
}

/**
 * Lightweight project-visibility check for hot endpoints (e.g. assessment-job
 * polling): session + one project row + that project org's memberships. Avoids
 * the full tenancy load in {@link getWorkspace} on every request.
 */
export async function viewerCanViewProject(
  projectId: string,
): Promise<boolean> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return false;
  const drizzle = await getDrizzle();
  const project = await getProjectById(drizzle, projectId);
  if (!project) return false;
  const memberships = await listMembershipsForOrgs(drizzle, [project.orgId]);
  return isProjectVisible(project, {
    userId,
    githubLogin: session?.user?.login ?? null,
    organizations: [],
    memberships,
  });
}

export function controlById(controlId: string): Control {
  const control = shippedCatalog().controls.find(
    (candidate) => candidate.id === controlId,
  );
  if (!control) throw new PublicError("Unknown control.");
  return control;
}

/** Slice lookup used inside {@link withProjectWrite} callbacks. */
export function findingById(db: WorkspaceSlice, findingId: string): Finding {
  const finding = db.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new PublicError("Unknown finding.");
  return finding;
}

function findRemediationForFinding(
  db: WorkspaceSlice,
  findingId: string,
): Remediation | undefined {
  return db.remediations.find((candidate) => candidate.findingId === findingId);
}

export function remediationForFinding(db: WorkspaceSlice, findingId: string): Remediation {
  const remediation = findRemediationForFinding(db, findingId);
  if (!remediation) throw new PublicError("No remediation for that finding.");
  return remediation;
}

/** Request-path finding load (pages / action previews). Memoized per request. */
export const requireFinding = cache(
  async (findingId: string): Promise<Finding> => {
    const finding = await getFindingById(await getDrizzle(), findingId);
    if (!finding) throw new PublicError("Unknown finding.");
    return finding;
  },
);

/** Request-path remediation load (pages / action previews). Memoized per request. */
export const requireRemediationForFinding = cache(
  async (findingId: string): Promise<Remediation> => {
    const remediation = await getRemediationByFindingId(
      await getDrizzle(),
      findingId,
    );
    if (!remediation) throw new PublicError("No remediation for that finding.");
    return remediation;
  },
);
