import { cache } from "react";
import { auth } from "@/auth";
import type {
  Control,
  OrgMembership,
  Organization,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import type { Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  readActiveOrgCookie,
  readActiveProjectCookie,
} from "./active-cookies";
import { getDrizzle, type DrizzleDb } from "@complyloop/db/client";
import {
  requirementUpdatedAtById,
  updatedAtById,
} from "@complyloop/db/repo/apply";
import {
  createProjectWriteCollector,
  persistProjectWrite,
  type ProjectWriteCollector,
} from "@complyloop/db/project-write";
import {
  claimMembershipsForLogin,
  deleteMembership,
  deleteOrganizationRow,
  insertMembership,
  insertOrganization,
  isPersonalOrgProvisioned,
  listMembershipsForOrgs,
  listOrganizationsForUser,
  upsertMembership,
} from "@complyloop/db/repo/orgs";
import { listOrgIdsForUser } from "@complyloop/db/postgres-queries";
import {
  loadTargetedProjectWriteDb,
  loadWorkspaceDb,
} from "@complyloop/db/workspace-load";
import {
  acquireNamedPostgresAdvisoryLock,
  orgWriteLockKey,
  projectWriteLockKey,
} from "@complyloop/db/write-lock";
import { WORKSPACE_EVIDENCE_LIMIT } from "@complyloop/db/postgres-scope";
import {
  emptyDb,
  loadWorkspaceDbForViewer,
  type Db,
} from "./db";
import { withShippedCatalog } from "./catalog";
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

async function sessionWriteContext(): Promise<{
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

/** What rows a project write may load and persist. */
export type ProjectWriteScope =
  /** Project settings and assessment enqueue — project row + new evidence only. */
  | { touch: "project" }
  /** Hot-path entity mutations — only the listed findings/requirements/controls. */
  | {
      touch: "entities";
      findingIds?: readonly string[];
      requirementIds?: readonly string[];
      refreshControlIds?: readonly string[];
    };

function captureEntityStaleWriteGuards(
  db: Db,
  scope: Extract<ProjectWriteScope, { touch: "entities" }>,
): {
  loadedRequirementUpdatedAtById: Map<string, string>;
  loadedFindingUpdatedAtById: Map<string, string>;
  loadedRemediationUpdatedAtById: Map<string, string>;
} {
  const findingIds = new Set(scope.findingIds ?? []);
  const requirementIds = new Set(scope.requirementIds ?? []);
  const controlIds = effectiveRefreshControlIds(db, scope);

  const loadedFindings = db.findings.filter((finding) =>
    findingIds.has(finding.id),
  );
  const loadedRemediations = db.remediations.filter((remediation) =>
    findingIds.has(remediation.findingId),
  );
  const loadedRequirements = db.requirements.filter(
    (requirement) =>
      requirementIds.has(requirement.id) ||
      controlIds.has(requirement.controlId),
  );

  return {
    loadedRequirementUpdatedAtById: requirementUpdatedAtById(loadedRequirements),
    loadedFindingUpdatedAtById: updatedAtById(loadedFindings),
    loadedRemediationUpdatedAtById: updatedAtById(loadedRemediations),
  };
}

async function runProjectWriteTransaction<T>(
  scope: ProjectWriteScope,
  fn: (workspace: Workspace, writes: ProjectWriteCollector) => Promise<T> | T,
): Promise<T> {
  if (
    scope.touch === "entities" &&
    (scope.findingIds?.length ?? 0) === 0 &&
    (scope.requirementIds?.length ?? 0) === 0
  ) {
    throw new PublicError("Project write requires at least one entity id.");
  }

  const { userId, githubLogin, preferredOrgId, preferredProjectId } =
    await sessionWriteContext();

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    const loadWorkspace = async (): Promise<{ db: Db; workspace: Workspace }> => {
      const db = withShippedCatalog(
        scope.touch === "project"
          ? await loadWorkspaceDb(tx, {
              userId,
              githubLogin,
              activeProjectId: preferredProjectId,
              evidenceLimit: 0,
            })
          : await loadTargetedProjectWriteDb(tx, {
              userId,
              githubLogin,
              activeProjectId: preferredProjectId,
              evidenceLimit: WORKSPACE_EVIDENCE_LIMIT,
              findingIds: scope.findingIds,
              requirementIds: scope.requirementIds,
              controlIds: scope.refreshControlIds,
            }),
      );
      return {
        db,
        workspace: prepareWorkspaceState(
          db,
          userId,
          githubLogin,
          preferredOrgId,
          preferredProjectId,
        ),
      };
    };

    // Single-lock protocol: the cookie names the expected project, so lock it
    // before loading. If the resolved project differs (stale/absent cookie),
    // lock the real project and RE-LOAD under it — otherwise load→mutate is
    // not atomic and two cookieless writers could last-write-win.
    if (preferredProjectId) {
      await acquireNamedPostgresAdvisoryLock(
        tx,
        projectWriteLockKey(preferredProjectId),
      );
    }

    let loaded = await loadWorkspace();
    if (!loaded.workspace.project) {
      throw new PublicError("Select a project first.");
    }
    const projectId = loaded.workspace.project.id;
    if (projectId !== preferredProjectId) {
      await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));
      loaded = await loadWorkspace();
      if (!loaded.workspace.project || loaded.workspace.project.id !== projectId) {
        throw new PublicError("Select a project first.");
      }
    }
    const { db, workspace } = loaded;
    const project = workspace.project;
    if (!project) {
      throw new PublicError("Select a project first.");
    }

    const projectBefore =
      scope.touch === "project" ? structuredClone(project) : null;
    const staleGuards =
      scope.touch === "entities"
        ? captureEntityStaleWriteGuards(db, scope)
        : null;
    const writes = createProjectWriteCollector(db);
    const result = await fn(workspace, writes);

    const payload = writes.snapshot();
    if (scope.touch === "project") {
      const projectAfter = workspace.project ?? project;
      if (
        projectBefore &&
        JSON.stringify(projectBefore) !== JSON.stringify(projectAfter)
      ) {
        payload.project = projectAfter;
      }
    }

    await persistProjectWrite(tx, payload, staleGuards ?? {});

    return result;
  });
}

