import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./types.ts";
import type { DrizzleDb } from "./client.ts";
import { rowToEvidence } from "./postgres-evidence.ts";
import { WORKSPACE_EVIDENCE_LIMIT } from "./postgres-scope.ts";
import { listOrgIdsForUser } from "./postgres-queries.ts";
import { loadCatalog } from "./repo/catalog.ts";
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
import { listAssessmentsForProject, getLatestAssessmentSnapshot } from "./repo/assessments.ts";

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
      listAssessmentsForProject(drizzle, projectId),
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

/**
 * Loads catalog + viewer orgs + project switcher list + active-project runtime.
 * Does not load assessment snapshots or other projects' runtime rows.
 */
export async function loadWorkspaceDb(
  drizzle: DrizzleDb,
  input: WorkspaceLoadInput,
): Promise<Db> {
  const orgIds = await listOrgIdsForUser(
    drizzle,
    input.userId,
    input.githubLogin,
  );
  const [catalog, organizations, memberships, projects] = await Promise.all([
    loadCatalog(drizzle),
    listOrganizationsForUser(drizzle, orgIds),
    listMembershipsForOrgs(drizzle, orgIds),
    listProjectsForOrgs(drizzle, orgIds),
  ]);

  const activeProjectId =
    input.activeProjectId &&
    projects.some((project) => project.id === input.activeProjectId)
      ? input.activeProjectId
      : (projects[0]?.id ?? null);

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
    ...catalog,
    organizations,
    memberships,
    projects,
    ...runtime,
    evidence: evidenceRows,
  };
}

/** Loads a single project slice for assessment runs (includes latest snapshot). */
export async function loadProjectAssessmentDb(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<Db> {
  const project = await getProjectById(drizzle, projectId);
  if (!project) {
    return {
      frameworks: [],
      controls: [],
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

  const [catalog, runtime, latestSnapshot] = await Promise.all([
    loadCatalog(drizzle),
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
    ...catalog,
    organizations,
    memberships,
    projects: [project],
    ...runtime,
    evidence: [],
    alerts: runtime.alerts,
  };
}
