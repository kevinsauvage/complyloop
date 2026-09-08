import type { OrgMembership, OrgRole, Organization } from "@complyloop/analysis-core/contract/project-types";
import type { Db } from "@complyloop/db/types";

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

export function membershipsForOrg(
  index: OrgMembershipIndex,
  orgId: string,
): OrgMembership[] {
  return index.byOrgId.get(orgId) ?? [];
}

export function roleInOrg(
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

/** True when the user may invite/remove members for this org. */
export function canManageOrgMembers(
  db: Db,
  orgId: string,
  userId: string,
): boolean {
  const role = userRoleInOrg(db, orgId, userId);
  return role === "owner" || role === "admin";
}
