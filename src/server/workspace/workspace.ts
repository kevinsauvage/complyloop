import "server-only";

import { cache } from "react";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import type {
  Alert,
  Finding,
  Remediation,
  Requirement,
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
import { getRequirementById } from "@complyloop/db/repo/requirements";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { loadTenancyDb } from "@complyloop/db/workspace-load";

import type { Permission } from "@/core/rbac";

import { getSession } from "../auth-session";
import { readActiveOrgCookie } from "./active-cookies";
import { orgsForUser, resolveActiveOrgId } from "./org-queries";
import {
  type AccessContext,
  accessFromStore,
  assertProjectPermission,
} from "./project-visibility";

/**
 * Request-scoped tenancy. The project a page shows comes from the URL
 * (`loadProjectPage`), not from this state — compliance rows (findings, etc.)
 * load via `getProjectRuntime` or write-time slices.
 */
export interface Workspace {
  /** Auth.js user id when signed in; null when unsigned. */
  userId: string | null;
  githubLogin: string | null;
  access: AccessContext;
  /** All projects in the viewer's orgs (permission / lookup). */
  projects: Project[];
  organizations: Organization[];
  /** Selected org for management + new connects; null when unsigned. */
  activeOrgId: string | null;
}

export function prepareWorkspaceState(
  db: Pick<WorkspaceSlice, "organizations" | "memberships" | "projects">,
  userId: string | null,
  githubLogin: string | null,
  preferredOrgId: string | null,
): Workspace {
  const access = accessFromStore(db, userId, githubLogin);
  const organizations = userId ? orgsForUser(db, userId) : [];
  const activeOrgId =
    userId != null
      ? (resolveActiveOrgId(db, userId, preferredOrgId) ?? null)
      : null;

  return {
    userId,
    githubLogin,
    access,
    projects: db.projects,
    organizations,
    activeOrgId,
  };
}

/** Auth + active org cookie — shared by read and write paths. */
export async function readViewerSession(): Promise<{
  userId: string | null;
  githubLogin: string | null;
  preferredOrgId: string | null;
}> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  return {
    userId,
    githubLogin,
    preferredOrgId: userId ? await readActiveOrgCookie() : null,
  };
}

async function loadViewerWorkspaceState(): Promise<Workspace> {
  const { userId, githubLogin, preferredOrgId } = await readViewerSession();

  const db = await loadTenancyDb(await getDrizzle(), {
    userId,
    githubLogin,
  });
  return prepareWorkspaceState(db, userId, githubLogin, preferredOrgId);
}

/**
 * Tenancy for app pages and layout. Memoized per React request.
 *
 * Read-entry rule (see docs/ai/architecture.md): pages compose exactly two
 * cached reads — {@link getWorkspace} (tenancy only) and `getProjectRuntime`
 * (compliance rows) — plus `loadProjectPage` where caps are needed.
 * Single-row guards (`requireProjectAccess`, `requireAlertAccess`) and the
 * job loader (`loadProjectDb`) are the only other sanctioned reads.
 * Load findings/requirements/etc. with {@link getProjectRuntime}.
 */
export const getWorkspace = cache(async (): Promise<Workspace> =>
  loadViewerWorkspaceState(),
);

/**
 * Shared session → membership → permission check for the single-row guards
 * below. Both `requireProjectAccess` and `requireAlertAccess` resolve a
 * project through different rows, then run this identical check.
 */
async function checkProjectAccess(
  project: Project,
  permission: Permission,
): Promise<Project> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");
  const memberships = await listMembershipsForOrgs(await getDrizzle(), [
    project.orgId,
  ]);
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
  const project = await getProjectById(await getDrizzle(), projectId);
  if (!project) throw new PublicError("Unknown project.");
  return checkProjectAccess(project, permission);
}

/**
 * Alert-scoped variant of {@link requireProjectAccess}: resolves the alert's
 * project and checks the permission against it.
 */
export async function requireAlertAccess(
  alertId: string,
  permission: Permission,
): Promise<{ alert: Alert; project: Project }> {
  const drizzle = await getDrizzle();
  const alert = await getAlertById(drizzle, alertId);
  if (!alert) throw new PublicError("Unknown alert.");
  const project = await getProjectById(drizzle, alert.projectId);
  if (!project) throw new PublicError("Unknown alert.");
  return { alert, project: await checkProjectAccess(project, permission) };
}

/**
 * Lightweight project-visibility check for hot endpoints (e.g. assessment-job
 * polling). Same check as {@link requireProjectAccess} with `project.view`,
 * but boolean instead of throwing — every failure mode is "not visible".
 */
export async function viewerCanViewProject(
  projectId: string,
): Promise<boolean> {
  try {
    await requireProjectAccess(projectId, "project.view");
    return true;
  } catch {
    return false;
  }
}

export function controlById(controlId: string): Control {
  const control = shippedCatalog().controls.find(
    (candidate) => candidate.id === controlId,
  );
  if (!control) throw new PublicError("Unknown control.");
  return control;
}

/**
 * Request-path finding load (pages / action previews). Memoized per request.
 */
export const requireFinding = cache(
  async (findingId: string): Promise<Finding> => {
    const finding = await getFindingById(await getDrizzle(), findingId);
    if (!finding) throw new PublicError("Unknown finding.");
    return finding;
  },
);

/**
 * Request-path requirement load (action previews). Memoized per request.
 * Requirement decisions resolve their project from this row, never a cookie.
 */
export const requireRequirement = cache(
  async (requirementId: string): Promise<Requirement> => {
    const requirement = await getRequirementById(
      await getDrizzle(),
      requirementId,
    );
    if (!requirement) throw new PublicError("Unknown requirement.");
    return requirement;
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
