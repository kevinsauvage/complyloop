import { canOnProject, type Permission } from "@/core/rbac";
import type { Project } from "@/core/types";
import { userCanConnectProjects } from "./connect-policy";
import type { AccessContext } from "./project-visibility";

export interface ProjectCapabilities {
  canView: boolean;
  canAssess: boolean;
  canRemediate: boolean;
  canConnect: boolean;
}

export function projectCapabilities(
  project: Project | null,
  access: AccessContext,
  activeOrgId?: string | null,
): ProjectCapabilities {
  if (!project) {
    // Unsigned users still see the connect panel so they can sign in.
    const signedInConnect =
      Boolean(access.userId) &&
      userCanConnectProjects(
        access.memberships,
        access.userId as string,
        activeOrgId,
      );
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
