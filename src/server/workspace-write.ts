import { auth } from "@/auth";
import type {
  OrgMembership,
  Organization,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle, type DrizzleDb } from "@complyloop/db/client";
import { WORKSPACE_EVIDENCE_LIMIT } from "@complyloop/db/queries";
import {
  persistProjectRows,
  requirementUpdatedAtById,
  updatedAtById,
  type ProjectWritePayload,
} from "@complyloop/db/repo/apply";
import {
  deleteMembership,
  deleteOrganizationRow,
  insertOrganization,
  upsertMembership,
} from "@complyloop/db/repo/orgs";
import {
  loadTargetedProjectWriteDb,
  loadWorkspaceDb,
} from "@complyloop/db/workspace-load";
import {
  acquireNamedPostgresAdvisoryLock,
  orgWriteLockKey,
  projectWriteLockKey,
} from "@complyloop/db/write-lock";
import { orgsForUser } from "./orgs";
import {
  prepareWorkspaceState,
  sessionWriteContext,
  type Workspace,
} from "./workspace";
import type { Db } from "./db";

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
  fn: (workspace: Workspace) => Promise<{ result: T; payload: ProjectWritePayload }>,
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
      const db =
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
            });
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
    const { result, payload } = await fn(workspace);

    if (scope.touch === "project") {
      const projectAfter = workspace.project ?? project;
      if (
        !payload.project &&
        projectBefore &&
        JSON.stringify(projectBefore) !== JSON.stringify(projectAfter)
      ) {
        payload.project = projectAfter;
      }
    }

    await persistProjectRows(tx, payload, staleGuards ?? {});

    return result;
  });
}

/**
 * Serializes project mutations under a per-project advisory lock. Pass
 * {@link ProjectWriteScope} to load only the rows you touch.
 */
export async function withProjectWrite<T>(
  scope: ProjectWriteScope,
  fn: (workspace: Workspace) => Promise<{ result: T; payload: ProjectWritePayload }>,
): Promise<T> {
  return runProjectWriteTransaction(scope, fn);
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

/**
 * Org-scoped mutation. The callback returns the rows to persist — no
 * JSON-diff of the in-memory slice.
 */
export async function withOrgWrite<T>(
  fn: (
    ctx: OrgWriteContext,
  ) => Promise<(OrgWritePayload & { result: T })> | (OrgWritePayload & { result: T }),
): Promise<T> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, orgWriteLockKey(userId));
    const db = await loadWorkspaceDb(tx, {
      userId,
      githubLogin,
      activeProjectId: null,
      evidenceLimit: 0,
    });
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
