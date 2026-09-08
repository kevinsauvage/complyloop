import { auth } from "@/auth";
import type {
  OrgMembership,
  Organization,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle, type DrizzleDb } from "@complyloop/db/client";
import {
  insertEvidenceRecords,
  WORKSPACE_EVIDENCE_LIMIT,
} from "@complyloop/db/repo/evidence";
import {
  persistProjectRows,
  type ProjectSlice,
  type ProjectWritePayload,
} from "@complyloop/db/repo/apply";
import {
  deleteMembership,
  deleteOrganizationRow,
  insertOrganization,
  upsertMembership,
} from "@complyloop/db/repo/orgs";
import { deleteProject, insertProject } from "@complyloop/db/repo/projects";
import {
  loadTargetedProjectWriteDb,
  loadTenancyDb,
} from "@complyloop/db/workspace-load";
import {
  acquireNamedPostgresAdvisoryLock,
  orgWriteLockKey,
  projectWriteLockKey,
} from "@complyloop/db/write-lock";
import type { EvidenceRecord, Finding } from "@complyloop/db/types";
import type { Permission } from "@/core/rbac";
import { orgsForUser } from "./org-queries";
import {
  prepareWorkspaceState,
  readViewerSession,
  type ProjectWriteWorkspace,
} from "./workspace";
import { findingById } from "./workspace";
import { requireOnFindingProject } from "./actions/shared";
import type { Db } from "@complyloop/db/types";

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

export interface OrgWritePayload {
  insertOrgs?: Organization[];
  upsertMemberships?: OrgMembership[];
  deleteMembershipIds?: string[];
  deleteOrgIds?: string[];
}

export interface OrgWriteContext {
  db: Db;
  userId: string;
  githubLogin: string | null;
  organizations: Organization[];
}

interface EntityWriteScope {
  findingIds?: readonly string[];
  requirementIds?: readonly string[];
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

/** Captures the loaded entity rows for stale-write guards on persist. */
function captureEntityLoadedSlice(
  db: Db,
  scope: Extract<ProjectWriteScope, { touch: "entities" }>,
): ProjectSlice {
  const findingIds = new Set(scope.findingIds ?? []);
  const requirementIds = new Set(scope.requirementIds ?? []);
  const controlIds = effectiveRefreshControlIds(db, scope);

  return {
    findings: db.findings.filter((finding) => findingIds.has(finding.id)),
    remediations: db.remediations.filter((remediation) =>
      findingIds.has(remediation.findingId),
    ),
    requirements: db.requirements.filter(
      (requirement) =>
        requirementIds.has(requirement.id) ||
        controlIds.has(requirement.controlId),
    ),
    alerts: [],
  };
}

/**
 * Serializes project mutations under a per-project advisory lock. Pass
 * {@link ProjectWriteScope} to load only the rows you touch. Return a
 * {@link ProjectWritePayload}, or void when there is nothing to persist.
 */
export async function withProjectWrite(
  scope: ProjectWriteScope,
  fn: (workspace: ProjectWriteWorkspace) => Promise<ProjectWritePayload | void>,
): Promise<void> {
  if (
    scope.touch === "entities" &&
    (scope.findingIds?.length ?? 0) === 0 &&
    (scope.requirementIds?.length ?? 0) === 0
  ) {
    throw new PublicError("Project write requires at least one entity id.");
  }

  const { userId, githubLogin, preferredOrgId, preferredProjectId } =
    await readViewerSession();

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    const loadWorkspace = async (): Promise<ProjectWriteWorkspace> => {
      const db =
        scope.touch === "project"
          ? await loadTenancyDb(tx, {
              userId,
              githubLogin,
              activeProjectId: preferredProjectId,
            })
          : await loadTargetedProjectWriteDb(tx, {
              userId,
              githubLogin,
              activeProjectId: preferredProjectId,
              evidenceLimit: WORKSPACE_EVIDENCE_LIMIT,
              findingIds: scope.findingIds,
              requirementIds: scope.requirementIds,
              controlIds: scope.refreshControlIds,
            });
      return {
        ...prepareWorkspaceState(
          db,
          userId,
          githubLogin,
          preferredOrgId,
          preferredProjectId,
        ),
        db,
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

    let workspace = await loadWorkspace();
    if (!workspace.project) {
      throw new PublicError("Select a project first.");
    }
    const projectId = workspace.project.id;
    if (projectId !== preferredProjectId) {
      await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));
      workspace = await loadWorkspace();
      if (!workspace.project || workspace.project.id !== projectId) {
        throw new PublicError("Select a project first.");
      }
    }
    const project = workspace.project;
    if (!project) {
      throw new PublicError("Select a project first.");
    }

    const loadedSlice =
      scope.touch === "entities"
        ? captureEntityLoadedSlice(workspace.db, scope)
        : undefined;
    const payload = (await fn(workspace)) ?? {};

    await persistProjectRows(tx, payload, loadedSlice ? { loadedSlice } : {});
  });
}

