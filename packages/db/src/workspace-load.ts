import { desc, eq } from "drizzle-orm";

import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";

import type { DrizzleDb } from "./postgres.ts";
import { listAlertsForProject } from "./repo/alerts.ts";
import {
  getLatestAssessmentSnapshot,
  listLatestAssessmentForProject,
} from "./repo/assessments.ts";
import { WORKSPACE_EVIDENCE_LIMIT } from "./repo/evidence.ts";
import { listFindingsForProject } from "./repo/findings.ts";
import {
  rowToEvidence,
} from "./repo/mappers.ts";
import {
  listMembershipsForOrgs,
  listOrganizationsForUser,
  listOrgIdsForUser,
  provisionPersonalOrg,
} from "./repo/orgs.ts";
import {
  getProjectById,
  listProjectsForOrgs,
} from "./repo/projects.ts";
import { listRemediationsForProject } from "./repo/remediations.ts";
import { listRequirementsForProject } from "./repo/requirements.ts";
import { evidence } from "./schema.ts";
import type { WorkspaceSlice } from "./types.ts";

const EMPTY_RUNTIME: Pick<
  WorkspaceSlice,
  "requirements" | "assessments" | "findings" | "remediations" | "alerts"
> = {
  requirements: [],
  assessments: [],
  findings: [],
  remediations: [],
  alerts: [],
};

async function loadEvidenceWindow(
  drizzle: DrizzleDb,
  projectId: string,
  limit: number,
): Promise<WorkspaceSlice["evidence"]> {
  if (limit === 0) return [];
  const rows = await drizzle
    .select()
    .from(evidence)
    .where(eq(evidence.projectId, projectId))
    .orderBy(desc(evidence.at))
    .limit(limit);
  return rows.reverse().map(rowToEvidence);
}

/** Compliance rows for one project — single query path shared by writes and reads. */
export interface LoadProjectRuntimeOptions {
  /**
   * Restrict finding rows to these statuses. Omit for full history (writes,
   * assessments, reports, org export). Pages that only need open findings pass
   * `["open"]` so project history does not grow request payloads.
   */
  findingStatuses?: readonly FindingStatus[];
}

export async function loadProjectRuntime(
  drizzle: DrizzleDb,
  projectId: string,
  options: LoadProjectRuntimeOptions = {},
): Promise<
  Pick<
    WorkspaceSlice,
    "requirements" | "assessments" | "findings" | "remediations" | "alerts"
  >
> {
  const [requirementsList, findingsList, remediationsList, alertsList, assessmentsList] =
    await Promise.all([
      listRequirementsForProject(drizzle, projectId),
      listFindingsForProject(drizzle, projectId, {
        statuses: options.findingStatuses,
      }),
      listRemediationsForProject(drizzle, projectId),
      listAlertsForProject(drizzle, projectId),
      // Latest only — the app consumes latestAssessmentFor + "has any".
      listLatestAssessmentForProject(drizzle, projectId),
    ]);

  return {
    requirements: requirementsList,
    assessments: assessmentsList,
    findings: findingsList,
    remediations: remediationsList,
    alerts: alertsList,
  };
}

interface WorkspaceLoadInput {
  userId: string | null;
  githubLogin: string | null;
  activeProjectId: string | null;
  evidenceLimit?: number;
}

async function loadWorkspaceTenancy(
  drizzle: DrizzleDb,
  input: Pick<WorkspaceLoadInput, "userId" | "githubLogin" | "activeProjectId">,
): Promise<{
  organizations: WorkspaceSlice["organizations"];
  memberships: WorkspaceSlice["memberships"];
  projects: WorkspaceSlice["projects"];
  activeProjectId: string | null;
}> {
  // Steady-state claim: signed-in reloads attach pending invites (userId) so
  // RBAC works without re-auth. provisionPersonalOrg early-returns when already
  // provisioned (one indexed read).
  if (input.userId && input.githubLogin) {
    await provisionPersonalOrg(drizzle, input.userId, input.githubLogin);
  }
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

/** Orgs, memberships, and projects only — no runtime rows or evidence window. */
export async function loadTenancyDb(
  drizzle: DrizzleDb,
  input: Pick<WorkspaceLoadInput, "userId" | "githubLogin" | "activeProjectId">,
): Promise<WorkspaceSlice> {
  const { organizations, memberships, projects } =
    await loadWorkspaceTenancy(drizzle, input);
  return {
    organizations,
    memberships,
    projects,
    ...EMPTY_RUNTIME,
    evidence: [],
  };
}

/**
 * Loads tenancy + the full project runtime + a bounded evidence window for a
 * write. Handlers clone onto a payload; `persistProjectRows` derives the
 * per-entity stale-write guards from this full snapshot.
 */
export async function loadProjectWriteDb(
  drizzle: DrizzleDb,
  input: WorkspaceLoadInput,
): Promise<WorkspaceSlice> {
  const { organizations, memberships, projects, activeProjectId } =
    await loadWorkspaceTenancy(drizzle, input);

  if (activeProjectId == null) {
    return {
      organizations,
      memberships,
      projects,
      ...EMPTY_RUNTIME,
      evidence: [],
    };
  }

  const [runtime, evidenceWindow] = await Promise.all([
    loadProjectRuntime(drizzle, activeProjectId),
    loadEvidenceWindow(
      drizzle,
      activeProjectId,
      input.evidenceLimit ?? WORKSPACE_EVIDENCE_LIMIT,
    ),
  ]);

  return {
    organizations,
    memberships,
    projects,
    ...runtime,
    evidence: evidenceWindow,
  };
}

/** Loads a single project slice for assessment runs (includes latest snapshot). */
export async function loadProjectAssessmentDb(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<WorkspaceSlice> {
  const project = await getProjectById(drizzle, projectId);
  if (!project) {
    return {
      organizations: [],
      memberships: [],
      projects: [],
      ...EMPTY_RUNTIME,
      evidence: [],
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
    organizations,
    memberships,
    projects: [project],
    ...runtime,
    evidence: [],
    alerts: runtime.alerts,
  };
}
