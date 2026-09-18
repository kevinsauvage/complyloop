import "server-only";

import type {
  EvidenceRecord,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Organization,
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  acquireNamedPostgresAdvisoryLock,
  type DrizzleDb,
  getDrizzle,
  orgWriteLockKey,
  projectWriteLockKey,
} from "@complyloop/db/postgres";
import {
  persistProjectRows,
  type ProjectSlice,
  type ProjectWritePayload,
  snapshotProjectSlice,
} from "@complyloop/db/repo/apply";
import {
  deleteEvidenceForOrg,
  insertEvidenceRecords,
} from "@complyloop/db/repo/evidence";
import { getFindingById } from "@complyloop/db/repo/findings";
import {
  deleteMembership,
  deleteOrganizationRow,
  insertOrganization,
  upsertMembership,
} from "@complyloop/db/repo/orgs";
import { deleteProject, insertProject } from "@complyloop/db/repo/projects";
import type { WorkspaceSlice } from "@complyloop/db/types";
import {
  loadProjectWriteDb,
  loadTenancyDb,
} from "@complyloop/db/workspace-load";

import type { Permission } from "@/core/rbac";

import { getSession } from "../auth-session";
import { orgsForUser } from "./org-queries";
import { stampEvidenceActor } from "./project-rows";
import { requireOnFindingProject } from "./project-visibility";
import {
  prepareWorkspaceState,
  type ProjectWriteWorkspace,
  readViewerSession,
} from "./workspace";
import { findingById, requireProjectAccess } from "./workspace";

export interface OrgWritePayload {
  insertOrgs?: Organization[];
  upsertMemberships?: OrgMembership[];
  deleteMembershipIds?: string[];
  deleteOrgIds?: string[];
}

export interface OrgWriteContext {
  db: WorkspaceSlice;
  userId: string;
  githubLogin: string | null;
  organizations: Organization[];
}

/**
 * Shared commit tail for locked project writes: persists the handler payload
 * against a pre-handler snapshot. Callers MUST snapshot before invoking the
 * handler — `persistProjectRows` diffs payload against `loadedSlice`, so a
 * snapshot taken after in-place mutation diffs to empty and silently drops
 * the write. Lock resolution stays in each caller — cookie-probe vs
 * finding-preview follow different protocols.
 */
async function commitLockedProjectPayload(
  tx: DrizzleDb,
  loadedSlice: ProjectSlice,
  actor: string | null | undefined,
  payload: ProjectWritePayload | void,
): Promise<void> {
  const resolved = payload ?? {};
  stampEvidenceActor(resolved.evidence, actor);
  await persistProjectRows(tx, resolved, { loadedSlice });
}

/**
 * Snapshots the loaded slice before the handler mutates rows in place:
 * persist compares against what was loaded, not the post-mutation state.
 */
function snapshotLoadedSlice(db: WorkspaceSlice, projectId: string): ProjectSlice {
  return snapshotProjectSlice(
    db.requirements,
    db.findings,
    db.remediations,
    db.alerts,
    projectId,
  );
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

    // Snapshot before the handler mutates rows in place: persist compares
    // against what was loaded, not the post-mutation state (see
    // `commitLockedProjectPayload`).
    const loadedSlice = snapshotLoadedSlice(workspace.db, projectId);
    const payload = await fn(workspace);
    await commitLockedProjectPayload(
      tx,
      loadedSlice,
      githubLogin ?? userId,
      payload,
    );
  });
}

/** Finding-scoped project write: locks the finding's project, not the cookie project. */
export async function withFindingWrite(
  findingId: string,
  permission: Permission,
  fn: (ctx: {
    db: WorkspaceSlice;
    finding: Finding;
    workspace: ProjectWriteWorkspace;
  }) => Promise<ProjectWritePayload | void>,
): Promise<void> {
  const { userId, githubLogin, preferredOrgId } = await readViewerSession();

  const drizzle = await getDrizzle();
  // Membership gate BEFORE the lock: resolve the finding's project and check
  // access without holding anything, so a non-member can neither probe
  // another tenant's project lock nor force a full locked load. The in-lock
  // `requireOnFindingProject` below stays as the enforcement (covers
  // revoke-between-check-and-lock).
  const previewAccess = await getFindingById(drizzle, findingId);
  if (!previewAccess) throw new PublicError("Unknown finding.");
  await requireProjectAccess(previewAccess.projectId, permission);

  return drizzle.transaction(async (tx) => {
    const preview = await getFindingById(tx, findingId);
    if (!preview) throw new PublicError("Unknown finding.");
    const projectId = preview.projectId;

    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));

    const db = await loadProjectWriteDb(tx, {
      userId,
      githubLogin,
      activeProjectId: projectId,
    });
    const base = prepareWorkspaceState(
      db,
      userId,
      githubLogin,
      preferredOrgId,
      projectId,
    );
    const lockedProject =
      db.projects.find((candidate) => candidate.id === projectId) ??
      base.project;
    const workspace: ProjectWriteWorkspace = {
      ...base,
      project: lockedProject,
      db,
    };
    const finding = findingById(db, findingId);
    requireOnFindingProject(workspace, finding, permission);

    const loadedSlice = snapshotLoadedSlice(workspace.db, projectId);
    const payload = await fn({ db, finding, workspace });
    await commitLockedProjectPayload(
      tx,
      loadedSlice,
      githubLogin ?? userId,
      payload,
    );
  });
}

interface LockedTenancyContext {
  tx: DrizzleDb;
  db: WorkspaceSlice;
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
  const session = await getSession();
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
  ) =>
    | Promise<OrgWritePayload & { result: T }>
    | (OrgWritePayload & { result: T }),
): Promise<T> {
  return withLockedTenancy(
    { activeProjectId: null },
    async ({ tx, db, userId, githubLogin }) => {
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
        // Tenant erasure precedes the row deletes: org deletion honors data
        // erasure (owner-gated upstream); project disconnect keeps retention.
        await deleteEvidenceForOrg(tx, id);
        await deleteOrganizationRow(tx, id);
      }

      return result;
    },
  );
}

export interface ConnectWritePayload {
  insertProjects?: Project[];
  deleteProjectIds?: string[];
  evidence?: EvidenceRecord[];
}

export interface ConnectWriteContext {
  db: WorkspaceSlice;
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
    stampEvidenceActor(evidence, githubLogin ?? userId);
    await insertEvidenceRecords(tx, evidence ?? []);

    return result;
  });
}
