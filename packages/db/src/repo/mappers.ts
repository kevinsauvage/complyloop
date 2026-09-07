import type { Alert, Assessment, AssessmentSnapshot, EvidenceRecord, Finding, Remediation } from "../types";
import type {
  OrgMembership,
  Organization,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import type { AssessmentPayload } from "../schema.ts";

/**
 * Source of truth is the typed `payload` (JSONB column); the sibling indexed
 * columns (id, projectId, status, …) are projections kept in sync here so the
 * DB can index/filter without a column explosion. Repo functions are the only
 * writers; a domain object always maps to a row with these helpers — never
 * set a projected column independently of its payload.
 */

export function organizationToRow(org: Organization) {
  return { id: org.id, slug: org.slug, payload: org };
}

export function membershipToRow(membership: OrgMembership) {
  return {
    id: membership.id,
    orgId: membership.orgId,
    userId: membership.userId ?? null,
    githubLogin: membership.githubLogin,
    role: membership.role,
    payload: membership,
  };
}

export function projectToRow(project: Project) {
  return {
    id: project.id,
    name: project.name,
    ownerUserId: project.ownerUserId ?? null,
    orgId: project.orgId,
    payload: project,
  };
}

export function requirementToRow(requirement: Requirement) {
  return {
    id: requirement.id,
    projectId: requirement.projectId,
    controlId: requirement.controlId,
    status: requirement.status,
    payload: requirement,
  };
}

function assessmentPayloadFrom(assessment: Assessment): AssessmentPayload {
  const { snapshot, ...payload } = assessment;
  void snapshot;
  return payload;
}

export function assessmentToRow(assessment: Assessment) {
  return {
    id: assessment.id,
    projectId: assessment.projectId,
    payload: assessmentPayloadFrom(assessment),
  };
}

export function assessmentFromRow(
  row: { payload: AssessmentPayload },
  snapshot?: AssessmentSnapshot,
): Assessment {
  return snapshot ? { ...row.payload, snapshot } : { ...row.payload };
}

export function findingToRow(finding: Finding) {
  return {
    id: finding.id,
    projectId: finding.projectId,
    controlId: finding.controlId,
    assessmentId: finding.assessmentId,
    status: finding.status,
    payload: finding,
  };
}

export function remediationToRow(remediation: Remediation) {
  return {
    id: remediation.id,
    findingId: remediation.findingId,
    status: remediation.status,
    payload: remediation,
  };
}

export function alertToRow(alert: Alert) {
  return {
    id: alert.id,
    projectId: alert.projectId,
    read: alert.read,
    payload: alert,
  };
}

export function newEvidenceRecord(
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  };
}
