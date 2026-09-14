import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { Organization, OrgMembership, Project } from "@complyloop/analysis-core/contract/project-types";

/**
 * In-memory slice for **writes and assessment** only.
 * Request pages use tenancy Workspace + repo / getProjectRuntime reads.
 * Persist changes via row-level repo functions — never bulk-sync this object.
 *
 * Domain entities (Finding, Remediation, …) live in
 * `@complyloop/analysis-core/contract/entities` — do not re-export them here.
 */
export interface WorkspaceSlice {
  organizations: Organization[];
  memberships: OrgMembership[];
  projects: Project[];
  requirements: Requirement[];
  assessments: Assessment[];
  findings: Finding[];
  remediations: Remediation[];
  evidence: EvidenceRecord[];
  /** Regression / monitoring alerts (append-friendly, markable as read). */
  alerts: Alert[];
}

export function emptyWorkspaceSlice(): WorkspaceSlice {
  return {
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
