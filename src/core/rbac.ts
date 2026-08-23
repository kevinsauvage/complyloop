import { ORG_ROLES, type OrgMembership, type OrgRole, type Project } from "./project-types";

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

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && ORG_ROLES.some((role) => role === value);
}

/**
 * Resolves the caller's membership for a project's org, if any.
 * Legacy projects without orgId fall back to connector ownership.
 */
function membershipForProject(
  project: Project,
  memberships: ReadonlyArray<OrgMembership>,
  userId: string | null | undefined,
): OrgMembership | undefined {
  if (!userId) return undefined;
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
  // Owned projects without orgId yet (pre-migration) stay private to the owner.
  // Unscoped projects without an owner are treated as public read/assess/remediate.
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
