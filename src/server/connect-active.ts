import type { Project } from "@/core/types";
import type { Db } from "./db";
import { ConnectError } from "./connect-url";
import {
  type AccessContext,
  isProjectVisible,
} from "./project-visibility";

export function accessForUser(db: Db, userId: string | null | undefined): AccessContext {
  return {
    userId,
    organizations: db.organizations,
    memberships: db.memberships,
  };
}

export function setActiveProject(
  db: Db,
  projectId: string,
  userId?: string | null,
): Project {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new ConnectError(`Unknown project: ${projectId}`);
  if (!isProjectVisible(project, accessForUser(db, userId))) {
    throw new ConnectError("You do not have access to that project.");
  }
  db.activeProjectId = project.id;
  return project;
}

