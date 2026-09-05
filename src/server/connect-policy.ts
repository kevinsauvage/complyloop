import type { OrgMembership } from "@complyloop/domain/project-types";
import { roleHasPermission } from "@/core/rbac";

export function userCanConnectProjects(
  memberships: ReadonlyArray<OrgMembership>,
  userId: string,
  orgId: string | null | undefined,
): boolean {
  if (!orgId) return false;
  const membership = memberships.find(
    (candidate) =>
      candidate.orgId === orgId && candidate.userId === userId,
  );
  if (!membership) return false;
  return roleHasPermission(membership.role, "project.connect");
}
