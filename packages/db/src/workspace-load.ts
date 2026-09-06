import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "./types.ts";
import type { DrizzleDb } from "./client.ts";
import { rowToEvidence } from "./postgres-evidence.ts";
import { WORKSPACE_EVIDENCE_LIMIT } from "./postgres-scope.ts";
import { listOrgIdsForUser } from "./postgres-queries.ts";
import { listMembershipsForOrgs, listOrganizationsForUser } from "./repo/orgs.ts";
import {
  getProjectById,
  listProjectsForOrgs,
} from "./repo/projects.ts";
import {
  alerts,
  evidence,
  findings,
  remediations,
  requirements,
} from "./schema.ts";
import {
  getLatestAssessmentSnapshot,
  listLatestAssessmentForProject,
} from "./repo/assessments.ts";

const emptyCatalog = { frameworks: [], controls: [] } as const;

async function loadEvidenceWindow(
  drizzle: DrizzleDb,
  projectId: string,
  limit: number,
): Promise<Db["evidence"]> {
  if (limit === 0) return [];
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(eq(evidence.projectId, projectId))
    .orderBy(desc(evidence.at))
    .limit(limit);
  return rows.reverse().map(rowToEvidence);
}

async function loadProjectRuntime(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<
  Pick<
    Db,
    "requirements" | "assessments" | "findings" | "remediations" | "alerts"
  >
> {
  const [requirementRows, findingRows, alertRows, assessmentsList] =
    await Promise.all([
      drizzle
        .select()
        .from(requirements)
        .where(eq(requirements.projectId, projectId)),
      drizzle.select().from(findings).where(eq(findings.projectId, projectId)),
      drizzle.select().from(alerts).where(eq(alerts.projectId, projectId)),
      // Latest only — the app consumes latestAssessmentFor + "has any" (P2-3).
      listLatestAssessmentForProject(drizzle, projectId),
    ]);

  const findingIds = findingRows.map((row) => row.id);
  const remediationRows =
    findingIds.length === 0
      ? []
      : await drizzle
          .select()
          .from(remediations)
          .where(inArray(remediations.findingId, findingIds));

  return {
    requirements: requirementRows.map((row) => row.payload),
    assessments: assessmentsList,
    findings: findingRows.map((row) => row.payload),
    remediations: remediationRows.map((row) => row.payload),
    alerts: alertRows.map((row) => row.payload),
  };
}

export interface WorkspaceLoadInput {
  userId: string | null;
  githubLogin: string | null;
  activeProjectId: string | null;
  evidenceLimit?: number;
}

async function loadWorkspaceTenancy(
  drizzle: DrizzleDb,
  input: Pick<WorkspaceLoadInput, "userId" | "githubLogin" | "activeProjectId">,
): Promise<{
  organizations: Db["organizations"];
  memberships: Db["memberships"];
  projects: Db["projects"];
  activeProjectId: string | null;
}> {
  const orgIds = await listOrgIdsForUser(
    drizzle,
    input.userId,
    input.githubLogin,
  );
  const [organizations, memberships, projects] = await Promise.all([
    listOrganizationsForUser(drizzle, orgIds),
    listMembershipsForOrgs(drizzle, orgIds),
    listProjectsForOrgs(drizzle, orgIds),
  ]);

  const activeProjectId =
    input.activeProjectId &&
    projects.some((project) => project.id === input.activeProjectId)
      ? input.activeProjectId
      : (projects[0]?.id ?? null);

  return {
    organizations,
    memberships,
    projects,
    activeProjectId,
  };
}

export async function loadWorkspaceDb(
  drizzle: DrizzleDb,
  input: WorkspaceLoadInput,
): Promise<Omit<Db, "frameworks" | "controls">> {
  const { organizations, memberships, projects, activeProjectId } =
    await loadWorkspaceTenancy(drizzle, input);

  const runtime =
    activeProjectId != null
      ? await loadProjectRuntime(drizzle, activeProjectId)
      : {
          requirements: [],
          assessments: [],
          findings: [],
          remediations: [],
          alerts: [],
        };

  const evidenceRows =
    activeProjectId != null
      ? await loadEvidenceWindow(
          drizzle,
          activeProjectId,
          input.evidenceLimit ?? WORKSPACE_EVIDENCE_LIMIT,
        )
      : [];

  return {
    ...emptyCatalog,
    organizations,
    memberships,
    projects,
    ...runtime,
    evidence: evidenceRows,
  };
}

export interface TargetedProjectWriteLoadInput extends WorkspaceLoadInput {
  findingIds?: readonly string[];
  requirementIds?: readonly string[];
  /** Preload requirement rows for these controls (used before targeted refresh). */
  controlIds?: readonly string[];
}

async function loadTargetedProjectRuntime(
  drizzle: DrizzleDb,
  projectId: string,
  input: Pick<
    TargetedProjectWriteLoadInput,
    "findingIds" | "requirementIds" | "controlIds"
  >,
): Promise<
  Pick<Db, "requirements" | "findings" | "remediations" | "alerts" | "assessments">
> {
  const findingIds = [...(input.findingIds ?? [])];
  const requirementIds = [...(input.requirementIds ?? [])];
  const controlIds = [...(input.controlIds ?? [])];

  const findingRows =
    findingIds.length === 0
      ? []
      : await drizzle
          .select()
          .from(findings)
          .where(inArray(findings.id, findingIds));

  const findingControlIds = findingRows.map((row) => row.payload.controlId);
  const allControlIds = [
    ...new Set([...controlIds, ...findingControlIds]),
  ];

  const remediationRows =
    findingIds.length === 0
      ? []
      : await drizzle
          .select()
          .from(remediations)
          .where(inArray(remediations.findingId, findingIds));

  const requirementFilters = [];
  if (requirementIds.length > 0) {
    requirementFilters.push(inArray(requirements.id, requirementIds));
  }
  if (allControlIds.length > 0) {
    requirementFilters.push(inArray(requirements.controlId, allControlIds));
  }

  const requirementRows =
    requirementFilters.length === 0
      ? []
      : await drizzle
          .select()
          .from(requirements)
          .where(
            and(
              eq(requirements.projectId, projectId),
              requirementFilters.length === 1
                ? requirementFilters[0]!
                : or(...requirementFilters),
            ),
          );

  // Rows are already scoped to the active project in SQL.
  const projectRequirements = requirementRows.map((row) => row.payload);

  // Latest assessment + alerts are bounded per-project context the handler may
  // read; only the potentially-large requirements/findings/remediations are
  // scoped by id.
  const [assessmentsList, alertRows] = await Promise.all([
    listLatestAssessmentForProject(drizzle, projectId),
    drizzle.select().from(alerts).where(eq(alerts.projectId, projectId)),
  ]);

  return {
    requirements: projectRequirements,
    assessments: assessmentsList,
    findings: findingRows
      .map((row) => row.payload)
      .filter((finding) => finding.projectId === projectId),
    remediations: remediationRows.map((row) => row.payload),
    alerts: alertRows.map((row) => row.payload),
  };
}

/**
 * Loads tenancy + only the runtime rows touched by a hot-path write.
 * Findings outside the active project are dropped so RBAC checks still fail loud.
 */
export async function loadTargetedProjectWriteDb(
  drizzle: DrizzleDb,
  input: TargetedProjectWriteLoadInput,
): Promise<Omit<Db, "frameworks" | "controls">> {
  const { organizations, memberships, projects, activeProjectId } =
    await loadWorkspaceTenancy(drizzle, input);

  const runtime =
    activeProjectId != null
      ? await loadTargetedProjectRuntime(drizzle, activeProjectId, input)
      : {
          requirements: [],
          assessments: [],
          findings: [],
          remediations: [],
          alerts: [],
        };

  // Evidence window is bounded and append-accessible; give handlers a truthful
  // snapshot so a read of db.evidence reflects what is already persisted.
  const evidence =
    activeProjectId != null
      ? await loadEvidenceWindow(
          drizzle,
          activeProjectId,
          input.evidenceLimit ?? WORKSPACE_EVIDENCE_LIMIT,
        )
      : [];

  return {
    ...emptyCatalog,
    organizations,
    memberships,
    projects,
    ...runtime,
    evidence,
  };
}

/** Loads a single project slice for assessment runs (includes latest snapshot). */
export async function loadProjectAssessmentDb(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Omit<Db, "frameworks" | "controls">> {
  const project = await getProjectById(drizzle, projectId);
  if (!project) {
    return {
      ...emptyCatalog,
      organizations: [],
      memberships: [],
      projects: [],
      requirements: [],
      assessments: [],
      findings: [],
      remediations: [],
      evidence: [],
      alerts: [],
    };
  }

  const [runtime, latestSnapshot] = await Promise.all([
    loadProjectRuntime(drizzle, projectId),
    getLatestAssessmentSnapshot(drizzle, projectId),
  ]);

  if (latestSnapshot && runtime.assessments.length > 0) {
    const latest = runtime.assessments[0];
    runtime.assessments[0] = { ...latest, snapshot: latestSnapshot };
  }

  const orgIds = [project.orgId];
  const [organizations, memberships] = await Promise.all([
    listOrganizationsForUser(drizzle, orgIds),
    listMembershipsForOrgs(drizzle, orgIds),
  ]);

  return {
    ...emptyCatalog,
    organizations,
    memberships,
    projects: [project],
    ...runtime,
    evidence: [],
    alerts: runtime.alerts,
  };
}
