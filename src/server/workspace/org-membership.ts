import "server-only";

import type {
  OrgMembership,
  OrgRole,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { isOrgRole } from "@/core/rbac";

import {
  buildOrgMembershipIndex,
  membershipsForOrg,
  roleInOrg,
} from "./org-queries";

function assertCanAssignRole(actorRole: OrgRole, role: OrgRole): void {
  if (role === "owner") {
    throw new PublicError(
      "Cannot invite another owner; transfer is not supported.",
    );
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

/** Finds an org membership by GitHub login (case-insensitive, `@`-tolerant). */
export function findOrgMembershipByLogin(
  db: WorkspaceSlice,
  orgId: string,
  githubLogin: string,
): OrgMembership | undefined {
  const login = githubLogin.trim().replace(/^@/, "").toLowerCase();
  if (!login) return undefined;
  return membershipsForOrg(buildOrgMembershipIndex(db.memberships), orgId).find(
    (membership) => membership.githubLogin.toLowerCase() === login,
  );
}

/** Returns a new or updated membership; does not mutate `db`. */
export function inviteOrgMember(
  db: WorkspaceSlice,
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

  const existing = findOrgMembershipByLogin(db, orgId, login);
  if (existing) {
    assertCanManageTarget(actorRole, existing.role, "change");
    return { ...existing, role };
  }

  return {
    id: crypto.randomUUID(),
    orgId,
    role,
    // Store lowercase so invite lookup / claim / listOrgIds stay aligned.
    githubLogin: login.toLowerCase(),
    createdAt: new Date().toISOString(),
  };
}

/** Validates removal; caller persists via `deleteMembershipIds`. */
export function removeOrgMember(
  db: WorkspaceSlice,
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
 * Self-removal: any member may leave their own org. Blocked when the actor
 * is the last remaining owner while other members exist (would orphan
 * admin), or the last member outright (delete the org instead). Returns the
 * removed membership id; caller persists via `deleteMembershipIds`.
 */
export function leaveOrgMember(
  db: WorkspaceSlice,
  orgId: string,
  actorUserId: string,
): { removedMembershipId: string } {
  const members = membershipsForOrg(
    buildOrgMembershipIndex(db.memberships),
    orgId,
  );
  const target = members.find(
    (membership) => membership.userId === actorUserId,
  );
  if (!target) throw new PublicError("You are not a member of that organization.");
  if (members.length <= 1) {
    throw new PublicError(
      "You are the last member — delete the organization instead of leaving it.",
    );
  }
  if (target.role === "owner") {
    const otherOwner = members.some(
      (membership) =>
        membership.role === "owner" && membership.userId !== actorUserId,
    );
    if (!otherOwner) {
      throw new PublicError(
        "You are the last owner — assign another owner before leaving.",
      );
    }
  }
  return { removedMembershipId: target.id };
}

/**
 * Updates a non-owner member's role. Cannot promote to owner (transfer is
 * unsupported). Pending invites (no userId yet) can have their role adjusted
 * before they sign in. Returns a copy; does not mutate `db`.
 */
export function changeOrgMemberRole(
  db: WorkspaceSlice,
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
    throw new PublicError(
      "Only org owners and admins can change member roles.",
    );
  }
  assertCanAssignRole(actorRole, role);
  const target = membershipsForOrg(index, orgId).find(
    (membership) => membership.id === membershipId,
  );
  if (!target) throw new PublicError("Membership not found.");
  assertCanManageTarget(actorRole, target.role, "change");
  return { ...target, role };
}
