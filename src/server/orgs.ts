import type { OrgMembership, OrgRole, Organization, Project } from "@/core/types";
import { isOrgRole } from "@/core/rbac";
import type { Db } from "./db";

function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : "org";
}

function uniqueSlug(db: Db, base: string): string {
  if (!db.organizations.some((org) => org.slug === base)) return base;
  let index = 2;
  while (db.organizations.some((org) => org.slug === `${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

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

/**
 * Ensures the signed-in user has a personal org (as owner) and migrates any
 * of their legacy GitHub projects onto that org.
 */
export function ensurePersonalOrg(
  db: Db,
  userId: string,
  githubLogin: string,
): EnsurePersonalOrgResult {
  let changed = claimMembershipsForLogin(db, userId, githubLogin);

  const owned = db.memberships.find(
    (membership) =>
      membership.userId === userId && membership.role === "owner",
  );
  if (owned) {
    const org = db.organizations.find(
      (candidate) => candidate.id === owned.orgId,
    );
    if (org) {
      if (attachLegacyProjects(db, userId, org.id)) changed = true;
      return { org, changed };
    }
  }

  const label = githubLogin.trim() || userId.slice(0, 8);
  const org: Organization = {
    id: crypto.randomUUID(),
    name: `${label}'s workspace`,
    slug: uniqueSlug(db, slugify(label)),
    createdAt: new Date().toISOString(),
  };
  const membership: OrgMembership = {
    id: crypto.randomUUID(),
    orgId: org.id,
    role: "owner",
    userId,
    githubLogin: label,
    createdAt: new Date().toISOString(),
  };
  db.organizations.push(org);
  db.memberships.push(membership);
  attachLegacyProjects(db, userId, org.id);
  return { org, changed: true };
}

function attachLegacyProjects(
  db: Db,
  userId: string,
  orgId: string,
): boolean {
  let changed = false;
  for (const project of db.projects) {
    if (project.ownerUserId === userId && !project.orgId) {
      project.orgId = orgId;
      changed = true;
    }
  }
  return changed;
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

export function inviteOrgMember(
  db: Db,
  orgId: string,
  actorUserId: string,
  githubLogin: string,
  role: OrgRole,
): OrgMembership {
  if (role === "owner") {
    throw new Error("Cannot invite another owner; transfer is not supported.");
  }
  const actorRole = userRoleInOrg(db, orgId, actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new Error("Only org owners and admins can invite members.");
  }
  const login = githubLogin.trim().replace(/^@/, "");
  if (!login) throw new Error("GitHub login is required.");
  if (!isOrgRole(role)) {
    throw new Error("Invalid role.");
  }

  const existing = db.memberships.find(
    (membership) =>
      membership.orgId === orgId &&
      membership.githubLogin.toLowerCase() === login.toLowerCase(),
  );
  if (existing) {
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
    throw new Error("Only org owners and admins can remove members.");
  }
  const target = db.memberships.find(
    (membership) =>
      membership.id === membershipId && membership.orgId === orgId,
  );
  if (!target) throw new Error("Membership not found.");
  if (target.role === "owner") {
    throw new Error("Cannot remove the organization owner.");
  }
  db.memberships = db.memberships.filter(
    (membership) => membership.id !== membershipId,
  );
}

/** Personal owner org — fallback when no active org is selected. */
export function defaultOrgIdForUser(db: Db, userId: string): string | undefined {
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
  if (!name) throw new Error("Organization name is required.");
  const login = input.githubLogin.trim();
  if (!login) throw new Error("GitHub login is required.");

  const org: Organization = {
    id: crypto.randomUUID(),
    name,
    slug: uniqueSlug(db, slugify(name)),
    createdAt: new Date().toISOString(),
  };
  const membership: OrgMembership = {
    id: crypto.randomUUID(),
    orgId: org.id,
    role: "owner",
    userId: input.creatorUserId,
    githubLogin: login,
    createdAt: new Date().toISOString(),
  };
  db.organizations.push(org);
  db.memberships.push(membership);
  return org;
}

export function projectOrg(db: Db, project: Project): Organization | undefined {
  if (!project.orgId) return undefined;
  return db.organizations.find((org) => org.id === project.orgId);
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
