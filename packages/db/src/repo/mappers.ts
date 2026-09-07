import type { Alert, Assessment, AssessmentSnapshot, EvidenceRecord, Finding, Remediation } from "../types";
import type {
  OrgMembership,
  Organization,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import type { AssessmentPayload } from "../schema.ts";
import { evidence } from "../schema.ts";

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

export function evidenceToRow(record: EvidenceRecord) {
  return {
    id: record.id,
    at: record.at,
    kind: record.kind,
    summary: record.summary,
    projectId: record.projectId ?? null,
    controlId: record.controlId ?? null,
    findingId: record.findingId ?? null,
    assessmentId: record.assessmentId ?? null,
    detail: record.detail ?? null,
  };
}

export function rowToEvidence(
  row: typeof evidence.$inferSelect,
): EvidenceRecord {
  return {
    id: row.id,
    at: row.at,
    kind: row.kind as EvidenceRecord["kind"],
    summary: row.summary,
    projectId: row.projectId ?? undefined,
    controlId: row.controlId ?? undefined,
    findingId: row.findingId ?? undefined,
    assessmentId: row.assessmentId ?? undefined,
    detail: row.detail ?? undefined,
  };
}

/** How many rows an export should take, and whether the table was larger. */
export function evidenceExportWindow(
  total: number,
  limit: number,
): { take: number; truncated: boolean } {
  return { take: Math.min(total, limit), truncated: total > limit };
}

/** Zero-based OFFSET for a 1-based UI page. */
export function sqlPageOffset(page: number, pageSize: number): number {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return (safePage - 1) * pageSize;
}
