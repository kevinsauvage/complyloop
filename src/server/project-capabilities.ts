import { canOnProject, roleHasPermission, type Permission } from "@/core/rbac";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { AccessContext } from "./project-visibility";

export interface ProjectCapabilities {
  canView: boolean;
  canAssess: boolean;
  canRemediate: boolean;
  canConnect: boolean;
}

function canConnectInOrg(
  access: AccessContext,
  activeOrgId: string | null | undefined,
): boolean {
  if (!access.userId || !activeOrgId) return false;
  const membership = access.memberships.find(
    (candidate) =>
      candidate.orgId === activeOrgId && candidate.userId === access.userId,
  );
  if (!membership) return false;
  return roleHasPermission(membership.role, "project.connect");
}

export function projectCapabilities(
  project: Project | null,
  access: AccessContext,
  activeOrgId?: string | null,
): ProjectCapabilities {
  if (!project) {
    // Unsigned users still see the connect panel so they can sign in.
    const signedInConnect = canConnectInOrg(access, activeOrgId);
    return {
      canView: false,
      canAssess: false,
      canRemediate: false,
      canConnect: signedInConnect || !access.userId,
    };
  }

  const check = (permission: Permission) =>
    canOnProject(project, access.memberships, access.userId, permission);
  return {
    canView: check("project.view"),
    canAssess: check("project.assess"),
    canRemediate: check("project.remediate"),
    canConnect: check("project.connect"),
  };
}
