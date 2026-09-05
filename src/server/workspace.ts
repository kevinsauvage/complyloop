import { cache } from "react";
import { auth } from "@/auth";
import type { Control, OrgMembership, Organization, Project } from "@complyloop/domain/project-types";
import type { Alert, Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  readActiveOrgCookie,
  readActiveProjectCookie,
} from "./active-cookies";
import { getDrizzle } from "@complyloop/db/client";
import {
  persistProjectSliceDiff,
  snapshotProjectSlice,
} from "@complyloop/db/repo/apply";
import {
  claimMembershipsForLogin,
  deleteMembership,
  deleteOrganizationRow,
  insertMembership,
  insertOrganization,
  upsertMembership,
} from "@complyloop/db/repo/orgs";
import { updateProject } from "@complyloop/db/repo/projects";
import { loadWorkspaceDb } from "@complyloop/db/workspace-load";
import {
  acquireNamedPostgresAdvisoryLock,
  projectWriteLockKey,
} from "@complyloop/db/write-lock";
import {
  loadWorkspaceDbForViewer,
  type Db,
} from "./db";
import { ensurePersonalOrg, orgsForUser, resolveActiveOrgId } from "./orgs";
import {
  type AccessContext,
  accessFromStore,
  resolveActiveProject,
  visibleProjects,
} from "./project-visibility";

export interface Workspace {
  db: Db;
  /** Null when the viewer has no connected project yet. */
  project: Project | null;
  /** Auth.js user id when signed in; null when unsigned. */
  userId: string | null;
  githubLogin: string | null;
  access: AccessContext;
  /** Projects the current viewer may switch between (scoped to active org). */
  visibleProjects: Project[];
  /** Orgs the signed-in user belongs to. */
  organizations: Organization[];
  /** Selected org for management + new connects; null when unsigned. */
  activeOrgId: string | null;
}

function projectsForActiveOrg(
  projects: ReadonlyArray<Project>,
  access: AccessContext,
  activeOrgId: string | null,
): Project[] {
  const visible = visibleProjects(projects, access);
  if (!activeOrgId) return [];
  return visible.filter((project) => project.orgId === activeOrgId);
}

function prepareWorkspaceState(
  db: Db,
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
  const project =
    resolveActiveProject(
      scoped.length > 0 ? scoped : db.projects,
      preferredProjectId,
      access,
    ) ?? null;

  return {
    db,
    project,
    userId,
    githubLogin,
    access,
    visibleProjects:
      scoped.length > 0 ? scoped : visibleProjects(db.projects, access),
    organizations,
    activeOrgId,
  };
}

async function ensurePersonalOrgProvisioned(
  userId: string,
  githubLogin: string,
): Promise<void> {
  const drizzle = await getDrizzle();
  const db = await loadWorkspaceDb(drizzle, {
    userId,
    githubLogin,
    activeProjectId: null,
    evidenceLimit: 0,
  });
  await claimMembershipsForLogin(drizzle, userId, githubLogin);
  const result = ensurePersonalOrg(db, userId, githubLogin);
  if (!result.changed) return;
  if (db.organizations.some((org) => org.id === result.org.id)) return;

  const membership = db.memberships.find(
    (item) => item.orgId === result.org.id && item.userId === userId,
  );
  await drizzle.transaction(async (tx) => {
    await insertOrganization(tx, result.org);
    if (membership) await insertMembership(tx, membership);
  });
}

/**
 * Loads the store scoped to the active project + org list.
 * Memoized per React request so layout + page share one load/auth.
 */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  const preferredOrgId = userId ? await readActiveOrgCookie() : null;
  const preferredProjectId = await readActiveProjectCookie();

  if (userId && githubLogin) {
    await ensurePersonalOrgProvisioned(userId, githubLogin);
  }

  const db = await loadWorkspaceDbForViewer({
    userId,
    githubLogin,
    preferredProjectId,
  });
  return prepareWorkspaceState(
    db,
    userId,
    githubLogin,
    preferredOrgId,
    preferredProjectId,
  );
});

