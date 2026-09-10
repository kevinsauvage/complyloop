import "server-only";
import type { OrgMembership, Organization } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { Db } from "@complyloop/db/types";
import { nextUniqueSlug, slugifyOrgName } from "@complyloop/db/repo/orgs";
import {
  buildOrgMembershipIndex,
  membershipsForOrg,
  roleInOrg,
} from "./org-queries";

/** Picks an unused slug from a read-only org list (does not mutate). */
function uniqueOrgSlug(
  db: Pick<Db, "organizations">,
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
  db: Pick<Db, "organizations">,
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
  db: Pick<Db, "organizations">,
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
  db: Db,
  orgId: string,
  actorUserId: string,
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
  };
}

export interface DeleteOrganizationResult {
  deleteMembershipIds: string[];
}

/**
 * Validates owner delete and returns membership ids to remove. Does not mutate
 * `db` — DB FK cascade handles projects; evidence remains append-only.
 */
export function deleteOrganization(
  db: Db,
  orgId: string,
  actorUserId: string,
): DeleteOrganizationResult {
  const index = buildOrgMembershipIndex(db.memberships);
  if (roleInOrg(index, orgId, actorUserId) !== "owner") {
    throw new PublicError("Only the organization owner can delete the organization.");
  }
  const org = db.organizations.find((candidate) => candidate.id === orgId);
  if (!org) throw new PublicError("Organization not found.");
  return {
    deleteMembershipIds: membershipsForOrg(index, orgId).map(
      (membership) => membership.id,
    ),
  };
}
