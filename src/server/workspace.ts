import { cache } from "react";
import { auth } from "@/auth";
import type { Control, Organization, Project } from "@/core/project-types";
import type { Finding, Remediation } from "@/core/finding-types";
import { readActiveOrgCookie } from "./active-org";
import { readActiveProjectCookie } from "./active-project";
import { loadDb, withDbWrite, type Db } from "./db";
import { ensurePersonalOrg, orgsForUser, resolveActiveOrgId } from "./orgs";
import {
  type AccessContext,
  accessFromStore,
  resolveActiveProject,
  visibleProjects,
} from "./project-visibility";
import { ensureSeeded } from "./seed";

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

/**
 * Projects visible in the active org: that org's projects (and any still-unscoped
 * legacy projects with no orgId).
 */
export function projectsForActiveOrg(
  projects: ReadonlyArray<Project>,
  access: AccessContext,
  activeOrgId: string | null,
): Project[] {
  const visible = visibleProjects(projects, access);
  if (!activeOrgId) return visible;
  return visible.filter(
    (project) => !project.orgId || project.orgId === activeOrgId,
  );
}

function prepareWorkspaceState(
  db: Db,
  userId: string | null,
  githubLogin: string | null,
  preferredOrgId: string | null,
  preferredProjectId: string | null,
): { changed: boolean; workspace: Omit<Workspace, "db"> & { db: Db } } {
  let changed = false;
  if (ensureSeeded(db)) changed = true;

  if (userId && githubLogin) {
    const result = ensurePersonalOrg(db, userId, githubLogin);
    if (result.changed) changed = true;
  }

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
    changed,
    workspace: {
      db,
      project,
      userId,
      githubLogin,
      access,
      visibleProjects:
        scoped.length > 0 ? scoped : visibleProjects(db.projects, access),
      organizations,
      activeOrgId,
    },
  };
}

/**
 * Loads the store, seeding the framework and controls on first use.
 * Memoized per React request so layout + page share one load/auth.
 */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  const preferredOrgId = userId ? await readActiveOrgCookie() : null;
  const preferredProjectId = await readActiveProjectCookie();

  const db = await loadDb();
  const prepared = prepareWorkspaceState(
    db,
    userId,
    githubLogin,
    preferredOrgId,
    preferredProjectId,
  );
  if (prepared.changed) {
    // Re-run under the write lock so seed/org provisioning cannot race.
    return withDbWrite(async (locked) => {
      const again = prepareWorkspaceState(
        locked,
        userId,
        githubLogin,
        preferredOrgId,
        preferredProjectId,
      );
      return again.workspace;
    });
  }
  return prepared.workspace;
});

/**
 * Exclusive workspace mutation: reloads under the store write lock, runs `fn`,
 * and persists. Prefer this over getWorkspace alone in server actions.
 */
export async function withWorkspaceWrite<T>(
  fn: (workspace: Workspace) => Promise<T> | T,
): Promise<T> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  const preferredOrgId = userId ? await readActiveOrgCookie() : null;
  const preferredProjectId = await readActiveProjectCookie();

  return withDbWrite(async (db) => {
    const { workspace } = prepareWorkspaceState(
      db,
      userId,
      githubLogin,
      preferredOrgId,
      preferredProjectId,
    );
    return fn(workspace);
  });
}

export function controlById(db: Db, controlId: string): Control {
  const control = db.controls.find((candidate) => candidate.id === controlId);
  if (!control) throw new Error(`Unknown control: ${controlId}`);
  return control;
}

export function findingById(db: Db, findingId: string): Finding {
  const finding = db.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new Error(`Unknown finding: ${findingId}`);
  return finding;
}

export function remediationForFinding(db: Db, findingId: string): Remediation {
  const remediation = db.remediations.find(
    (candidate) => candidate.findingId === findingId,
  );
  if (!remediation) throw new Error(`No remediation for finding: ${findingId}`);
  return remediation;
}
