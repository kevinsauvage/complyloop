import { canOnProject, type Permission } from "@/core/rbac";
import type { Project } from "@/core/types";
import type { AccessContext } from "./project-visibility";

export interface ProjectCapabilities {
  canView: boolean;
  canAssess: boolean;
  canRemediate: boolean;
  canConnect: boolean;
}

export function projectCapabilities(
  project: Project,
  access: AccessContext,
): ProjectCapabilities {
  const check = (permission: Permission) =>
    canOnProject(project, access.memberships, access.userId, permission);
  return {
    canView: check("project.view"),
    canAssess: check("project.assess"),
    canRemediate: check("project.remediate"),
    canConnect: check("project.connect"),
  };
}
