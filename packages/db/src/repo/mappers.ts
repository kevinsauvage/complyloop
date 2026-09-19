import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import {
  type AssessmentEngine,
  engineFor,
} from "@complyloop/analysis-core/contract/finding-types";
import type {
  Organization,
  OrgMembership,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { SEVERITY_RANK } from "@complyloop/analysis-core/contract/statuses";

import type { AssessmentPayload } from "../schema.ts";
import { evidence } from "../schema.ts";

/**
 * Source of truth is the typed `payload` (JSONB column); the sibling indexed
 * columns (id, projectId, status, …) are projections kept in sync here so the
 * DB can index/filter without a column explosion. Repo functions are the only
 * writers; a domain object always maps to a row with these helpers — never
 * set a projected column independently of its payload.
 */

/** Row = the typed payload plus its indexed projection columns. */
function withPayload<
  T extends { id: string },
  E extends Record<string, unknown>,
>(entity: T, extra: E) {
  return { id: entity.id, ...extra, payload: entity };
}

export function organizationToRow(org: Organization) {
  return withPayload(org, { slug: org.slug });
}

export function membershipToRow(membership: OrgMembership) {
  return withPayload(membership, {
    orgId: membership.orgId,
    userId: membership.userId ?? null,
    githubLogin: membership.githubLogin,
    role: membership.role,
  });
}

export function projectToRow(project: Project) {
  return withPayload(project, {
    name: project.name,
    ownerUserId: project.ownerUserId ?? null,
    orgId: project.orgId,
  });
}

export function requirementToRow(requirement: Requirement) {
  return withPayload(requirement, {
    projectId: requirement.projectId,
    controlId: requirement.controlId,
    status: requirement.status,
  });
}

function assessmentPayloadFrom(assessment: Assessment): AssessmentPayload {
  const { snapshot, ...payload } = assessment;
  void snapshot;
  return payload;
}

export function assessmentToRow(assessment: Assessment) {
  return withPayload(assessmentPayloadFrom(assessment), {
    projectId: assessment.projectId,
  });
}

export function assessmentFromRow(
  row: { payload: AssessmentPayload },
  snapshot?: AssessmentSnapshot,
): Assessment {
  return snapshot ? { ...row.payload, snapshot } : { ...row.payload };
}

export function findingToRow(finding: Finding) {
  return withPayload(finding, {
    projectId: finding.projectId,
    controlId: finding.controlId,
    assessmentId: finding.assessmentId,
    status: finding.status,
    // Unknown severities sort last (same as `minor`); core `severityRank`
    // throws on them, but the write path must never fail on a projection.
    severityRank: SEVERITY_RANK[finding.severity] ?? 3,
    engine: engineForRow(finding),
  });
}

/**
 * Engine bucket projection (`engineFor` over the payload analyzer). Unknown
 * legacy analyzers fall back to `ast` (same default as a missing analyzer);
 * core throws on them, but the write path must never fail on a projection.
 */
function engineForRow(finding: Finding): AssessmentEngine {
  try {
    return engineFor(finding);
  } catch {
    return "ast";
  }
}

export function remediationToRow(remediation: Remediation) {
  return withPayload(remediation, {
    findingId: remediation.findingId,
    status: remediation.status,
  });
}

export function alertToRow(alert: Alert) {
  return withPayload(alert, {
    projectId: alert.projectId,
    read: alert.read,
  });
}

export function newEvidenceRecord(
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  return {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
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
    actor: record.actor ?? null,
    detail: record.detail ?? null,
  };
}

/** Drizzle returns null for unset columns; domain uses `undefined`. */
function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export function rowToEvidence(
  row: typeof evidence.$inferSelect,
): EvidenceRecord {
  return {
    id: row.id,
    at: row.at,
    kind: row.kind as EvidenceRecord["kind"],
    summary: row.summary,
    projectId: nullToUndefined(row.projectId),
    controlId: nullToUndefined(row.controlId),
    findingId: nullToUndefined(row.findingId),
    assessmentId: nullToUndefined(row.assessmentId),
    actor: nullToUndefined(row.actor),
    detail: nullToUndefined(row.detail),
  };
}