/**
 * Serializes project mutations under a per-project advisory lock. Pass
 * {@link ProjectWriteScope} to load only the rows you touch.
 */
export async function withProjectWrite<T>(
  scope: ProjectWriteScope,
  fn: (workspace: Workspace, writes: ProjectWriteCollector) => Promise<T> | T,
): Promise<T> {
  return runProjectWriteTransaction(scope, fn);
}

export type { ProjectWriteCollector } from "@complyloop/db/project-write";

/** Serializes a single-row project mutation (e.g. mark alert read). */
export async function withProjectLock<T>(
  projectId: string,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));
    return fn(tx);
  });
}

interface EntityWriteScope {
  findingIds?: readonly string[];
  requirementIds?: readonly string[];
  /** Requirement rows for these controls are loaded and may change during refresh. */
  refreshControlIds?: readonly string[];
}

function effectiveRefreshControlIds(
  db: Db,
  scope: EntityWriteScope,
): Set<string> {
  const controlIds = new Set(scope.refreshControlIds ?? []);
  for (const findingId of scope.findingIds ?? []) {
    const finding = db.findings.find((item) => item.id === findingId);
    if (finding) controlIds.add(finding.controlId);
  }
  for (const requirementId of scope.requirementIds ?? []) {
    const requirement = db.requirements.find((item) => item.id === requirementId);
    if (requirement) controlIds.add(requirement.controlId);
  }
  return controlIds;
}

function changedOrgMemberships<T extends { id: string }>(
  before: Map<string, T>,
  after: ReadonlyArray<T>,
): T[] {
  const changed: T[] = [];
  for (const item of after) {
    const prev = before.get(item.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
      changed.push(item);
    }
  }
  return changed;
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
    // Org writes are rare admin ops but can race (two role changes on the same
    // membership); serialize per user so load→mutate→persist is atomic.
    await acquireNamedPostgresAdvisoryLock(tx, orgWriteLockKey(userId));
    const db = withShippedCatalog(
      await loadWorkspaceDb(tx, {
        userId,
        githubLogin,
        activeProjectId: null,
        evidenceLimit: 0,
      }),
    );
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
    for (const membership of changedOrgMemberships(
      membershipsBefore,
      db.memberships,
    )) {
      await upsertMembership(tx, membership);
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