/**
 * Mutates the active project's runtime slice in one transaction.
 * Domain helpers may mutate `workspace.db` in memory; only changed rows persist.
 */
export async function withProjectWrite<T>(
  fn: (workspace: Workspace) => Promise<T> | T,
): Promise<T> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  const preferredOrgId = userId ? await readActiveOrgCookie() : null;
  const preferredProjectId = await readActiveProjectCookie();

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    const db = await loadWorkspaceDb(tx, {
      userId,
      githubLogin,
      activeProjectId: preferredProjectId,
      evidenceLimit: 0,
    });
    const workspace = prepareWorkspaceState(
      db,
      userId,
      githubLogin,
      preferredOrgId,
      preferredProjectId,
    );
    if (!workspace.project) {
      throw new PublicError("Select a project first.");
    }
    const projectId = workspace.project.id;
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));
    const projectBefore = structuredClone(workspace.project);
    const before = snapshotProjectSlice(
      db.requirements,
      db.findings,
      db.remediations,
      db.alerts,
      projectId,
    );
    const evidenceStart = db.evidence.length;
    const result = await fn(workspace);
    const after = snapshotProjectSlice(
      db.requirements,
      db.findings,
      db.remediations,
      db.alerts,
      projectId,
    );
    const newEvidence = db.evidence.slice(evidenceStart);
    await persistProjectSliceDiff(tx, before, after, newEvidence);
    // Canonical-order equality (same invariant as repo/apply.ts) — keep the
    // project mapper key order stable or every write looks like a change.
    if (
      JSON.stringify(projectBefore) !== JSON.stringify(workspace.project)
    ) {
      await updateProject(tx, workspace.project);
    }
    return result;
  });
}

/**
 * Org-scoped mutation using an in-memory org slice; persists org/membership rows only.
 */
export async function withOrgWrite<T>(
  fn: (ctx: {
    db: Db;
    userId: string;
    githubLogin: string | null;
    organizations: Organization[];
  }) => Promise<T> | T,
): Promise<T> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    const db = await loadWorkspaceDb(tx, {
      userId,
      githubLogin,
      activeProjectId: null,
      evidenceLimit: 0,
    });
    const organizations = orgsForUser(db, userId);
    const membershipsBefore = new Map<string, OrgMembership>(
      db.memberships.map((item) => [item.id, structuredClone(item)]),
    );
    const orgsBefore = new Map<string, Organization>(
      db.organizations.map((item) => [item.id, structuredClone(item)]),
    );

    const result = await fn({ db, userId, githubLogin, organizations });

    for (const org of db.organizations) {
      if (!orgsBefore.has(org.id)) {
        await insertOrganization(tx, org);
      }
    }
    for (const membership of db.memberships) {
      const prev = membershipsBefore.get(membership.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(membership)) {
        await upsertMembership(tx, membership);
      }
    }
    for (const [id] of membershipsBefore) {
      if (!db.memberships.some((item) => item.id === id)) {
        await deleteMembership(tx, id);
      }
    }
    for (const [id] of orgsBefore) {
      if (!db.organizations.some((item) => item.id === id)) {
        await deleteOrganizationRow(tx, id);
      }
    }

    return result;
  });
}

export function controlById(db: Db, controlId: string): Control {
  const control = db.controls.find((candidate) => candidate.id === controlId);
  if (!control) throw new PublicError("Unknown control.");
  return control;
}

export function findingById(db: Db, findingId: string): Finding {
  const finding = db.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new PublicError("Unknown finding.");
  return finding;
}

export function remediationForFinding(db: Db, findingId: string): Remediation {
  const remediation = db.remediations.find(
    (candidate) => candidate.findingId === findingId,
  );
  if (!remediation) throw new PublicError("No remediation for that finding.");
  return remediation;
}

export function alertById(db: Db, alertId: string, projectId: string): Alert {
  const alert = db.alerts.find(
    (candidate) => candidate.id === alertId && candidate.projectId === projectId,
  );
  if (!alert) throw new PublicError("Unknown alert.");
  return alert;
}

export { ensurePersonalOrgProvisioned };
