import "server-only";
import { cache } from "react";
import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  WORKSPACE_EVIDENCE_LIMIT,
  listEvidencePageForProject,
} from "@complyloop/db/repo/evidence";
import { loadProjectRuntime } from "@complyloop/db/workspace-load";
import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
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
 * sections share one round-trip set. Delegates to {@link loadProjectRuntime}.
 * Pass `{ includeEvidence: false }` when the caller loads evidence separately
 * (e.g. report exports), so the window read is not issued twice. Pass
 * `{ findingStatuses: ["open"] }` on read pages that never need history so an
 * unbounded findings table does not inflate every response.
 */
export const getProjectRuntime = cache(
  async (
    projectId: string,
    options?: {
      includeEvidence?: boolean;
      findingStatuses?: readonly FindingStatus[];
    },
  ): Promise<ProjectRuntime> => {
    const drizzle = await getDrizzle();
    const [runtime, evidenceNewestFirst] = await Promise.all([
      loadProjectRuntime(drizzle, projectId, {
        findingStatuses: options?.findingStatuses,
      }),
      options?.includeEvidence === false
        ? []
        : listEvidencePageForProject(
            drizzle,
            projectId,
            1,
            WORKSPACE_EVIDENCE_LIMIT,
          ),
    ]);
    return {
      ...runtime,
      // Match prior workspace window: oldest → newest.
      evidence: [...evidenceNewestFirst].reverse(),
    };
  },
);
