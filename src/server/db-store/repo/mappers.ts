import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/finding-types";
import type {
  Control,
  Framework,
  OrgMembership,
  Organization,
  Project,
  Requirement,
} from "@/core/project-types";
import type { AssessmentPayload } from "../schema";

export function frameworkToRow(framework: Framework) {
  return { id: framework.id, payload: framework };
}

export function controlToRow(control: Control) {
  return {
    id: control.id,
    frameworkId: control.frameworkId,
    payload: control,
  };
}

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
