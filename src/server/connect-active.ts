import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { Db } from "./db";
import { ConnectError } from "./connect-error";
import { accessFromStore, isProjectVisible } from "./project-visibility";

/** Validates the viewer can access `projectId` (active selection is cookie-scoped). */
export function setActiveProject(
  db: Db,
  projectId: string,
  userId?: string | null,
): Project {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new ConnectError("Unknown project.");
  if (!isProjectVisible(project, accessFromStore(db, userId))) {
    throw new ConnectError("You do not have access to that project.");
  }
  return project;
}
