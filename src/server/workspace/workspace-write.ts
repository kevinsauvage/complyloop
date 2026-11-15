import "server-only";

import type { EvidenceRecord } from "@complyloop/analysis-core/contract/entities";
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
  deleteEvidenceForOrg,
  insertEvidenceRecords,
} from "@complyloop/db/repo/evidence";
import {
  deleteMembership,
  deleteOrganizationRow,
  insertOrganization,
  listMembershipsForOrgs,
  upsertMembership,
} from "@complyloop/db/repo/orgs";
import {
  deleteProject,
  getProjectById,
  insertProject,
} from "@complyloop/db/repo/projects";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { loadTenancyDb } from "@complyloop/db/workspace-load";

import type { Permission } from "@/core/rbac";

import { getSession } from "../auth-session";
import { orgsForUser } from "./org-queries";
import { stampEvidenceActor } from "./project-rows";
import { assertProjectPermission } from "./project-visibility";

/**
 * In-transaction handle for one project's mutations. Callbacks load the rows
 * they touch through repo functions and write them back explicitly; there is
 * no project-wide load, snapshot or diff.
 */
export interface ProjectTx {
  tx: DrizzleDb;
  project: Project;
  userId: string | null;
  githubLogin: string | null;
  /** Evidence author (GitHub login, else user id); undefined = system. */
  actor: string | undefined;
}

/**
 * Authorizes the viewer against the project's org. Runs before the advisory
 * lock (a non-member must not be able to serialize another tenant's project)
 * and again after it (membership could be revoked in between).
 */
async function authorizeProjectWrite(
  tx: DrizzleDb,
  projectId: string,
  permission: Permission,
  userId: string,
  githubLogin: string | null,
): Promise<Project> {
  const project = await getProjectById(tx, projectId);
  if (!project) throw new PublicError("Unknown project.");
  const memberships = await listMembershipsForOrgs(tx, [project.orgId]);
  assertProjectPermission(
    project,
    { userId, githubLogin, organizations: [], memberships },
    permission,
  );
  return project;
}

/**
 * The single project write primitive: per-project advisory lock, one
 * transaction, explicit row writes. Every writer of a project's findings,
 * remediations, requirements or alerts holds this lock, which is what makes a
 * read-modify-write inside the callback atomic — a concurrent human decision
 * cannot be reverted by a stale in-memory copy.
 */
export async function withProjectTx<T>(
  projectId: string,
  permission: Permission,
  fn: (ctx: ProjectTx) => Promise<T>,
): Promise<T> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    await authorizeProjectWrite(tx, projectId, permission, userId, githubLogin);
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));
    const project = await authorizeProjectWrite(
      tx,
      projectId,
      permission,
      userId,
      githubLogin,
    );
    return fn({
      tx,
      project,
      userId,
      githubLogin,
      actor: githubLogin ?? userId ?? undefined,
    });
  });
}

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
  return withLockedTenancy(async ({ tx, db, userId, githubLogin }) => {
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
  });
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
 * Connect/disconnect writes: tenancy load, user-scoped org lock (not the
 * project lock — a connect has no project row yet), persist insert/delete
 * project + evidence.
 */
export async function withConnectWrite<T>(
  fn: (
    ctx: ConnectWriteContext,
  ) =>
    | Promise<ConnectWritePayload & { result: T }>
    | (ConnectWritePayload & { result: T }),
): Promise<T> {
  return withLockedTenancy(async ({ tx, db, userId, githubLogin }) => {
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
