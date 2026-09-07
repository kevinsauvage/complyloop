import { cache } from "react";
import { getDrizzle } from "@complyloop/db/client";
import { listLatestAssessmentForProject } from "@complyloop/db/repo/assessments";
import { listAlertsForProject } from "@complyloop/db/repo/alerts";
import {
  WORKSPACE_EVIDENCE_LIMIT,
  listEvidencePageForProject,
} from "@complyloop/db/repo/evidence";
import { listFindingsForProject } from "@complyloop/db/repo/findings";
import { listRemediationsForProject } from "@complyloop/db/repo/remediations";
import { listRequirementsForProject } from "@complyloop/db/repo/requirements";
import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/db/types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";

/** Active-project compliance rows for page reads (not the tenancy Workspace). */
export interface ProjectRuntime {
  requirements: Requirement[];
  assessments: Assessment[];
  findings: Finding[];
  remediations: Remediation[];
  alerts: Alert[];
  evidence: EvidenceRecord[];
}

/**
 * Loads runtime rows for one project. Memoized per React request so dashboard
 * sections share one round-trip set.
 */
export const getProjectRuntime = cache(
  async (projectId: string): Promise<ProjectRuntime> => {
    const drizzle = await getDrizzle();
    const [requirements, findings, remediations, alerts, assessments, evidenceNewestFirst] =
      await Promise.all([
        listRequirementsForProject(drizzle, projectId),
        listFindingsForProject(drizzle, projectId),
        listRemediationsForProject(drizzle, projectId),
        listAlertsForProject(drizzle, projectId),
        listLatestAssessmentForProject(drizzle, projectId),
        listEvidencePageForProject(drizzle, projectId, 1, WORKSPACE_EVIDENCE_LIMIT),
      ]);
    return {
      requirements,
      findings,
      remediations,
      alerts,
      assessments,
      // Match prior workspace window: oldest → newest.
      evidence: [...evidenceNewestFirst].reverse(),
    };
  },
);
