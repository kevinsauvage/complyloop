import type { OrgMembership, OrgRole, Organization } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { isOrgRole } from "@/core/rbac";
import type { Db } from "./db";
import { slugifyOrgName, uniqueOrgSlug } from "./org-slug";

/** In-memory indexes over memberships — build once when a call path looks up more than once. */
export type OrgMembershipIndex = {
  byUserId: Map<string, OrgMembership[]>;
  byOrgId: Map<string, OrgMembership[]>;
};

export function buildOrgMembershipIndex(
  memberships: readonly OrgMembership[],
): OrgMembershipIndex {
  const byUserId = new Map<string, OrgMembership[]>();
  const byOrgId = new Map<string, OrgMembership[]>();
  for (const membership of memberships) {
    const orgList = byOrgId.get(membership.orgId);
    if (orgList) orgList.push(membership);
    else byOrgId.set(membership.orgId, [membership]);
    if (membership.userId) {
      const userList = byUserId.get(membership.userId);
      if (userList) userList.push(membership);
      else byUserId.set(membership.userId, [membership]);
    }
  }
  return { byUserId, byOrgId };
}

function membershipsForOrg(
  index: OrgMembershipIndex,
  orgId: string,
): OrgMembership[] {
  return index.byOrgId.get(orgId) ?? [];
}

function roleInOrg(
  index: OrgMembershipIndex,
  orgId: string,
  userId: string,
): OrgRole | undefined {
  return membershipsForOrg(index, orgId).find(
    (membership) => membership.userId === userId,
  )?.role;
}

export function userRoleInOrg(
  db: Db,
  orgId: string,
  userId: string,
): OrgRole | undefined {
  return roleInOrg(buildOrgMembershipIndex(db.memberships), orgId, userId);
}

function assertCanAssignRole(actorRole: OrgRole, role: OrgRole): void {
  if (role === "owner") {
    throw new PublicError("Cannot invite another owner; transfer is not supported.");
  }
  if (role === "admin" && actorRole !== "owner") {
    throw new PublicError("Only org owners can invite or assign admins.");
  }
}

function assertCanManageTarget(
  actorRole: OrgRole,
  targetRole: OrgRole,
  action: "remove" | "change",
): void {
  if (targetRole === "owner") {
    throw new PublicError(
      action === "remove"
        ? "Cannot remove the organization owner."
        : "Cannot change the organization owner's role.",
    );
  }
  if (targetRole === "admin" && actorRole !== "owner") {
    throw new PublicError("Only org owners can change or remove admins.");
  }
}

/** Returns a new or updated membership; does not mutate `db`. */
export function inviteOrgMember(
  db: Db,
  orgId: string,
  actorUserId: string,
  githubLogin: string,
  role: OrgRole,
): OrgMembership {
  const index = buildOrgMembershipIndex(db.memberships);
  const actorRole = roleInOrg(index, orgId, actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new PublicError("Only org owners and admins can invite members.");
  }
  assertCanAssignRole(actorRole, role);
  const login = githubLogin.trim().replace(/^@/, "");
  if (!login) throw new PublicError("GitHub login is required.");
  if (!isOrgRole(role)) {
    throw new PublicError("Invalid role.");
  }

  const existing = membershipsForOrg(index, orgId).find(
    (membership) =>
      membership.githubLogin.toLowerCase() === login.toLowerCase(),
  );
  if (existing) {
    assertCanManageTarget(actorRole, existing.role, "change");
    return { ...existing, role };
  }

  return {
    id: crypto.randomUUID(),
    orgId,
    role,
    githubLogin: login,
    createdAt: new Date().toISOString(),
  };
}

/** Validates removal; caller persists via `deleteMembershipIds`. */
export function removeOrgMember(
  db: Db,
  orgId: string,
  actorUserId: string,
  membershipId: string,
): void {
  const index = buildOrgMembershipIndex(db.memberships);
  const actorRole = roleInOrg(index, orgId, actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new PublicError("Only org owners and admins can remove members.");
  }
  const target = membershipsForOrg(index, orgId).find(
    (membership) => membership.id === membershipId,
  );
  if (!target) throw new PublicError("Membership not found.");
  assertCanManageTarget(actorRole, target.role, "remove");
}

/**
 * Updates a non-owner member's role. Cannot promote to owner (transfer is
 * unsupported). Pending invites (no userId yet) can have their role adjusted
 * before they sign in. Returns a copy; does not mutate `db`.
 */
export function changeOrgMemberRole(
  db: Db,
  orgId: string,
  actorUserId: string,
  membershipId: string,
  role: OrgRole,
): OrgMembership {
  if (!isOrgRole(role)) {
    throw new PublicError("Invalid role.");
  }
  const index = buildOrgMembershipIndex(db.memberships);
  const actorRole = roleInOrg(index, orgId, actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new PublicError("Only org owners and admins can change member roles.");
  }
  assertCanAssignRole(actorRole, role);
  const target = membershipsForOrg(index, orgId).find(
    (membership) => membership.id === membershipId,
  );
  if (!target) throw new PublicError("Membership not found.");
  assertCanManageTarget(actorRole, target.role, "change");
  return { ...target, role };
}

/** Personal owner org — fallback when no active org is selected. */
function defaultOrgIdForUser(
  db: Pick<Db, "memberships">,
  userId: string,
): string | undefined {
  const owned = (buildOrgMembershipIndex(db.memberships).byUserId.get(userId) ?? []).find(
    (membership) => membership.role === "owner",
  );
  return owned?.orgId;
}

/** Organizations the user belongs to (claimed memberships only). */
export function orgsForUser(
  db: Pick<Db, "organizations" | "memberships">,
  userId: string,
): Organization[] {
  const index = buildOrgMembershipIndex(db.memberships);
  const orgIds = new Set(
    (index.byUserId.get(userId) ?? []).map((membership) => membership.orgId),
  );
  return db.organizations.filter((org) => orgIds.has(org.id));
}

/**
 * Picks the org the signed-in user is working in: preferred id when still a
 * member, otherwise personal owner org, otherwise first membership.
 */
export function resolveActiveOrgId(
  db: Pick<Db, "organizations" | "memberships">,
  userId: string,
  preferredOrgId: string | null | undefined,
): string | undefined {
  const membershipOrgs = orgsForUser(db, userId);
  if (membershipOrgs.length === 0) return undefined;

  if (
    preferredOrgId &&
    membershipOrgs.some((org) => org.id === preferredOrgId)
  ) {
    return preferredOrgId;
  }

  return defaultOrgIdForUser(db, userId) ?? membershipOrgs[0]?.id;
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

/** True when the user may invite/remove members for this org. */
export function canManageOrgMembers(
  db: Db,
  orgId: string,
  userId: string,
): boolean {
  const role = userRoleInOrg(db, orgId, userId);
  return role === "owner" || role === "admin";
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
