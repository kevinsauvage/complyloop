import type { Control, Framework, OrgMembership, Organization, Project, Requirement } from "@/core/project-types";
import type { Alert, Assessment, EvidenceRecord, Finding, Remediation } from "@/core/finding-types";

/**
 * In-memory read model for workspace pages and domain helpers during mutations.
 * Persist changes via row-level repo functions — never bulk-sync this object.
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
  };
}
