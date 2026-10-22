import "server-only";

import { notFound } from "next/navigation";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import {
  type ProjectCapabilities,
  projectCapabilities,
} from "./project-capabilities";
import { isProjectVisible } from "./project-visibility";
import { getWorkspace, type Workspace } from "./workspace";

export interface ProjectPage extends Workspace {
  project: Project;
  caps: ProjectCapabilities;
}

/**
 * Read entry for a project page: tenancy plus the project named in the URL,
 * authorized against the viewer's memberships. An unknown or invisible id is a
 * 404 — never a fallback to another project, since the URL is the only source
 * of truth for which project a page shows.
 */
export async function loadProjectPage(projectId: string): Promise<ProjectPage> {
  const workspace = await getWorkspace();
  const project = workspace.projects.find(
    (candidate) => candidate.id === projectId,
  );
  if (!project || !isProjectVisible(project, workspace.access)) notFound();
  return {
    ...workspace,
    project,
    caps: projectCapabilities(project, workspace.access, workspace.activeOrgId),
  };
}
