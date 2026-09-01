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

function membershipForProject(
  project: Project,
  memberships: ReadonlyArray<OrgMembership>,
  userId: string,
): OrgMembership | undefined {
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
  if (!userId) return false;
  const membership = membershipForProject(project, memberships, userId);
  if (!membership) return false;
  return roleHasPermission(membership.role, permission);
}
