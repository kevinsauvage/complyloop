import type {
  Alert,
  Assessment,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  Organization,
  OrgMembership,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";

// Domain entities live in the contract — re-exported here so persistence
// mappers and the `Db` slice keep compiling while app/core/ai import from
// `@complyloop/analysis-core/contract/entities` directly.
export type {
  Alert,
  AlertKind,
  Assessment,
  AssessmentSnapshot,
  EvidenceKind,
  EvidenceRecord,
  FileChange,
  Finding,
  Remediation,
  RemediationHistoryEntry,
} from "@complyloop/analysis-core/contract/entities";

/**
 * In-memory slice for **writes and assessment** only.
 * Request pages use tenancy Workspace + repo / getProjectRuntime reads.
 * Persist changes via row-level repo functions — never bulk-sync this object.
 */
export interface Db {
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

export function emptyDb(): Db {
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
