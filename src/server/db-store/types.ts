import type { Control, Framework, OrgMembership, Organization, Project, Requirement } from "@/core/project-types";
import type { Alert, Assessment, EvidenceRecord, Finding, Remediation } from "@/core/finding-types";
import { fullLoadScope } from "./postgres-scope";

/**
 * How a {@link Db} snapshot was loaded. Persist must honor scoped loads so
 * prune never deletes rows outside the snapshot (other tenants / projects).
 */
export type DbLoadScope =
  | { mode: "full" }
  | {
      mode: "scoped";
      orgIds: readonly string[];
      projectIds: readonly string[];
      /**
       * Max evidence rows (newest first) for the scoped projects.
       * `0` = load none (typical writes). Omit = all matching rows.
       */
      evidenceLimit?: number;
    };

/**
 * In-memory persistence shape. Callers mutate this object and persist via
 * `withDbWrite` (Postgres).
 */
export interface Db {
  frameworks: Framework[];
  controls: Control[];
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
  /** How this snapshot was loaded; omit on hand-built test fixtures (full sync). */
  loadScope?: DbLoadScope;
}

export function emptyDb(): Db {
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
    loadScope: fullLoadScope(),
  };
}
