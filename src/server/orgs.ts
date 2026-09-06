import type { OrgMembership, OrgRole, Organization } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { isOrgRole } from "@/core/rbac";
import type { Db } from "./db";
import { slugifyOrgName, uniqueOrgSlug } from "./org-slug";
import { removeProjectScopedRecords } from "./project-cascade";

/** Claims invite rows that match this GitHub login by attaching userId. */
export function claimMembershipsForLogin(
  db: Db,
  userId: string,
  githubLogin: string,
): boolean {
  const login = githubLogin.trim().toLowerCase();
  if (!login) return false;
  let changed = false;
  for (const membership of db.memberships) {
    if (
      membership.githubLogin.toLowerCase() === login &&
      membership.userId !== userId
    ) {
      membership.userId = userId;
      changed = true;
    }
  }
  return changed;
}

export interface EnsurePersonalOrgResult {
  org: Organization;
  /** True when the store was mutated and should be persisted. */
  changed: boolean;
}

/** Ensures the signed-in user has a personal org (as owner). */
export function ensurePersonalOrg(
  db: Db,
  userId: string,
  githubLogin: string,
): EnsurePersonalOrgResult {
  const changed = claimMembershipsForLogin(db, userId, githubLogin);

  const owned = db.memberships.find(
    (membership) =>
      membership.userId === userId && membership.role === "owner",
  );
  if (owned) {
    const org = db.organizations.find(
      (candidate) => candidate.id === owned.orgId,
    );
    if (org) {
      return { org, changed };
    }
  }

  const label = githubLogin.trim() || userId.slice(0, 8);
  const org = pushOrgWithOwner(db, {
    name: `${label}'s workspace`,
    slugBase: label,
    ownerUserId: userId,
    githubLogin: label,
  });
  return { org, changed: true };
}

export function membershipsForOrg(
  db: Db,
  orgId: string,
): OrgMembership[] {
  return db.memberships.filter((membership) => membership.orgId === orgId);
}

export function userRoleInOrg(
  db: Db,
  orgId: string,
  userId: string,
): OrgRole | undefined {
  return db.memberships.find(
    (membership) =>
      membership.orgId === orgId && membership.userId === userId,
  )?.role;
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

export function inviteOrgMember(
  db: Db,
  orgId: string,
  actorUserId: string,
  githubLogin: string,
  role: OrgRole,
): OrgMembership {
  const actorRole = userRoleInOrg(db, orgId, actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new PublicError("Only org owners and admins can invite members.");
  }
  assertCanAssignRole(actorRole, role);
  const login = githubLogin.trim().replace(/^@/, "");
  if (!login) throw new PublicError("GitHub login is required.");
  if (!isOrgRole(role)) {
    throw new PublicError("Invalid role.");
  }

  const existing = db.memberships.find(
    (membership) =>
      membership.orgId === orgId &&
      membership.githubLogin.toLowerCase() === login.toLowerCase(),
  );
  if (existing) {
    assertCanManageTarget(actorRole, existing.role, "change");
    existing.role = role;
    return existing;
  }

  const membership: OrgMembership = {
    id: crypto.randomUUID(),
    orgId,
    role,
    githubLogin: login,
    createdAt: new Date().toISOString(),
  };
  db.memberships.push(membership);
  return membership;
}

export function removeOrgMember(
  db: Db,
  orgId: string,
  actorUserId: string,
  membershipId: string,
): void {
  const actorRole = userRoleInOrg(db, orgId, actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new PublicError("Only org owners and admins can remove members.");
  }
  const target = db.memberships.find(
    (membership) =>
      membership.id === membershipId && membership.orgId === orgId,
  );
  if (!target) throw new PublicError("Membership not found.");
  assertCanManageTarget(actorRole, target.role, "remove");
  db.memberships = db.memberships.filter(
    (membership) => membership.id !== membershipId,
  );
}

/**
 * Updates a non-owner member's role. Cannot promote to owner (transfer is
 * unsupported). Pending invites (no userId yet) can have their role adjusted
 * before they sign in.
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
  const actorRole = userRoleInOrg(db, orgId, actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new PublicError("Only org owners and admins can change member roles.");
  }
  assertCanAssignRole(actorRole, role);
  const target = db.memberships.find(
    (membership) =>
      membership.id === membershipId && membership.orgId === orgId,
  );
  if (!target) throw new PublicError("Membership not found.");
  assertCanManageTarget(actorRole, target.role, "change");
  target.role = role;
  return target;
}

/** Personal owner org — fallback when no active org is selected. */
function defaultOrgIdForUser(db: Db, userId: string): string | undefined {
  const owned = db.memberships.find(
    (membership) =>
      membership.userId === userId && membership.role === "owner",
  );
  return owned?.orgId;
}

/** Organizations the user belongs to (claimed memberships only). */
export function orgsForUser(db: Db, userId: string): Organization[] {
  const orgIds = new Set(
    db.memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => membership.orgId),
  );
  return db.organizations.filter((org) => orgIds.has(org.id));
}

/**
 * Picks the org the signed-in user is working in: preferred id when still a
 * member, otherwise personal owner org, otherwise first membership.
 */
export function resolveActiveOrgId(
  db: Db,
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

export function createOrganization(
  db: Db,
  input: { name: string; creatorUserId: string; githubLogin: string },
): Organization {
  const name = input.name.trim();
  if (!name) throw new PublicError("Organization name is required.");
  const login = input.githubLogin.trim();
  if (!login) throw new PublicError("GitHub login is required.");

  return pushOrgWithOwner(db, {
    name,
    slugBase: name,
    ownerUserId: input.creatorUserId,
    githubLogin: login,
  });
}

function pushOrgWithOwner(
  db: Db,
  input: {
    name: string;
    slugBase: string;
    ownerUserId: string;
    githubLogin: string;
  },
): Organization {
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
  db.organizations.push(org);
  db.memberships.push(membership);
  return org;
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
  if (userRoleInOrg(db, orgId, actorUserId) !== "owner") {
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
    memberships: membershipsForOrg(db, orgId).map((membership) => ({
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

/**
 * Deletes an organization owned by the actor: projects + mutable scoped
 * records + memberships. Evidence rows are retained (append-only).
 */
export function deleteOrganization(
  db: Db,
  orgId: string,
  actorUserId: string,
): void {
  if (userRoleInOrg(db, orgId, actorUserId) !== "owner") {
    throw new PublicError("Only the organization owner can delete the organization.");
  }
  const org = db.organizations.find((candidate) => candidate.id === orgId);
  if (!org) throw new PublicError("Organization not found.");

  const projectIds = db.projects
    .filter((project) => project.orgId === orgId)
    .map((project) => project.id);
  for (const projectId of projectIds) {
    removeProjectScopedRecords(db, projectId);
  }
  db.projects = db.projects.filter((project) => project.orgId !== orgId);
  db.memberships = db.memberships.filter(
    (membership) => membership.orgId !== orgId,
  );
  db.organizations = db.organizations.filter(
    (candidate) => candidate.id !== orgId,
  );
}
