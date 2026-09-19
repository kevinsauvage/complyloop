import "server-only";

import type {
  Organization,
  OrgMembership,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import { listAlertsForProjects } from "@complyloop/db/repo/alerts";
import { listAssessmentsForProjects } from "@complyloop/db/repo/assessments";
import { listEvidenceForExportForProjects } from "@complyloop/db/repo/evidence";
import { listFindingsForProjects } from "@complyloop/db/repo/findings";
import { nextUniqueSlug, slugifyOrgName } from "@complyloop/db/repo/orgs";
import { listRemediationsForProjects } from "@complyloop/db/repo/remediations";
import { listRequirementsForProjects } from "@complyloop/db/repo/requirements";
import type { WorkspaceSlice } from "@complyloop/db/types";

import {
  buildOrgMembershipIndex,
  membershipsForOrg,
  roleInOrg,
} from "./org-queries";

/** Picks an unused slug from a read-only org list (does not mutate). */
function uniqueOrgSlug(
  db: Pick<WorkspaceSlice, "organizations">,
  base: string,
): string {
  return nextUniqueSlug(base, new Set(db.organizations.map((o) => o.slug)));
}

export interface CreateOrganizationResult {
  org: Organization;
  membership: OrgMembership;
}

/** Builds org + owner membership without mutating `db`. */
export function createOrganization(
  db: Pick<WorkspaceSlice, "organizations">,
  input: { name: string; creatorUserId: string; githubLogin: string },
): CreateOrganizationResult {
  const name = input.name.trim();
  if (!name) throw new PublicError("Organization name is required.");
  const login = input.githubLogin.trim();
  if (!login) throw new PublicError("GitHub login is required.");

  return buildOrgWithOwner(db, {
    name,
    slugBase: name,
    ownerUserId: input.creatorUserId,
    githubLogin: login,
  });
}

function buildOrgWithOwner(
  db: Pick<WorkspaceSlice, "organizations">,
  input: {
    name: string;
    slugBase: string;
    ownerUserId: string;
    githubLogin: string;
  },
): CreateOrganizationResult {
  const org: Organization = {
    id: crypto.randomUUID(),
    name: input.name,
    slug: uniqueOrgSlug(db, slugifyOrgName(input.slugBase)),
    createdAt: new Date().toISOString(),
  };
  const membership: OrgMembership = {
    id: crypto.randomUUID(),
    orgId: org.id,
    role: "owner",
    userId: input.ownerUserId,
    githubLogin: input.githubLogin,
    createdAt: new Date().toISOString(),
  };
  return { org, membership };
}

/** Machine-readable export of org-scoped, user-visible product data. */
export function exportOrgData(
  db: WorkspaceSlice,
  orgId: string,
  actorUserId: string,
  options: { evidenceTruncatedProjectIds?: readonly string[] } = {},
): Record<string, unknown> {
  const index = buildOrgMembershipIndex(db.memberships);
  if (roleInOrg(index, orgId, actorUserId) !== "owner") {
    throw new PublicError("Only the organization owner can export data.");
  }
  const org = db.organizations.find((candidate) => candidate.id === orgId);
  if (!org) throw new PublicError("Organization not found.");

  const projects = db.projects.filter((project) => project.orgId === orgId);
  const projectIds = new Set(projects.map((project) => project.id));
  const findings = db.findings.filter((finding) =>
    projectIds.has(finding.projectId),
  );
  const findingIds = new Set(findings.map((finding) => finding.id));
  const evidenceTruncatedProjectIds = [
    ...(options.evidenceTruncatedProjectIds ?? []),
  ];

  return {
    exportedAt: new Date().toISOString(),
    organization: org,
    memberships: membershipsForOrg(index, orgId).map((membership) => ({
      id: membership.id,
      orgId: membership.orgId,
      role: membership.role,
      userId: membership.userId ?? null,
      githubLogin: membership.githubLogin,
      createdAt: membership.createdAt,
    })),
    projects,
    requirements: db.requirements.filter((requirement) =>
      projectIds.has(requirement.projectId),
    ),
    assessments: db.assessments.filter((assessment) =>
      projectIds.has(assessment.projectId),
    ),
    findings,
    remediations: db.remediations.filter((remediation) =>
      findingIds.has(remediation.findingId),
    ),
    evidence: db.evidence.filter(
      (entry) => entry.projectId != null && projectIds.has(entry.projectId),
    ),
    alerts: db.alerts.filter((alert) => projectIds.has(alert.projectId)),
    evidenceTruncated: evidenceTruncatedProjectIds.length > 0,
    evidenceTruncatedProjectIds,
  };
}

export interface DeleteOrganizationResult {
  deleteMembershipIds: string[];
}

/**
 * Validates owner delete and returns membership ids to remove. Does not mutate
 * `db` — DB FK cascade handles projects; `withOrgWrite` erases the org's
 * evidence first (tenant erasure via deleteEvidenceForOrg).
 */
export function deleteOrganization(
  db: WorkspaceSlice,
  orgId: string,
  actorUserId: string,
): DeleteOrganizationResult {
  const index = buildOrgMembershipIndex(db.memberships);
  if (roleInOrg(index, orgId, actorUserId) !== "owner") {
    throw new PublicError(
      "Only the organization owner can delete the organization.",
    );
  }
  const org = db.organizations.find((candidate) => candidate.id === orgId);
  if (!org) throw new PublicError("Organization not found.");
  return {
    deleteMembershipIds: membershipsForOrg(index, orgId).map(
      (membership) => membership.id,
    ),
  };
}

/**
 * Full-history org export rows for the audit artifact. The workspace slice
 * is bounded (latest assessment, evidence window), so the export fetches
 * history directly with one set-based query per entity type (no per-project
 * N+1). Evidence is the exception: append-only forever, so each project
 * contributes its newest export window (`EVIDENCE_EXPORT_LIMIT`, same
 * semantics as the single-project export) instead of an unbounded read —
 * long-lived orgs would otherwise materialize hundreds of MB. Truncated
 * project ids ride along so the payload flags incompleteness.
 */
export async function loadOrgExportData(projectIds: string[]): Promise<{
  history: Pick<
    WorkspaceSlice,
    | "evidence"
    | "assessments"
    | "findings"
    | "remediations"
    | "requirements"
    | "alerts"
  >;
  evidenceTruncatedProjectIds: string[];
}> {
  const drizzle = await getDrizzle();
  const [
    evidenceExport,
    assessments,
    findings,
    remediations,
    requirements,
    alerts,
  ] = await Promise.all([
    listEvidenceForExportForProjects(drizzle, projectIds),
    listAssessmentsForProjects(drizzle, projectIds),
    listFindingsForProjects(drizzle, projectIds),
    listRemediationsForProjects(drizzle, projectIds),
    listRequirementsForProjects(drizzle, projectIds),
    listAlertsForProjects(drizzle, projectIds),
  ]);
  return {
    history: {
      evidence: evidenceExport.records,
      assessments,
      findings,
      remediations,
      requirements,
      alerts,
    },
    evidenceTruncatedProjectIds: evidenceExport.truncatedProjectIds,
  };
}
