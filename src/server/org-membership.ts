import type { OrgMembership, OrgRole } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { isOrgRole } from "@/core/rbac";
import type { Db } from "@complyloop/db/types";
import {
  buildOrgMembershipIndex,
  membershipsForOrg,
  roleInOrg,
} from "./org-queries";

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
