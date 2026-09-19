import "server-only";

import { cache } from "react";

import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { FindingStatus } from "@complyloop/analysis-core/contract/statuses";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  listEvidencePageForProject,
  WORKSPACE_EVIDENCE_LIMIT,
} from "@complyloop/db/repo/evidence";
import { FINDINGS_LIST_LOAD_LIMIT } from "@complyloop/db/repo/findings";
import { loadProjectRuntime } from "@complyloop/db/workspace-load";

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
 * unbounded findings table does not inflate every response. Status-scoped
 * loads are additionally capped at `FINDINGS_LIST_LOAD_LIMIT` rows in
 * severity-first order (callers compare against the SQL status counts and
 * surface truncation); omit `findingStatuses` for full history (writes,
 * reports, exports).
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
        // Cap page reads only — full-history callers omit findingStatuses.
        findingsLimit: options?.findingStatuses
          ? FINDINGS_LIST_LOAD_LIMIT
          : undefined,
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
