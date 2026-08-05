import type { OrgMembership, OrgRole, Project } from "./types";

export type Permission =
  | "project.view"
  | "project.assess"
  | "project.remediate"
  | "project.connect"
  | "org.manage_members";

const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  viewer: ["project.view"],
  member: ["project.view", "project.assess", "project.remediate"],
  admin: [
    "project.view",
    "project.assess",
    "project.remediate",
    "project.connect",
    "org.manage_members",
  ],
  owner: [
    "project.view",
    "project.assess",
    "project.remediate",
    "project.connect",
    "org.manage_members",
  ],
};

export function permissionsForRole(role: OrgRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isOrgRole(value: unknown): value is OrgRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

/**
 * Resolves the caller's membership for a project's org, if any.
 * Legacy projects without orgId fall back to connector ownership.
 */
export function membershipForProject(
  project: Project,
  memberships: ReadonlyArray<OrgMembership>,
  userId: string | null | undefined,
): OrgMembership | undefined {
  if (!userId) return undefined;
  if (!project.orgId) {
    return undefined;
  }
  return memberships.find(
    (membership) =>
      membership.orgId === project.orgId && membership.userId === userId,
  );
}

export function canOnProject(
  project: Project,
  memberships: ReadonlyArray<OrgMembership>,
  userId: string | null | undefined,
  permission: Permission,
): boolean {
  // Unscoped demos (sample / unsigned local): anyone can view/assess/remediate.
  // Owned projects without orgId yet (pre-migration) stay private to the owner.
  if (!project.orgId) {
    if (project.ownerUserId) {
      if (!userId || project.ownerUserId !== userId) return false;
      return permission !== "org.manage_members";
    }
    if (permission === "project.connect") return false;
    if (
      permission === "project.view" ||
      permission === "project.assess" ||
      permission === "project.remediate"
    ) {
      return true;
    }
    return false;
  }

  const membership = membershipForProject(project, memberships, userId);
  if (!membership) {
    // Legacy fallback while migrating: connector retains access.
    if (
      userId &&
      project.ownerUserId === userId &&
      permission !== "org.manage_members"
    ) {
      return true;
    }
    return false;
  }
  return roleHasPermission(membership.role, permission);
}
