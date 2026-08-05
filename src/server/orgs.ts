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

export function defaultOrgIdForUser(db: Db, userId: string): string | undefined {
  const owned = db.memberships.find(
    (membership) =>
      membership.userId === userId && membership.role === "owner",
  );
  return owned?.orgId;
}

export function projectOrg(db: Db, project: Project): Organization | undefined {
  if (!project.orgId) return undefined;
  return db.organizations.find((org) => org.id === project.orgId);
}
