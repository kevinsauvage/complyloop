import { cache } from "react";
import { auth } from "@/auth";
import type {
  Control,
  Organization,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { type Finding, type Remediation } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  readActiveOrgCookie,
  readActiveProjectCookie,
} from "./active-cookies";
import { getDrizzle } from "@complyloop/db/client";
import {
  claimMembershipsForLogin,
  insertMembership,
  insertOrganization,
  isPersonalOrgProvisioned,
  listMembershipsForOrgs,
  listOrganizationsForUser,
} from "@complyloop/db/repo/orgs";
import { listOrgIdsForUser } from "@complyloop/db/queries";
import {
  loadWorkspaceContextDbForViewer,
  loadWorkspaceDbForViewer,
  type Db,
} from "./db";
import { shippedCatalog } from "@complyloop/adapters/catalog";
import { emptyDb } from "@complyloop/db/types";
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

export function prepareWorkspaceState(
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
  // Steady state (personal org exists, all login rows claimed) is one indexed
  // read and no writes — GET renders must stay side-effect free (P1-2).
  if (await isPersonalOrgProvisioned(drizzle, userId, githubLogin)) return;
  // Provisioning only inspects orgs + memberships — no need for a full workspace
  // load (catalog, project runtime, evidence) on every signed-in render.
  const orgIds = await listOrgIdsForUser(drizzle, userId, githubLogin);
  const [organizations, memberships] = await Promise.all([
    listOrganizationsForUser(drizzle, orgIds),
    listMembershipsForOrgs(drizzle, orgIds),
  ]);
  const orgIdsBefore = new Set(organizations.map((org) => org.id));
  const db = { ...emptyDb(), organizations, memberships };
  await claimMembershipsForLogin(drizzle, userId, githubLogin);
  const result = ensurePersonalOrg(db, userId, githubLogin);
  if (!result.changed) return;
  // Skip when the org already existed in Postgres — only persist newly created orgs.
  if (orgIdsBefore.has(result.org.id)) return;

  const membership = db.memberships.find(
    (item) => item.orgId === result.org.id && item.userId === userId,
  );
  await drizzle.transaction(async (tx) => {
    await insertOrganization(tx, result.org);
    if (membership) await insertMembership(tx, membership);
  });
}

async function loadViewerWorkspaceState(
  loadDb: typeof loadWorkspaceDbForViewer,
): Promise<Workspace> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  const preferredOrgId = userId ? await readActiveOrgCookie() : null;
  const preferredProjectId = await readActiveProjectCookie();

  if (userId && githubLogin) {
    await ensurePersonalOrgProvisioned(userId, githubLogin);
  }

  const db = await loadDb({
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
}

/**
 * Tenancy + active project only — for layout shell and org management pages.
 * Memoized per React request separately from {@link getWorkspace}.
 */
export const getWorkspaceContext = cache(async (): Promise<Workspace> =>
  loadViewerWorkspaceState(loadWorkspaceContextDbForViewer),
);

/**
 * Loads the store scoped to the active project + org list.
 * Memoized per React request so layout + page share one load/auth.
 */
export const getWorkspace = cache(async (): Promise<Workspace> =>
  loadViewerWorkspaceState(loadWorkspaceDbForViewer),
);

export async function sessionWriteContext(): Promise<{
  userId: string | null;
  githubLogin: string | null;
  preferredOrgId: string | null;
  preferredProjectId: string | null;
}> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  return {
    userId,
    githubLogin,
    preferredOrgId: userId ? await readActiveOrgCookie() : null,
    preferredProjectId: await readActiveProjectCookie(),
  };
}


export function controlById(controlId: string): Control {
  const control = shippedCatalog().controls.find(
    (candidate) => candidate.id === controlId,
  );
  if (!control) throw new PublicError("Unknown control.");
  return control;
}

export function findingById(db: Db, findingId: string): Finding {
  const finding = db.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new PublicError("Unknown finding.");
  return finding;
}

export function findRemediationForFinding(
  db: Db,
  findingId: string,
): Remediation | undefined {
  return db.remediations.find(
    (candidate) => candidate.findingId === findingId,
  );
}

export function remediationForFinding(db: Db, findingId: string): Remediation {
  const remediation = findRemediationForFinding(db, findingId);
  if (!remediation) throw new PublicError("No remediation for that finding.");
  return remediation;
}

export { ensurePersonalOrgProvisioned };
