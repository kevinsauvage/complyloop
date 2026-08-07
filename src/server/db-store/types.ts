import type {
  Alert,
  Assessment,
  Control,
  EvidenceRecord,
  Finding,
  Framework,
  OrgMembership,
  Organization,
  Project,
  Remediation,
  Requirement,
} from "@/core/types";

/**
 * In-memory persistence shape. Callers mutate this object and persist via
 * `withDbWrite` / `saveDb` (Postgres).
 */
export interface Db {
  frameworks: Framework[];
  controls: Control[];
  organizations: Organization[];
  memberships: OrgMembership[];
  projects: Project[];
  /** Which project the UI and actions currently target. */
  activeProjectId: string | null;
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
    frameworks: [],
    controls: [],
    organizations: [],
    memberships: [],
    projects: [],
    activeProjectId: null,
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}
