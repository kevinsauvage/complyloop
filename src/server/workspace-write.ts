import { auth } from "@/auth";
import type {
  OrgMembership,
  Organization,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  acquireNamedPostgresAdvisoryLock,
  getDrizzle,
  orgWriteLockKey,
  projectWriteLockKey,
  type DrizzleDb,
} from "@complyloop/db/postgres";
import { insertEvidenceRecords } from "@complyloop/db/repo/evidence";
import {
  persistProjectRows,
  snapshotProjectSlice,
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
  loadProjectWriteDb,
  loadTenancyDb,
} from "@complyloop/db/workspace-load";
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

/**
 * Serializes project mutations under a per-project advisory lock. Loads the
 * full project runtime; the handler returns a {@link ProjectWritePayload}, or
 * void when there is nothing to persist.
 */
export async function withProjectWrite(
  fn: (workspace: ProjectWriteWorkspace) => Promise<ProjectWritePayload | void>,
): Promise<void> {
  const { userId, githubLogin, preferredOrgId, preferredProjectId } =
    await readViewerSession();

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    const loadWorkspace = async (): Promise<ProjectWriteWorkspace> => {
      const db = await loadProjectWriteDb(tx, {
        userId,
        githubLogin,
        activeProjectId: preferredProjectId,
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

    // Single-lock protocol: resolve the effective project from a lock-free
    // tenancy read, then lock exactly that project. Locking the cookie project
    // and re-locking the resolved project can deadlock two writers whose stale
    // cookies point at each other's projects.
    const probe = await loadTenancyDb(tx, {
      userId,
      githubLogin,
      activeProjectId: preferredProjectId,
    });
    const probeProject = prepareWorkspaceState(
      probe,
      userId,
      githubLogin,
      preferredOrgId,
      preferredProjectId,
    ).project;
    if (!probeProject) {
      throw new PublicError("Select a project first.");
    }
    const projectId = probeProject.id;

    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));

    const workspace = await loadWorkspace();
    if (!workspace.project || workspace.project.id !== projectId) {
      // Project set changed between the lock-free resolve and the locked load.
      // No write has happened; ask the caller to retry rather than write to an
      // unlocked project.
      throw new PublicError("The active project changed. Try again.");
    }

    // Clone before the handler mutates rows in place: persist compares against
    // what was loaded, not the post-mutation state.
    const loadedSlice = snapshotProjectSlice(
      workspace.db.requirements,
      workspace.db.findings,
      workspace.db.remediations,
      workspace.db.alerts,
      projectId,
    );
    const payload = (await fn(workspace)) ?? {};

    await persistProjectRows(tx, payload, { loadedSlice });
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
  await withProjectWrite(async (workspace) => {
    const { db } = workspace;
    const finding = findingById(db, findingId);
    requireOnFindingProject(workspace, finding, permission);
    return fn({ db, finding, workspace });
  });
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