/** Finding-scoped project write: loads the finding + asserts permission. */
export async function withFindingWrite(
  findingId: string,
  permission: Permission,
  fn: (ctx: {
    db: Db;
    finding: Finding;
    workspace: ProjectWriteWorkspace;
  }) => Promise<ProjectWritePayload | void>,
): Promise<void> {
  await withProjectWrite(
    { touch: "entities", findingIds: [findingId] },
    async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, permission);
      return fn({ db, finding, workspace });
    },
  );
}

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

interface LockedTenancyContext {
  tx: DrizzleDb;
  db: Db;
  userId: string;
  githubLogin: string | null;
}

/**
 * Shared auth → user-scoped org advisory lock → tenancy load. Used by
 * {@link withOrgWrite} and {@link withConnectWrite}; row-persist loops stay
 * in those callers.
 */
async function withLockedTenancy<T>(
  options: { activeProjectId: string | null },
  fn: (ctx: LockedTenancyContext) => Promise<T>,
): Promise<T> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, orgWriteLockKey(userId));
    const db = await loadTenancyDb(tx, {
      userId,
      githubLogin,
      activeProjectId: options.activeProjectId,
    });
    return fn({ tx, db, userId, githubLogin });
  });
}

/**
 * Org-scoped mutation. The callback returns the rows to persist — no
 * JSON-diff of the in-memory slice.
 */
export async function withOrgWrite<T>(
  fn: (
    ctx: OrgWriteContext,
  ) => Promise<(OrgWritePayload & { result: T })> | (OrgWritePayload & { result: T }),
): Promise<T> {
  return withLockedTenancy({ activeProjectId: null }, async ({ tx, db, userId, githubLogin }) => {
    const organizations = orgsForUser(db, userId);
    const {
      result,
      insertOrgs,
      upsertMemberships,
      deleteMembershipIds,
      deleteOrgIds,
    } = await fn({ db, userId, githubLogin, organizations });

    for (const org of insertOrgs ?? []) {
      await insertOrganization(tx, org);
    }
    for (const membership of upsertMemberships ?? []) {
      await upsertMembership(tx, membership);
    }
    for (const id of deleteMembershipIds ?? []) {
      await deleteMembership(tx, id);
    }
    for (const id of deleteOrgIds ?? []) {
      await deleteOrganizationRow(tx, id);
    }

    return result;
  });
}

export interface ConnectWritePayload {
  insertProjects?: Project[];
  deleteProjectIds?: string[];
  evidence?: EvidenceRecord[];
}

export interface ConnectWriteContext {
  db: Db;
  userId: string;
  githubLogin: string | null;
}

/**
 * Connect/disconnect writes: tenancy load (no active-project requirement),
 * user-scoped org lock (not project lock — there may be no project cookie yet),
 * persist insert/delete project + evidence.
 */
export async function withConnectWrite<T>(
  options: { activeProjectId: string | null },
  fn: (
    ctx: ConnectWriteContext,
  ) =>
    | Promise<ConnectWritePayload & { result: T }>
    | (ConnectWritePayload & { result: T }),
): Promise<T> {
  return withLockedTenancy(options, async ({ tx, db, userId, githubLogin }) => {
    const { result, insertProjects, deleteProjectIds, evidence } = await fn({
      db,
      userId,
      githubLogin,
    });

    for (const id of deleteProjectIds ?? []) {
      await deleteProject(tx, id);
    }
    for (const project of insertProjects ?? []) {
      await insertProject(tx, project);
    }
    await insertEvidenceRecords(tx, evidence ?? []);

    return result;
  });
}
