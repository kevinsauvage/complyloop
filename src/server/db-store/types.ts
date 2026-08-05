import type {
  Alert,
  Assessment,
  Control,
  EvidenceRecord,
  Finding,
  Framework,
  Project,
  Remediation,
  Requirement,
} from "@/core/types";

/**
 * In-memory persistence shape. Callers mutate this object and call saveDb.
 * Backed by JSON file or Postgres depending on DATABASE_URL.
 */
export interface Db {
  frameworks: Framework[];
  controls: Control[];
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
